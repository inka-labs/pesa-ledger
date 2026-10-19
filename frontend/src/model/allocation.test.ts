import { describe, expect, it } from "vitest";
import { Book, emptyYear } from "./ledger";
import { starterSettings } from "./example";
import { allocate, bucketOf, judge, period, RULES, ruleById } from "./allocation";
import { healthChecks } from "./health";
import type { Ledger } from "./types";

const TODAY = { y: 2026, m: 10 };
const rule = (id: string) => RULES.find((r) => r.id === id)!;

function ledger(): Ledger {
  const settings = starterSettings();
  const y = emptyYear();
  // income 100k: rent 30k, food 10k, parents 10k, entertainment 10k, MMF 20k → 20k left over
  y.actual["10"] = { inc_0: 100_000, ess_0: 30_000, ess_4: 10_000, fam_0: 10_000, snk_2: 10_000, sav_0: 20_000 };
  y.actual["09"] = { ...y.actual["10"] };
  return { settings, years: { "2026": y } };
}

describe("allocation rules", () => {
  it("put categories in buckets by how they count and what they're called", () => {
    const b = new Book(ledger(), TODAY), r = rule("50-30-20");
    expect(bucketOf(b, r, "sav_0")).toBe("save");
    expect(bucketOf(b, r, "ess_0")).toBe("needs");
    expect(bucketOf(b, r, "fam_0")).toBe("needs"); // giving falls into needs when the rule has no giving bucket
    expect(bucketOf(b, r, "snk_2")).toBe("wants"); // Entertainment, though its group is Sinking funds
    expect(bucketOf(b, r, "inc_0")).toBeNull();
    expect(bucketOf(b, rule("10-10-80"), "fam_0")).toBe("give");
    expect(bucketOf(b, rule("30-30-30-10"), "ess_0")).toBe("house");
    // "Sinking funds" isn't fun: its bills are needs, or the long-term jar where a rule has one
    expect(bucketOf(b, r, "snk_0")).toBe("needs");
    expect(bucketOf(b, rule("six-jars"), "snk_1")).toBe("ltss");
    expect(bucketOf(b, rule("six-jars"), "snk_2")).toBe("play");
  });

  it("follow what the person chose, for a category over its group", () => {
    const l = ledger();
    l.settings.allocation = { maps: { "50-30-20": { "g:ess": "wants", "c:ess_0": "needs" } } };
    const b = new Book(l, TODAY), r = rule("50-30-20");
    expect(bucketOf(b, r, "ess_4")).toBe("wants");
    expect(bucketOf(b, r, "ess_0")).toBe("needs");
  });

  it("split a period into shares of income, counting what's left over as savings", () => {
    const b = new Book(ledger(), TODAY);
    const a = allocate(b, rule("50-30-20"), b.monthTotals(2026, 10));
    const by = Object.fromEntries(a.rows.map((r) => [r.bucket.id, r]));
    expect(by.needs.share).toBeCloseTo(0.5);
    expect(by.wants.share).toBeCloseTo(0.1);
    expect(by.save.share).toBeCloseTo(0.4); // 20k saved + 20k left over
    expect(by.save.leftover).toBe(20_000);
    expect(a.score).toBe(3);
    const l = ledger();
    l.settings.allocation = { leftover: false };
    const off = allocate(new Book(l, TODAY), rule("50-30-20"), new Book(l, TODAY).monthTotals(2026, 10));
    expect(off.unassigned).toBe(20_000);
  });

  it("judge at-most, at-least and about targets", () => {
    expect([judge("max", 0.51, 50), judge("max", 0.56, 50), judge("max", 0.7, 50)]).toEqual(["good", "warn", "bad"]);
    expect([judge("min", 0.25, 20), judge("min", 0.17, 20), judge("min", 0.05, 20)]).toEqual(["good", "warn", "bad"]);
    expect([judge("target", 0.11, 10), judge("target", 0.16, 10)]).toEqual(["good", "warn"]);
  });

  it("measure budgets against recorded income, or expected income for months ahead", () => {
    const l = ledger();
    l.years["2026"].budget = { "11": { ess_0: 30_000, sav_0: 25_000 } };
    const p = period(new Book(l, TODAY), "next");
    expect(p.actual).toBeNull();
    expect(p.budget!.income).toBe(100_000);
    expect(p.budget!.saved).toBe(25_000);
  });

  it("use the person's own split, and feed the Health page", () => {
    const l = ledger();
    l.settings.allocation = { rule: "custom", custom: [{ id: "keep", name: "Savings", pct: 30, kind: "min" }, { id: "rest", name: "Rest", pct: 70, kind: "max" }] };
    const b = new Book(l, TODAY);
    expect(ruleById(b, "custom")!.buckets.map((x) => x.id)).toEqual(["keep", "rest"]);
    expect(bucketOf(b, ruleById(b, "custom")!, "sav_0")).toBe("keep");
    const check = healthChecks(b).find((c) => c.id === "rule")!;
    expect(check.title).toBe("Matches Your own split");
    expect(check.tone).toBe("good");
  });
});
