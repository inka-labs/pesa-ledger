import { describe, expect, it } from "vitest";
import { Book, emptyYear } from "./ledger";
import { starterSettings } from "./example";
import type { Ledger } from "./types";

const TODAY = { y: 2026, m: 10 };

function ledger(): Ledger {
  const settings = starterSettings();
  const y26 = emptyYear();
  y26.plan = { inc_0: 1_200_000, ess_0: 240_000, sav_1: 120_000 };
  y26.budget = { "11": { ess_0: 50_000 } };
  y26.actual = {
    "01": { inc_0: 100_000, ess_0: 20_000, sav_1: 10_000 },
    "09": { inc_0: 100_000, ess_0: 25_000, sav_1: 5_000 },
    "10": { inc_0: 110_000, ess_0: 21_000 },
  };
  const y25 = emptyYear();
  y25.actual = { "01": { inc_0: 90_000, ess_0: 30_000 } };
  return { settings, years: { "2025": y25, "2026": y26 } };
}

describe("totals", () => {
  it("adds income, savings and spending, and works out what's left", () => {
    const t = new Book(ledger(), TODAY).monthTotals(2026, 1);
    expect(t).toMatchObject({ income: 100_000, saved: 10_000, spent: 20_000, left: 70_000, has: true });
    expect(t.byGroup).toMatchObject({ inc: 100_000, ess: 20_000, sav: 10_000 });
  });

  it("knows an empty month from a zero month", () => {
    const b = new Book(ledger(), TODAY);
    expect(b.monthTotals(2026, 2).has).toBe(false);
    expect(b.lastDataMonth(2026)).toBe(10);
  });

  it("sums a range of months", () => {
    expect(new Book(ledger(), TODAY).rangeTotals(2026, 1, 9).income).toBe(200_000);
  });
});

describe("budgets", () => {
  it("spreads a yearly plan evenly, and a month's own budget overrides its share", () => {
    const b = new Book(ledger(), TODAY);
    expect(b.planMonthly(2026, 3, "ess_0")).toBe(20_000);
    expect(b.planMonthly(2026, 11, "ess_0")).toBe(50_000);
    expect(b.planYear(2026, "ess_0")).toBe(20_000 * 11 + 50_000);
    expect(b.planMonthly(2026, 3, "ess_1")).toBeNull();
  });

  it("forecasts with actual figures where they exist and the budget elsewhere", () => {
    const b = new Book(ledger(), TODAY);
    expect(b.forecastMonth(2026, 9)).toMatchObject({ src: "actual", spent: 25_000 });
    expect(b.forecastMonth(2026, 11)).toMatchObject({ src: "budget", income: 100_000, spent: 50_000, saved: 10_000 });
    expect(b.forecastMonth(2027, 1).src).toBe("none");
    const fy = b.forecastYear(2026);
    // 3 actual months + 9 budgeted months of income
    expect(fy.income).toBe(310_000 + 9 * 100_000);
  });

  it("looks twelve months ahead, into next year, with a running total", () => {
    const rows = new Book(ledger(), TODAY).ahead(12);
    expect(rows.map((r) => `${r.ym.y}-${r.ym.m}`).slice(0, 4)).toEqual(["2026-10", "2026-11", "2026-12", "2027-1"]);
    expect(rows[0].f.src).toBe("actual");
    expect(rows[1].running).toBe(rows[0].f.left + rows[1].f.left);
  });
});

describe("comparisons", () => {
  it("compares the same months across years, by total, group or category", () => {
    const b = new Book(ledger(), TODAY);
    expect(b.metric(2026, 1, "spent")).toBe(20_000);
    expect(b.metric(2025, 1, "spent")).toBe(30_000);
    expect(b.metric(2026, 1, "c:inc_0", 9)).toBe(200_000);
    expect(b.metric(2026, 2, "spent")).toBeNull();
    expect(b.upIsGood("spent")).toBe(false);
    expect(b.upIsGood("g:sav")).toBe(true);
    expect(b.upIsGood("c:ess_0")).toBe(false);
  });
});

describe("goals", () => {
  const goal = { id: "g", name: "Emergency fund", target: 100_000, deadline: "2026-12", start: 50_000, from: "2026-01", cats: ["sav_1"] };

  it("counts the starting amount plus what went into linked categories", () => {
    const r = new Book(ledger(), TODAY).goal(goal);
    expect(r.saved).toBe(65_000);
    expect(r.remaining).toBe(35_000);
    expect(r.monthsLeft).toBe(3); // Oct, Nov, Dec
    expect(r.average).toBe(7_500);
  });

  it("projects on the linked budget: 10k a month from October reaches 95k by December, so it's behind", () => {
    const r = new Book(ledger(), TODAY).goal(goal);
    expect(r.budgeted).toBe(true);
    expect(r.byDeadline).toBe(95_000);
    expect(r.onTrack).toBe(false);
    expect(r.onBudget).toBeNull(); // nothing is budgeted for 2027 yet
  });

  it("finds the month the budget gets there, once next year is budgeted", () => {
    const l = ledger();
    l.years["2027"] = { ...emptyYear(), plan: { sav_1: 120_000 } };
    expect(new Book(l, TODAY).goal(goal).onBudget).toEqual({ y: 2027, m: 1 });
  });

  it("is reached once the target is met", () => {
    const r = new Book(ledger(), TODAY).goal({ ...goal, start: 200_000 });
    expect(r.reached && r.onTrack).toBe(true);
    expect(r.progress).toBe(1);
  });
});
