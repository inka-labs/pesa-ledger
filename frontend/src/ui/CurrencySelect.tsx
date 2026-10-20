/** Choose a currency by name: the ones people around here use most first, then every other. */

import { useApp } from "../context";

const COMMON = ["KES", "USD", "EUR", "GBP", "UGX", "TZS", "RWF", "BIF", "ETB", "SSP", "SOS", "CDF", "ZAR", "NGN", "GHS", "EGP", "AED", "SAR", "INR", "CNY", "JPY", "CHF", "CAD", "AUD"];

let names: Intl.DisplayNames | null = null;
/** "Kenyan Shilling" for KES; the code itself if the browser doesn't know it. */
export function currencyName(code: string): string {
  try {
    names ??= new Intl.DisplayNames(["en"], { type: "currency" });
    return names.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

/** Every currency code the browser or the rate service knows. */
function allCodes(rateCodes: string[]): string[] {
  let known: string[] = [];
  try { known = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("currency") ?? []; } catch { /* older browser */ }
  return [...new Set([...known, ...rateCodes].map((c) => c.toUpperCase()))].filter((c) => /^[A-Z]{3}$/.test(c)).sort();
}

export function CurrencySelect({ value, onChange, exclude = [], label, placeholder }: {
  value: string; onChange: (code: string) => void; exclude?: string[]; label: string; placeholder?: string;
}) {
  const { rates } = useApp();
  const skip = new Set(exclude.map((c) => c.toUpperCase()));
  const common = COMMON.filter((c) => !skip.has(c));
  const rest = allCodes(Object.keys(rates?.rates ?? {})).filter((c) => !skip.has(c) && !COMMON.includes(c));
  const opt = (c: string) => <option key={c} value={c}>{c} · {currencyName(c)}</option>;
  return (
    <select value={value} aria-label={label} onChange={(e) => e.target.value && onChange(e.target.value)}>
      {placeholder && <option value="">{placeholder}</option>}
      {value && !common.includes(value) && !rest.includes(value) && opt(value)}
      <optgroup label="Common">{common.map(opt)}</optgroup>
      <optgroup label="All currencies">{rest.map(opt)}</optgroup>
    </select>
  );
}
