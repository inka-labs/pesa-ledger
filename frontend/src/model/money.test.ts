import { describe, expect, it } from "vitest";
import { altRate, readMoney, type Rates } from "./money";
import { starterSettings } from "./example";

const RATES: Rates = { base: "KES", rates: { KES: 1, USD: 1 / 129, EUR: 1 / 140 }, date: "2026-10-19", source: "test", fetched_at: 0, stale: false };

describe("reading amounts in other currencies", () => {
  it("leaves plain numbers and the main currency alone", () => {
    expect(readMoney("18,000", "KES", RATES)).toEqual({ value: 18000 });
    expect(readMoney("KES 1,500", "KES", RATES)).toEqual({ value: 1500 });
    expect(readMoney("KSh 500", "KES", RATES)).toEqual({ value: 500 });
    expect(readMoney("", "KES", RATES)).toEqual({ value: null });
  });

  it("converts a code before or after, or a symbol", () => {
    for (const s of ["USD 415", "usd415", "415 USD", "$415", "US$ 415"]) {
      const r = readMoney(s, "KES", RATES);
      expect(r).toMatchObject({ value: 53535, converted: { code: "USD", amount: 415 } });
    }
    expect(readMoney("€100", "KES", RATES)).toMatchObject({ value: 14000 });
  });

  it("explains what it can't read", () => {
    expect(readMoney("abc", "KES", RATES)).toHaveProperty("error");
    expect(readMoney("GBP 10", "KES", RATES)).toEqual({ error: "There's no exchange rate for GBP." });
    expect(readMoney("USD 10", "KES", null)).toHaveProperty("error");
    expect(readMoney("USD 10 EUR", "KES", RATES)).toHaveProperty("error");
  });
});

describe("the second currency's rate", () => {
  it("uses the live rate by default and the typed one when set by hand", () => {
    const s = starterSettings();
    expect(altRate(s, RATES)).toBeCloseTo(129);
    expect(altRate({ ...s, alt: { code: "USD", rate: 125, auto: false } }, RATES)).toBe(125);
    expect(altRate({ ...s, alt: { code: "USD", rate: 125 } }, null)).toBe(125); // offline: falls back
    expect(altRate({ ...s, alt: null }, RATES)).toBeNull();
  });
});
