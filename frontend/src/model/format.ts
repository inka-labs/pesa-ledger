/** Numbers as people read them: whole units with thousands separators, a real minus sign. */

const whole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const upTo2 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

export function money(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "–";
  const r = Math.round(v);
  return (r < 0 ? "−" : "") + whole.format(Math.abs(r));
}

export function compact(v: number): string {
  if (!Number.isFinite(v)) return "–";
  const a = Math.abs(v), s = v < 0 ? "−" : "";
  // 999,600 rounds to 1000k: show it as 1M
  if (a >= 999_500) return s + (a / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, "") + "M";
  if (a >= 1e3) return s + Math.round(a / 1e3) + "k";
  return s + Math.round(a);
}

/** 0.123 -> "12%", 0.0123 -> "1.2%" (no sign: the arrow beside it carries it) */
export function pct(p: number): string {
  if (!Number.isFinite(p)) return "–";
  const a = Math.abs(p) * 100;
  return (a >= 10 ? Math.round(a) : a.toFixed(a < 10 && a > 0 ? 1 : 0).replace(/\.0$/, "")) + "%";
}

/** Tidy what someone typed before reading the number in it: spaces and _ go, a real minus becomes "-",
 *  "(500)" is −500, and commas are only ever thousands separators ("12,500", "1,200,000"). A comma
 *  anywhere else ("1,5", "1.200,50") is never guessed at: the result is null (unreadable). */
export function tidyAmount(s: string): string | null {
  let t = String(s ?? "").replace(/[\s_]/g, "").replace(/[−–]/g, "-");
  const paren = t.match(/^\((.*)\)$/);
  if (paren) t = paren[1].startsWith("-") ? paren[1] : "-" + paren[1];
  if (t.includes(",")) {
    if (!/^[^\d,.]*\d{1,3}(,\d{3})+(\.\d+)?[^\d,.]*$/.test(t)) return null;
    t = t.replace(/,/g, "");
  }
  return t;
}

/** What someone typed into an amount box: "18,000", "KES 1500", "" (none), "-" (none). NaN when unreadable. */
export function parseAmount(s: string): number | null {
  const tidy = tidyAmount(s);
  if (tidy == null) return NaN;
  // a currency in front of the number ("KES 1,500", "$20") is dropped; any other letters make it unreadable
  const t = tidy.replace(/^(-?)([A-Za-z]{2,4}|[$€£])(?=[-\d.])/, "$1").replace(/^--/, "-");
  if (t === "" || t === "-") return null;
  // plain digits only: Number() would also read "1e3" and "0x10"
  return /^-?(\d+\.?\d*|\.\d+)$/.test(t) ? Number(t) : NaN;
}

export function amountText(v: number | null | undefined): string {
  return v == null ? "" : upTo2.format(v);
}
