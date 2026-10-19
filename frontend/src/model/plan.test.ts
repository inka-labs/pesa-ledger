import { describe, expect, it } from "vitest";
import { Book, emptyYear } from "./ledger";
import { starterSettings } from "./example";
import { payFund, setBalance } from "./edit";
import { efTargetMonths, healthChecks, healthStats } from "./health";
import type { Ledger } from "./types";

const TODAY = { y: 2026, m: 10 };

function ledger(): Ledger {
  const settings = starterSettings();
  const rent = settings.cats.find((c) => c.id === "ess_0")!;
  rent.repeat = 42_500;
  settings.cats.find((c) => c.id === "snk_0")!.fund = { target: 60_000, due: "2027-01", start: 10_000, from: "2026-07", every: 12 };
  settings.accounts = [{ id: "mmf", name: "MMF", cats: ["sav_0"] }, { id: "loan", name: "Loan", debt: true, cats: [] }];
  const y26 = emptyYear(), y25 = emptyYear();
  for (let m = 1; m <= 10; m++) {
    y26.actual[String(m).padStart(2, "0")] = { inc_0: 300_000, ess_0: 18_000, ess_4: 20_000, sav_0: 60_000 };
    y25.actual[String(m).padStart(2, "0")] = { inc_0: 280_000, ess_0: 18_000, ess_4: 18_000, sav_0: 60_000 };
  }
  y26.actual["07"].snk_0 = 10_000;
  y26.actual["08"].snk_0 = 10_000;
  y26.budget = { "11": { snk_0: 10_000 }, "12": { snk_0: 10_000 } };
  return { settings, years: { "2025": y25, "2026": y26 } };
}

describe("repeating amounts", () => {
  it("are the budget when none is set, and never for income", () => {
    const b = new Book(ledger(), TODAY);
    expect(b.planMonthly(2027, 3, "ess_0")).toBe(42_500);
    const l = ledger();
    l.settings.cats.find((c) => c.id === "inc_0")!.repeat = 300_000;
    expect(new Book(l, TODAY).planMonthly(2027, 3, "inc_0")).toBeNull();
  });

  it("list what hasn't been recorded for a month yet", () => {
    const b = new Book(ledger(), TODAY);
    expect(b.unpaid(2026, 10).map((c) => c.id)).toEqual([]);
    expect(b.unpaid(2026, 11).map((c) => c.id)).toEqual(["ess_0"]);
  });
});

describe("sinking funds", () => {
  it("count what's been put in since the fund started, and project the budget to the due month", () => {
    const f = new Book(ledger(), TODAY).fund("snk_0")!;
    expect(f.saved).toBe(30_000); // 10,000 already there + Jul + Aug
    expect(f.monthsLeft).toBe(4); // Oct (nothing yet) to Jan
    expect(f.planned).toBe(20_000); // Nov and Dec budgets
    expect(f.status).toBe("short");
    expect(f.short).toBe(10_000);
    expect(f.neededPerMonth).toBe(7_500);
  });

  it("say how much more than the bill they'll hold", () => {
    const l = ledger();
    l.settings.cats.find((c) => c.id === "snk_0")!.fund!.target = 25_000;
    const f = new Book(l, TODAY).fund("snk_0")!;
    expect(f.status).toBe("ready");
    expect(f.over).toBe(5_000);
  });

  it("start the next cycle when the bill is paid, carrying over what's left", () => {
    const l = ledger();
    payFund(l, "snk_0", 70_000, 60_000, TODAY);
    expect(l.settings.cats.find((c) => c.id === "snk_0")!.fund).toMatchObject({ start: 10_000, from: "2026-11", due: "2028-01" });
    const once = ledger();
    once.settings.cats.find((c) => c.id === "snk_0")!.fund!.every = 0;
    payFund(once, "snk_0", 60_000, 60_000, TODAY);
    expect(once.settings.cats.find((c) => c.id === "snk_0")!.fund).toBeUndefined();
  });
});

describe("net worth", () => {
  it("carries each account's latest balance forward and subtracts debts", () => {
    const l = ledger();
    setBalance(l, 2026, 8, "mmf", 500_000);
    setBalance(l, 2026, 9, "mmf", 566_000);
    setBalance(l, 2026, 8, "loan", 100_000);
    const b = new Book(l, TODAY);
    expect(b.netWorth({ y: 2026, m: 10 })).toMatchObject({ total: 466_000, assets: 566_000, debts: 100_000 });
    expect(b.netWorth({ y: 2026, m: 7 })).toBeNull();
  });

  it("separates growth from what was put in", () => {
    const l = ledger();
    setBalance(l, 2026, 8, "mmf", 500_000);
    setBalance(l, 2026, 9, "mmf", 566_000); // 60,000 put in, so 6,000 earned
    expect(new Book(l, TODAY).growth(2026, 9, "mmf")).toBe(6_000);
    expect(new Book(l, TODAY).growth(2026, 8, "mmf")).toBeNull();
  });
});

describe("health", () => {
  it("measures the last 12 months, leaving one-offs out", () => {
    const l = ledger();
    l.years["2026"].actual["09"].ess_4 = 520_000;
    l.years["2026"].oneoff = { "09": { ess_4: { amount: 500_000 } } };
    const s = healthStats(new Book(l, TODAY));
    expect(s.months).toBe(10); // Nov 2025 – Oct 2026, and 2025 has no Nov or Dec
    expect(s.negative).toEqual([]);
    expect(s.savingsRate).toBeCloseTo(0.2, 5);
    expect(s.essentials).toBe(52_500); // the one-off doesn't count as a usual month
  });

  it("counts next month's budget as the essential costs when it's higher", () => {
    const s = healthStats(new Book(ledger(), TODAY));
    // Nov: rent 42,500 (its repeating amount) + sinking 10,000; recent months 38,000
    expect(s.essentials).toBe(52_500);
  });

  it("grades each check, and asks for what it needs", () => {
    const checks = healthChecks(new Book(ledger(), TODAY));
    const by = Object.fromEntries(checks.map((c) => [c.id, c]));
    expect(by.savings.tone).toBe("good");
    expect(by.ef.setup).toBeTruthy();
    expect(by.rent.tone).toBe("good"); // 42,500 of ~296,667
    expect(by.funds.tone).toBe("warn");
    expect(by.negative.tone).toBe("good");
  });

  it("wants a bigger emergency fund when income varies more", () => {
    expect([efTargetMonths(0.1), efTargetMonths(0.3), efTargetMonths(0.6)]).toEqual([6, 9, 12]);
  });
});
