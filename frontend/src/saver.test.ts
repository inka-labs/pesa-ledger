import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./api";
import { DELAY, RETRY, Saver, type SaveState } from "./saver";

function setup(fail: (key: string, n: number) => Error | null = () => null) {
  const writes: string[] = [];
  const states: SaveState[] = [];
  let n = 0;
  let inFlight = 0, maxInFlight = 0;
  const saver = new Saver(async (key) => {
    inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
    await Promise.resolve();
    inFlight--;
    const err = fail(key, n++);
    if (err) throw err;
    writes.push(key);
  }, (s) => states.push(s));
  return { saver, writes, states, last: () => states[states.length - 1], maxInFlight: () => maxInFlight };
}

describe("Saver", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("saves each touched part once, shortly after the last change", async () => {
    const t = setup();
    t.saver.touch("y:2026");
    t.saver.touch("y:2026", "settings");
    expect(t.writes).toEqual([]);
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(t.writes).toEqual(["y:2026", "settings"]);
    expect(t.last()).toEqual({ kind: "saved" });
    expect(t.saver.pending).toBe(false);
  });

  it("never runs two saves at once, and saveNow waits for the one running", async () => {
    const t = setup();
    t.saver.touch("settings");
    const first = t.saver.flush();
    t.saver.touch("y:2026");
    const second = t.saver.flush();
    expect(await first).toBe(true);
    expect(await second).toBe(true);
    expect(t.writes).toEqual(["settings", "y:2026"]);
    expect(t.maxInFlight()).toBe(1);
  });

  it("keeps a failed part and tries it again on its own", async () => {
    const t = setup((_k, n) => (n === 0 ? new ApiError(0, "Pesa Ledger isn't running.") : null));
    t.saver.touch("y:2026");
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(t.last()).toMatchObject({ kind: "error", message: "Pesa Ledger isn't running." });
    expect(t.saver.pending).toBe(true);
    await vi.advanceTimersByTimeAsync(RETRY[0]);
    expect(t.writes).toEqual(["y:2026"]);
    expect(t.last()).toEqual({ kind: "saved" });
  });

  it("says when the browser was signed out, and waits for Try again", async () => {
    let signedIn = false;
    const t = setup(() => (signedIn ? null : new ApiError(401, "Not signed in.")));
    t.saver.touch("settings");
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(t.last()).toMatchObject({ kind: "error", signedOut: true });
    await vi.advanceTimersByTimeAsync(RETRY[RETRY.length - 1] * 2);
    expect(t.writes).toEqual([]); // no retry loop against a signed-out server
    signedIn = true;
    expect(await t.saver.flush()).toBe(true);
    expect(t.writes).toEqual(["settings"]);
  });

  it("flush reports false while something couldn't be saved (a backup would miss it)", async () => {
    const t = setup(() => new ApiError(500, "Disk full"));
    t.saver.touch("y:2026");
    expect(await t.saver.flush()).toBe(false);
  });

  it("clear forgets what's waiting (a restore replaced it)", async () => {
    const t = setup();
    t.saver.touch("y:2026");
    t.saver.clear();
    await vi.advanceTimersByTimeAsync(DELAY * 4);
    expect(t.writes).toEqual([]);
    expect(t.saver.pending).toBe(false);
  });
});
