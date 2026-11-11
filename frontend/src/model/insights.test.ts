import { describe, expect, it } from "vitest";
import { starterSettings } from "./example";
import { addEntry } from "./edit";
import { flags, monthStory, pace, usual } from "./insights";
import { Book, emptyYear } from "./ledger";
import type { Ledger } from "./types";

const TODAY = { y: 2026, m: 11 };
const NOW = new Date(2026, 10, 10); // 10 November 2026

/** Aug–Oct: salary 100k, rent 30k, food 20k, transport 5k → 6k → 8k; savings 10k. */
function ledger(): Ledger {
  const y = emptyYear();
  const food = [20_000, 20_000, 20_000], transport = [5_000, 6_000, 8_000];
  ["08", "09", "10"].forEach((m, i) => (y.actual[m] = { inc_0: 100_000, ess_0: 30_000, ess_4: food[i], ess_5: transport[i], sav_0: 10_000 }));
  y.plan = { ess_0: 360_000, ess_4: 240_000, ess_5: 72_000 };
  return { settings: starterSettings(), years: { "2026": y } };
}

describe("usual", () => {
  it("is the average over the last three months with figures", () => {
    expect(usual(new Book(ledger(), TODAY), TODAY, "ess_5")).toEqual({ amount: 6_000, months: 3, times: 3 });
  });

  it("isn't moved by one big bill", () => {
    const l = ledger();
    ["08", "09", "10"].forEach((m, i) => (l.years["2026"].actual[m].snk_0 = [35_000, 0, 0][i]));
    expect(usual(new Book(l, TODAY), TODAY, "snk_0").amount).toBe(0);
  });
});

describe("the month in words", () => {
  it("compares with a usual month and names what moved most", () => {
    const l = ledger();
    l.years["2026"].actual["11"] = { inc_0: 100_000, ess_0: 30_000, ess_4: 26_000, ess_5: 4_000, sav_0: 10_000 };
    const s = monthStory(new Book(l, { y: 2026, m: 12 }), TODAY)!;
    expect(s.title).toBe("November 2026 in words");
    expect(s.lines[0]).toBe("100,000 came in, about the same as usual.");
    expect(s.lines[1]).toMatch(/^You spent 60,000, \d+% more than usual\.$/);
    expect(s.lines[2]).toBe("Food & groceries rose by 6,000; Transport fell by 2,000.");
    expect(s.lines.some((x) => x.startsWith("You saved 10,000, 10% of what came in."))).toBe(true);
  });

  it("is nothing for a month with no figures", () => {
    expect(monthStory(new Book(ledger(), TODAY), { y: 2026, m: 1 })).toBeNull();
  });
});

describe("pace", () => {
  it("carries expenses added as they happen at their daily rate, takes typed totals as done, and expects budgets elsewhere", () => {
    const l = ledger();
    l.years["2026"].actual["11"] = { ess_0: 30_000 }; // rent typed in
    for (let i = 0; i < 5; i++) addEntry(l, 2026, 11, "ess_4", { amount: 2_000, day: i + 1 }); // food: 10,000 by the 10th
    const p = pace(new Book(l, TODAY), NOW)!;
    expect(p.day).toBe(10);
    expect(p.spent).toBe(40_000);
    // rent 30,000 + food 10,000/10 × 30 = 30,000 + transport (nothing yet) its budget 6,000
    expect(p.projected).toBe(66_000);
    expect(p.budget).toBe(56_000); // rent 30,000 + food 20,000 + transport 6,000
    expect(p.gap).toBe(10_000);
    expect(p.drivers[0].c.id).toBe("ess_4"); // food is heading 10,000 over
  });

  it("projects only what was added one at a time; a typed total on top is taken as done", () => {
    const l = ledger();
    l.years["2026"].actual["11"] = { ess_4: 18_000 }; // most of food typed in as a total
    for (let i = 0; i < 2; i++) addEntry(l, 2026, 11, "ess_4", { amount: 500, day: 5 }); // then 1,000 added
    const p = pace(new Book(l, TODAY), NOW)!;
    // food: 18,000 typed + 1,000 added → 18,000 + 1,000/10 × 30 = 21,000
    expect(p.projected).toBe(21_000 + 30_000 + 6_000);
  });

  it("is only for the calendar month under way", () => {
    expect(pace(new Book(ledger(), TODAY), new Date(2026, 11, 3))).toBeNull();
  });
});

