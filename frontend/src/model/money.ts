/** Amounts in other currencies: what someone types ("USD 415", "$415", "415 eur") and the live rates
 *  the local server fetches (backend/pesa_ledger/rates.py). */

import { tidyAmount } from "./format";
import type { OtherCurrency, Settings } from "./types";

export type Rates = {
  base: string;
  /** units of each currency per 1 base: with base KES, rates.USD ≈ 0.0077 */
  rates: Record<string, number>;
  date: string;
  source: string;
  source_url?: string;
  fetched_at: number;
  stale: boolean;
  error?: string;
};

const SYMBOLS: Record<string, string> = { $: "USD", US$: "USD", "€": "EUR", "£": "GBP", KSH: "KES", KSHS: "KES" };

export type Read =
  | { value: number | null; converted?: { code: string; amount: number; perUnit: number } }
  | { error: string };

/** Read an amount, converting it to `base` when it names another currency. */
export function readMoney(text: string, base: string, rates: Rates | null): Read {
  const t = tidyAmount(text);
  if (t == null) return { error: "Commas only separate thousands, like 18,000. For decimals use a point: 1.5." };
  if (t === "" || t === "-") return { value: null };
  // "-KES 500" and "KES -500" both mean −500
  const neg = t.startsWith("-") && /^-(US\$|[$€£]|[A-Za-z]{3,4})/.test(t);
  const m = (neg ? t.slice(1) : t).match(/^(US\$|[$€£]|[A-Za-z]{3,4})?(-?(?:\d+\.?\d*|\.\d+))([A-Za-z]{3,4})?$/);
  if (!m || (m[1] && m[3])) return { error: "Enter a number, like 18,000 or USD 415." };
  const amount = (neg ? -1 : 1) * Number(m[2]);
  if (!Number.isFinite(amount)) return { error: "Enter a number, like 18,000 or USD 415." };
  const raw = (m[1] || m[3] || "").toUpperCase();
  const code = SYMBOLS[raw] ?? SYMBOLS[m[1] ?? ""] ?? raw;
  if (!code || code === base.toUpperCase()) return { value: amount };
  if (!/^[A-Z]{3}$/.test(code)) return { error: `${raw} isn't a currency code. Use three letters, like USD.` };
  const rate = rates?.rates[code];
  if (!rate) return { error: rates ? `There's no exchange rate for ${code}.` : "Exchange rates haven't loaded yet, so other currencies can't be converted." };
  return { value: Math.round((amount / rate) * 100) / 100, converted: { code, amount, perUnit: 1 / rate } };
}

/** Units of the main currency per 1 of the second currency: the live rate unless set by hand. */
/** Main-currency units per 1 of another currency: the live rate, or the one set by hand. */
export function rateFor(c: OtherCurrency, rates: Rates | null): number | null {
  if (!c.code) return null;
  if (c.auto !== false) {
    const r = rates?.rates[c.code.toUpperCase()];
    return r ? 1 / r : c.rate ?? null;
  }
  return c.rate ?? null;
}

/** Every other currency to show amounts in, with its rate (those without one yet are left out). */
export function altRates(settings: Settings, rates: Rates | null): { code: string; rate: number }[] {
  const list = settings.alts?.length ? settings.alts : settings.alt?.code ? [settings.alt] : [];
  return list.flatMap((c) => { const rate = rateFor(c, rates); return rate ? [{ code: c.code.toUpperCase(), rate }] : []; });
}

/** The first other currency's rate (kept for callers that show just one). */
export function altRate(settings: Settings, rates: Rates | null): number | null {
  return altRates(settings, rates)[0]?.rate ?? null;
}
