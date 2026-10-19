import { describe, expect, it } from "vitest";
import { buildCSV, importCSV, parseCSV } from "./csv";
import { exampleLedger } from "./example";
import { Book } from "./ledger";
import { parseAmount } from "./format";

const SHEET = `year,month,group,category,amount,note
2026,plan,Income,Salary,"6,300,000",
2026,1,Income,Salary,400000,
2026,Feb,Income,Salary,206400,
2026,1,Essentials,Rent,18000,paid late
2026,plan-11,Essentials,Rent,40000,
2026,1,,,,Contract renewed
2026,13,Essentials,Rent,1,
2026,1,Essentials,Gym,lots,
`;

describe("reading a CSV", () => {
  it("handles quotes, commas inside quotes and Windows line endings", () => {
    expect(parseCSV('a,"b,c","d ""e"""\r\n1,2,3')).toEqual([["a", "b,c", 'd "e"'], ["1", "2", "3"]]);
  });

  it("imports actuals, yearly and monthly budgets, and notes into a new ledger", () => {
    const r = importCSV(SHEET, null);
    expect(r.count).toBe(5);
    expect(r.skipped).toBe(2); // month 13, amount "lots"
    const b = new Book(r.ledger, { y: 2026, m: 10 });
    const salary = r.ledger.settings.cats.find((c) => c.name === "Salary")!;
    const rent = r.ledger.settings.cats.find((c) => c.name === "Rent")!;
    expect(b.planAnnual(2026, salary.id)).toBe(6_300_000);
    expect(b.actual(2026, 2, salary.id)).toBe(206_400);
    expect(b.planMonthly(2026, 11, rent.id)).toBe(40_000);
    expect(r.ledger.years["2026"].notes["01"]).toBe("Rent: paid late\nContract renewed");
    // only the starter groups the file uses are kept, matched by name
    expect(r.ledger.settings.groups.map((g) => g.id)).toEqual(["inc", "ess"]);
    expect(r.ledger.settings.example).toBe(false);
  });

  it("replaces example figures but adds to a real ledger", () => {
    const ex = exampleLedger({ y: 2026, m: 10 });
    expect(importCSV(SHEET, ex).ledger.years["2025"]).toBeUndefined();
    const real = { ...ex, settings: { ...ex.settings, example: false } };
    const r = importCSV(SHEET, real);
    expect(r.ledger.years["2025"]).toBeDefined();
    expect(real.years["2026"].plan.inc_0).toBeDefined(); // the original is untouched
  });

  it("refuses a file without the needed columns", () => {
    expect(() => importCSV("a,b\n1,2", null)).toThrow(/year, month, category and amount/);
  });
});

describe("round trip", () => {
  it("exports everything it can import back", () => {
    const ex = exampleLedger({ y: 2026, m: 10 });
    ex.settings.example = false;
    const back = importCSV(buildCSV(ex), null).ledger;
    const a = new Book(ex, { y: 2026, m: 10 }), b = new Book(back, { y: 2026, m: 10 });
    for (const y of [2025, 2026]) {
      expect(b.rangeTotals(y, 1, 12).spent).toBeCloseTo(a.rangeTotals(y, 1, 12).spent);
      expect(b.planRange(y, 1, 12).saved).toBeCloseTo(a.planRange(y, 1, 12).saved);
      expect(b.planRange(y, 4, 4).spent).toBeCloseTo(a.planRange(y, 4, 4).spent);
    }
    expect(back.years["2026"].notes).toEqual(ex.years["2026"].notes);
  });
});

describe("amounts people type", () => {
  it("reads separators, currency prefixes and blanks", () => {
    expect(parseAmount("18,000")).toBe(18000);
    expect(parseAmount("KES 1 500")).toBe(1500);
    expect(parseAmount("−200")).toBe(-200);
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("abc")).toBeNaN();
  });
});
