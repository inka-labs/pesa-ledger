import { describe, expect, it } from "vitest";
import { Book, emptyYear } from "./ledger";
import { starterSettings } from "./example";
import { allocate, askOrder, bucketOf, defineBucket, judge, period, placedByYou, RULES, ruleById } from "./allocation";
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

describe("bucket definitions", () => {
  it("give every bucket of every rule a question and examples", () => {
    for (const r of RULES) for (const b of r.buckets) {
      const d = defineBucket(r, b);
      expect(d.test, `${r.id}/${b.id}`).toMatch(/\?$/);
      expect(d.inc, `${r.id}/${b.id}`).not.toBe("");
    }
  });

  it("send what doesn't belong to the rule's own bucket, never back to itself", () => {
    const r = rule("30-30-30-10");
    const house = defineBucket(r, r.buckets.find((b) => b.id === "house")!);
    expect(house.exc).toContain("Bills (electricity, water, Wi‑Fi, garbage) and household things → Other living costs");
    expect(house.exc).toContain("Furniture and upgrades you could put off → Wants");
    const spend = rule("80-20").buckets.find((b) => b.id === "spend")!;
    expect(defineBucket(rule("80-20"), spend).exc.join()).not.toContain("Everything else");
    // a sinking fund only has its own home where the rule has a jar for it
    expect(defineBucket(r, r.buckets.find((b) => b.id === "save")!).exc).toEqual([]);
    const jars = rule("six-jars");
    expect(defineBucket(jars, jars.buckets.find((b) => b.role === "save" || b.role === "invest")!).exc[0]).toMatch(/Long-term savings$/);
  });

  it("ask the narrow questions before the broad ones", () => {
    expect(askOrder(rule("30-30-30-10")).map((b) => b.id)).toEqual(["save", "house", "living", "fun"]);
  });

  it("use your own words for a bucket you made", () => {
    const l = ledger();
    l.settings.allocation = { rule: "custom", custom: [{ id: "a", name: "Fixed", pct: 60, kind: "max", means: "Bills that arrive whatever I do?" }, { id: "b", name: "Rest", pct: 40, kind: "max", means: "x" }] };
    const r = ruleById(new Book(l, TODAY), "custom")!;
    expect(defineBucket(r, r.buckets[0])).toEqual({ test: "Bills that arrive whatever I do?", inc: "", exc: [] });
  });

  it("tell a category you placed from one guessed by name", () => {
    const l = ledger(), r = rule("50-30-20");
    l.settings.allocation = { rule: r.id, maps: { [r.id]: { "c:ess_0": "needs", "g:fam": "wants" } } };
    const b = new Book(l, TODAY);
    expect(placedByYou(b, r, "ess_0")).toBe(true);
    expect(placedByYou(b, r, "fam_1")).toBe(true); // its group was placed
    expect(placedByYou(b, r, "ess_4")).toBe(false);
  });
});
