/** Fixes from the November 2026 review: each case is a figure that used to come out wrong. */
import { describe, expect, it } from "vitest";
import { buildCSV, importCSV } from "./csv";
import { starterSettings } from "./example";
import { payFund } from "./edit";
import { compact, parseAmount, pct } from "./format";
import { healthStats } from "./health";
import { Book, emptyYear } from "./ledger";
import { readMoney } from "./money";
import type { Ledger } from "./types";

const TODAY = { y: 2026, m: 10 };

describe("reading amounts", () => {
  it("takes commas only as thousands separators", () => {
    expect(parseAmount("12,500")).toBe(12_500);
    expect(parseAmount("1,200,000.50")).toBe(1_200_000.5);
    expect(parseAmount("KES 1,500")).toBe(1_500);
    for (const s of ["1,5", "1.200,50", "12,50", "1,2345", ",500"]) expect(parseAmount(s), s).toBeNaN();
  });

  it("refuses what Number() would quietly accept", () => {
    expect(parseAmount("1e3")).toBeNaN();
    expect(parseAmount("0x10")).toBeNaN();
  });

  it("reads accountants' negatives", () => {
    expect(parseAmount("(500)")).toBe(-500);
    expect(parseAmount("-KES 500")).toBe(-500);
    expect(readMoney("(1,500)", "KES", null)).toEqual({ value: -1_500 });
    expect(readMoney("-KES 500", "KES", null)).toEqual({ value: -500 });
  });

  it("says why a decimal comma isn't read", () => {
    const r = readMoney("1,5", "KES", null);
    expect("error" in r && r.error).toMatch(/Commas only separate thousands/);
  });
});

describe("showing numbers", () => {
  it("never shows NaN, Infinity or 1000k", () => {
    expect(pct(NaN)).toBe("–");
    expect(pct(Infinity)).toBe("–");
    expect(compact(999_600)).toBe("1M");
    expect(compact(999_400)).toBe("999k");
    expect(compact(NaN)).toBe("–");
  });
});

function fundLedger(due: string): Ledger {
  const settings = starterSettings();
  settings.cats.find((c) => c.id === "snk_0")!.fund = { target: 60_000, due, start: 0, from: "2025-01", every: 1 };
  return { settings, years: {} };
}

describe("a bill paid late", () => {
  it("doesn't start the next cycle already overdue", () => {
    const l = fundLedger("2026-03");
    payFund(l, "snk_0", 60_000, 60_000, TODAY);
    expect(l.settings.cats.find((c) => c.id === "snk_0")!.fund!.due).toBe("2026-11");
  });

  it("is unchanged when paid on time", () => {
    const l = fundLedger("2026-10");
    payFund(l, "snk_0", 60_000, 60_000, TODAY);
    expect(l.settings.cats.find((c) => c.id === "snk_0")!.fund!.due).toBe("2026-11");
  });
});

describe("a month still under way", () => {
  function months(oct: Record<string, number>): Ledger {
    const y = emptyYear();
    for (const m of ["07", "08", "09"]) y.actual[m] = { inc_0: 100_000, ess_0: 50_000 };
    y.actual["10"] = oct;
    return { settings: starterSettings(), years: { "2026": y } };
  }

  it("isn't 'in the red' before the salary is recorded", () => {
    const s = healthStats(new Book(months({ ess_0: 20_000 }), TODAY));
    expect(s.negative).toEqual([]);
    expect(s.lowIncome).toBe(100_000);
  });

  it("counts once income is in", () => {
    const s = healthStats(new Book(months({ inc_0: 100_000, ess_0: 20_000 }), TODAY));
    expect(s.months).toBe(4);
  });

  it("doesn't pull expected income down", () => {
    expect(new Book(months({ inc_0: 10_000 }), TODAY).expectedIncome().amount).toBe(100_000);
  });
});

describe("a month's own budget", () => {
  it("leaves the year adding up to the yearly plan, in whole units", () => {
    const y = emptyYear();
    y.plan = { ess_0: 100 };
    y.budget = { "12": { ess_0: 50 } };
    const b = new Book({ settings: starterSettings(), years: { "2026": y } }, TODAY);
    expect(b.planMonthly(2026, 1, "ess_0")).toBe(4);
    expect(b.planMonthly(2026, 11, "ess_0")).toBe(10); // the last free month takes the remainder
    expect(b.planYear(2026, "ess_0")).toBe(100);
  });

  it("with no budgets of their own, months still add up", () => {
    const y = emptyYear();
    y.plan = { ess_0: 100 };
    const b = new Book({ settings: starterSettings(), years: { "2026": y } }, TODAY);
    expect(b.planYear(2026, "ess_0")).toBe(100);
    expect(Number.isInteger(b.planMonthly(2026, 1, "ess_0"))).toBe(true);
  });
});

describe("importing a CSV into a ledger that has figures", () => {
  const SHEET = `year,month,group,category,amount,note
2026,1,Essentials,Rent,18000,"paid late, again"
2026,1,,,,Rent went up`;

  it("doesn't repeat notes when an export is imported back", () => {
    const first = importCSV(SHEET, null).ledger;
    const again = importCSV(buildCSV(first), first).ledger;
    expect(again.years["2026"].notes["01"]).toBe(first.years["2026"].notes["01"]);
  });

  it("puts a row with no group in the category it already has", () => {
    const first = importCSV(SHEET, null).ledger;
    const before = first.settings.cats.filter((c) => c.name === "Rent").length;
    const next = importCSV("year,month,group,category,amount\n2026,2,,Rent,19000", first).ledger;
    expect(next.settings.cats.filter((c) => c.name === "Rent").length).toBe(before);
  });

  it("reads 2026-03 in the month column", () => {
    const r = importCSV("year,month,category,amount\n2026,2026-03,Rent,18000", null);
    expect(r.count).toBe(1);
    expect(Object.keys(r.ledger.years["2026"].actual)).toEqual(["03"]);
  });
});
