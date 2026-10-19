/** Numbers as people read them: whole units with thousands separators, a real minus sign. */

const whole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const upTo2 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

export function money(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "–";
  const r = Math.round(v);
  return (r < 0 ? "−" : "") + whole.format(Math.abs(r));
}

export function compact(v: number): string {
  const a = Math.abs(v), s = v < 0 ? "−" : "";
  if (a >= 1e6) return s + (a / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, "") + "M";
  if (a >= 1e3) return s + Math.round(a / 1e3) + "k";
  return s + Math.round(a);
}

/** 0.123 -> "12%", 0.0123 -> "1.2%" (no sign: the arrow beside it carries it) */
export function pct(p: number): string {
  const a = Math.abs(p) * 100;
  return (a >= 10 ? Math.round(a) : a.toFixed(a < 10 && a > 0 ? 1 : 0).replace(/\.0$/, "")) + "%";
}

/** What someone typed into an amount box: "18,000", "KES 1500", "" (none), "-" (none). NaN when unreadable. */
export function parseAmount(s: string): number | null {
  // a currency in front of the number ("KES 1,500", "$20") is dropped; any other letters make it unreadable
  const t = String(s ?? "").replace(/[,\s_]/g, "").replace(/^([A-Za-z]{2,4}|[$€£])(?=[-−\d.])/, "").replace(/^−/, "-");
  if (t === "" || t === "-" || t === "–") return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : NaN;
}

export function amountText(v: number | null | undefined): string {
  return v == null ? "" : upTo2.format(v);
}
