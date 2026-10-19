/** Amounts in other currencies: what someone types ("USD 415", "$415", "415 eur") and the live rates
 *  the local server fetches (backend/pesa_ledger/rates.py). */

import type { Settings } from "./types";

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
  const t = String(text ?? "").replace(/[,\s_]/g, "").replace(/−/g, "-");
  if (t === "" || t === "-" || t === "–") return { value: null };
  const m = t.match(/^(US\$|[$€£]|[A-Za-z]{3,4})?(-?\d*\.?\d+)([A-Za-z]{3,4})?$/);
  if (!m || (m[1] && m[3])) return { error: "Enter a number, like 18,000 or USD 415." };
  const amount = Number(m[2]);
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
export function altRate(settings: Settings, rates: Rates | null): number | null {
  const alt = settings.alt;
  if (!alt?.code) return null;
  if (alt.auto !== false) {
    const r = rates?.rates[alt.code.toUpperCase()];
    return r ? 1 / r : alt.rate ?? null;
  }
  return alt.rate ?? null;
}
