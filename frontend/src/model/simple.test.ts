/** The simpler UI's edits: "Add expense" and budgets one month at a time. */
import { describe, expect, it } from "vitest";
import { addEntry, removeEntry, setActual, setMonthOnly, setUsualBudget } from "./edit";
import { starterSettings } from "./example";
import { Book, emptyYear } from "./ledger";
import type { Ledger } from "./types";

const TODAY = { y: 2026, m: 10 };
const fresh = (): Ledger => ({ settings: starterSettings(), years: { "2026": emptyYear() } });

describe("Add expense", () => {
  it("adds to the month's figure and keeps each expense", () => {
    const l = fresh();
    setActual(l, 2026, 10, "ess_4", 1_000); // a total typed in earlier
    addEntry(l, 2026, 10, "ess_4", { amount: 1_250, note: "Naivas", day: 3 });
    addEntry(l, 2026, 10, "ess_4", { amount: 300 });
    expect(new Book(l, TODAY).actual(2026, 10, "ess_4")).toBe(2_550);
    expect(l.years["2026"].entries!["10"].ess_4).toEqual([{ amount: 1_250, note: "Naivas", day: 3 }, { amount: 300 }]);
  });

  it("takes one back out", () => {
    const l = fresh();
    addEntry(l, 2026, 10, "ess_4", { amount: 1_250 });
    addEntry(l, 2026, 10, "ess_4", { amount: 300 });
    removeEntry(l, 2026, 10, "ess_4", 0);
    expect(new Book(l, TODAY).actual(2026, 10, "ess_4")).toBe(300);
    expect(l.years["2026"].entries!["10"].ess_4).toEqual([{ amount: 300 }]);
  });

  it("clears the figure when the last one goes and nothing else made it up", () => {
    const l = fresh();
    addEntry(l, 2026, 10, "ess_4", { amount: 300 });
    removeEntry(l, 2026, 10, "ess_4", 0);
    expect(new Book(l, TODAY).actual(2026, 10, "ess_4")).toBeNull();
  });

  it("goes when the figure is cleared", () => {
    const l = fresh();
    addEntry(l, 2026, 10, "ess_4", { amount: 300 });
    setActual(l, 2026, 10, "ess_4", null);
    expect(l.years["2026"].entries!["10"].ess_4).toBeUndefined();
  });

  it("doesn't drift with decimals", () => {
    const l = fresh();
    for (const a of [0.1, 0.2, 0.3]) addEntry(l, 2026, 10, "ess_4", { amount: a });
    expect(new Book(l, TODAY).actual(2026, 10, "ess_4")).toBe(0.6);
  });
});

describe("budgets a month at a time", () => {
  const b = (l: Ledger, m: number) => new Book(l, TODAY).planMonthly(2026, m, "ess_0");

  it("a usual amount is every month's", () => {
    const l = fresh();
    setUsualBudget(l, 2026, "ess_0", 40_000);
    expect([1, 6, 12].map((m) => b(l, m))).toEqual([40_000, 40_000, 40_000]);
  });

  it("a month-only amount leaves every other month where it was", () => {
    const l = fresh();
    setUsualBudget(l, 2026, "ess_0", 40_000);
    setMonthOnly(l, 2026, 11, "ess_0", 55_000);
    expect(b(l, 11)).toBe(55_000);
    expect([1, 10, 12].map((m) => b(l, m))).toEqual([40_000, 40_000, 40_000]);
    // and back to the usual amount
    setMonthOnly(l, 2026, 11, "ess_0", null);
    expect([11, 12].map((m) => b(l, m))).toEqual([40_000, 40_000]);
  });

  it("changing the usual amount keeps month-only amounts", () => {
    const l = fresh();
    setUsualBudget(l, 2026, "ess_0", 40_000);
    setMonthOnly(l, 2026, 1, "ess_0", 80_000);
    setUsualBudget(l, 2026, "ess_0", 42_000);
    expect(b(l, 1)).toBe(80_000);
    expect(b(l, 2)).toBe(42_000);
    expect(new Book(l, TODAY).planYear(2026, "ess_0")).toBe(80_000 + 11 * 42_000);
  });

  it("stays in whole units when the yearly figure doesn't divide by 12", () => {
    const l = fresh();
    l.years["2026"].plan.ess_0 = 454_000; // 37,833.33 a month
    setMonthOnly(l, 2026, 11, "ess_0", 45_000);
    for (const m of [1, 10, 12]) expect(Number.isInteger(b(l, m)), `month ${m}`).toBe(true);
    expect(b(l, 1)).toBe(37_833);
  });
});

describe("a one-off category", () => {
  function withCar(): Ledger {
    const l = fresh();
    l.settings.cats.push({ id: "car", name: "Car purchase", group: "ess", oneoff: true });
    l.years["2026"].actual["09"] = { inc_0: 100_000, ess_0: 20_000, car: 800_000 };
    l.years["2026"].plan.ess_0 = 240_000;
    return l;
  }

  it("counts all of its figure as one-off", () => {
    const b = new Book(withCar(), TODAY);
    expect(b.oneOffPart(2026, 9, "car")).toBe(800_000);
    expect(b.regular.monthTotals(2026, 9).spent).toBe(20_000);
    expect(b.monthTotals(2026, 9).spent).toBe(820_000); // still in the month's totals
    expect(b.hasOneOffs()).toBe(true);
  });

  it("isn't 'over budget': everyday spending is measured on its own", () => {
    expect(new Book(withCar(), TODAY).spendingVsBudget(2026, 9)).toEqual({ spent: 20_000, budget: 20_000, oneOff: 800_000 });
  });

  it("a one-off income category never counts towards expected income", () => {
    const l = fresh();
    l.settings.cats.push({ id: "bonus", name: "Bonus", group: "inc", oneoff: true });
    l.years["2026"].actual["09"] = { inc_0: 100_000, bonus: 300_000 };
    expect(new Book(l, TODAY).expectedIncome(1).amount).toBe(100_000);
  });
});

describe("goals", () => {
  it("count money added by hand, as well as linked categories", () => {
    const l = fresh();
    l.years["2026"].actual["09"] = { sav_0: 20_000 };
    l.settings.goals = [{ id: "g", name: "Move", target: 93_500, deadline: "2027-03", start: 0, from: "2026-01", cats: ["sav_0"],
      deposits: [{ ym: "2026-10", amount: 10_000 }, { ym: "2025-12", amount: 99_999 }] }];
    const r = new Book(l, TODAY).goal(l.settings.goals[0]);
    expect(r.saved).toBe(30_000); // the deposit before the goal started doesn't count
    expect(r.deposited).toBe(10_000);
    expect(r.average).toBe(15_000); // two months with money in
  });
});