describe("missed and unusual", () => {
  it("flags a category recorded every recent month that's still empty", () => {
    const l = ledger();
    l.years["2026"].actual["11"] = { inc_0: 100_000, ess_0: 30_000, ess_4: 5_000 };
    const f = flags(new Book(l, TODAY), NOW);
    expect(f.find((x) => x.kind === "missed" && x.cid === "ess_5")?.text).toBe("Transport: nothing recorded yet. It's usually about 6,000 a month.");
    expect(f.some((x) => x.kind === "missed" && x.cid === "ess_4")).toBe(false);
  });

  it("flags spending well above its usual month", () => {
    const l = ledger();
    l.years["2026"].actual["11"] = { ess_4: 32_000 };
    expect(flags(new Book(l, TODAY), NOW).find((x) => x.kind === "high")?.text).toBe("Food & groceries is at 32,000 — usually about 20,000.");
  });

  it("flags three months of rises", () => {
    expect(flags(new Book(ledger(), TODAY), NOW).find((x) => x.kind === "rising")?.text).toBe("Transport has risen three months running: 5,000 → 6,000 → 8,000 (Oct).");
  });

  it("nudges when nothing has been added for a few days, for people who add expenses", () => {
    const l = ledger();
    addEntry(l, 2026, 11, "ess_4", { amount: 500, day: 4 });
    expect(flags(new Book(l, TODAY), NOW).find((x) => x.kind === "quiet")?.text).toBe("Nothing added for 6 days. Anything since the 4th?");
    expect(flags(new Book(ledger(), TODAY), NOW).some((x) => x.kind === "quiet")).toBe(false); // never used Add expense
  });

  it("leaves one-off categories alone", () => {
    const l = ledger();
    l.settings.cats.push({ id: "car", name: "Car", group: "ess", oneoff: true });
    ["08", "09", "10"].forEach((m) => (l.years["2026"].actual[m].car = 1_000));
    expect(flags(new Book(l, TODAY), NOW).some((x) => x.cid === "car")).toBe(false);
  });
});

describe("a month's review", () => {
  it("lays out the totals beside usual, and the biggest moves first", async () => {
    const { review } = await import("./insights");
    const l = ledger();
    l.years["2026"].actual["11"] = { inc_0: 100_000, ess_0: 30_000, ess_4: 26_000, ess_5: 4_000, sav_0: 10_000 };
    const r = review(new Book(l, { y: 2026, m: 12 }), TODAY)!;
    expect(r.rows.find((x) => x.key === "income")).toMatchObject({ value: 100_000, usual: 100_000 });
    expect(r.moves.map((x) => [x.c.id, x.d])).toEqual([["ess_4", 6_000], ["ess_5", -2_000]]);
    expect(r.savedRate).toBeCloseTo(0.1);
  });
});

describe("pace with a pay cycle", () => {
  it("runs from payday to the day before the next one", () => {
    const l = ledger();
    l.settings.paycycle = { payday: 31 };
    l.years["2026"].actual["10"] = { ...l.years["2026"].actual["10"] }; // October's pay pays for November
    const p = pace(new Book(l, { y: 2026, m: 10 }), new Date(2026, 10, 11))!; // 11 Nov
    expect(p.days).toBe(30); // 31 Oct – 29 Nov
    expect(p.day).toBe(12);
    expect([p.end.getDate(), p.end.getMonth() + 1]).toEqual([29, 11]);
  });

  it("is nothing outside the period", () => {
    const l = ledger();
    l.settings.paycycle = { payday: 25 };
    expect(pace(new Book(l, { y: 2026, m: 10 }), new Date(2026, 10, 30))).toBeNull();
  });
});
