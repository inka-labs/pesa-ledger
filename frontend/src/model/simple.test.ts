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
