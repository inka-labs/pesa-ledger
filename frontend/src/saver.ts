/** Writing the ledger to the local API in the background, kept apart from React so it can be tested.
 *
 *  `touch("y:2026")` marks a part as changed and saves it shortly after the last change. Saves run one
 *  after another, never two at once. A part that fails stays marked: a failed save is tried again on
 *  its own after a wait, except when the browser was signed out (then it waits for Try again, after
 *  signing in again in another tab). */

import { ApiError } from "./api";

export type SaveState = { kind: "idle" | "saving" | "saved" } | { kind: "error"; message: string; signedOut?: boolean };

export const DELAY = 500;
// after a failed save (the server stopped, a disk error), wait this long before trying again
export const RETRY = [3000, 10000, 30000, 60000];

export const SIGNED_OUT =
  "This browser was signed out, so your changes are only on this page. Open the sign-in link in another tab (pixi run open), then press Try again.";

export class Saver {
  private dirty = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private running: Promise<boolean> | null = null;
  private failures = 0;

  constructor(
    /** write one part ("settings" or "y:2026") as it is now */
    private readonly write: (key: string) => Promise<void>,
    private readonly onState: (s: SaveState) => void,
  ) {}

  /** Something still waiting to be saved, or a save under way (leaving the page should ask first). */
  get pending(): boolean {
    return this.dirty.size > 0 || this.running != null;
  }

  touch(...keys: string[]): void {
    keys.forEach((k) => this.dirty.add(k));
    this.onState({ kind: "saving" });
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), DELAY);
  }

  /** Forget what's waiting (a restored backup replaced it). */
  clear(): void {
    this.dirty.clear();
    clearTimeout(this.timer);
    clearTimeout(this.retryTimer);
  }

  /** Save now, after any save already running. True once nothing is left unsaved. */
  flush(): Promise<boolean> {
    clearTimeout(this.timer);
    const p: Promise<boolean> = (this.running ?? Promise.resolve(true)).then(() => (this.dirty.size ? this.once() : true));
    this.running = p;
    void p.finally(() => { if (this.running === p) this.running = null; });
    return p;
  }

  private async once(): Promise<boolean> {
    this.onState({ kind: "saving" });
    while (this.dirty.size) {
      const key = this.dirty.values().next().value as string;
      this.dirty.delete(key);
      try {
        await this.write(key);
      } catch (e) {
        this.dirty.add(key);
        const err = e as ApiError;
        clearTimeout(this.retryTimer);
        if (err.status === 401) {
          this.onState({ kind: "error", signedOut: true, message: SIGNED_OUT });
        } else {
          this.onState({ kind: "error", message: err.message || "The last change wasn't saved." });
          this.retryTimer = setTimeout(() => void this.flush(), RETRY[Math.min(this.failures, RETRY.length - 1)]);
          this.failures++;
        }
        return false;
      }
    }
    this.failures = 0;
    clearTimeout(this.retryTimer);
    this.onState({ kind: "saved" });
    return true;
  }
}
