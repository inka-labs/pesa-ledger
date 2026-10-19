/** Small pieces every view uses: amount boxes, deltas, KPI tiles, swatches, year pickers. */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { amountText, money, pct } from "../model/format";
import type { Group } from "../model/types";
import { useApp } from "../context";

/** A number box that keeps what you type until you leave it (Enter or Tab), then commits.
 *  Blank means "no figure". "USD 415" or "$415" is converted to the main currency at the live rate.
 *  Escape puts the saved value back. Unreadable input is flagged, not saved. */
export function AmountInput(props: {
  value: number | null;
  onCommit: (v: number | null) => void;
  placeholder?: string;
  label: string;
  className?: string;
  title?: string;
  id?: string;
}) {
  const { value, onCommit, placeholder, label, className, title, id } = props;
  const { read, notify, book } = useApp();
  const [draft, setDraft] = useState(amountText(value));
  const [bad, setBad] = useState("");
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) { setDraft(amountText(value)); setBad(""); }
  }, [value]);
  const commit = () => {
    const r = read(draft);
    if ("error" in r) { setBad(r.error); return; }
    setBad("");
    if (r.converted) {
      const { code, amount, perUnit } = r.converted;
      notify(`${code} ${amountText(amount)} → ${book.settings.currency} ${money(r.value)} at 1 ${code} = ${perUnit.toFixed(2)} ${book.settings.currency}`);
    }
    if (r.value !== value) onCommit(r.value);
    setDraft(amountText(r.value));
  };
  return (
    <input
      id={id}
      className={`amt ${className ?? ""} ${bad ? "invalid" : ""}`}
      inputMode="decimal"
      value={draft}
      placeholder={placeholder ?? "0"}
      aria-label={label}
      aria-invalid={bad ? true : undefined}
      title={bad || title || "A number, or another currency like USD 415"}
      onFocus={(e) => { focused.current = true; e.currentTarget.select(); }}
      onChange={(e) => { setDraft(e.target.value); if (bad) setBad(""); }}
      onBlur={() => { focused.current = false; commit(); }}
      onKeyDown={(e) => {
        if (e.key === "Enter") { commit(); e.currentTarget.blur(); }
        if (e.key === "Escape") { setDraft(amountText(value)); setBad(""); }
      }}
    />
  );
}

/** Text committed when you leave the box (names, notes): saves one change, not one per keystroke. */
export function TextInput(props: { value: string; onCommit: (v: string) => void; label: string; placeholder?: string; className?: string; style?: React.CSSProperties; multiline?: boolean; id?: string }) {
  const { value, onCommit, label, placeholder, className, style, multiline, id } = props;
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setDraft(value); }, [value]);
  const common = {
    id, className, style, value: draft, placeholder, "aria-label": label,
    onFocus: () => (focused.current = true),
    onBlur: () => { focused.current = false; if (draft !== value) onCommit(draft); },
  };
  return multiline ? (
    <textarea {...common} onChange={(e) => setDraft(e.target.value)} />
  ) : (
    <input {...common} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
  );
}

export function Swatch({ g }: { g: Pick<Group, "slot"> }) {
  return <span className="sw" style={{ background: `var(--s${g.slot ?? 0})` }} />;
}

/** "▲ 12% vs Sep", coloured by whether the move is good news. */
export function Delta({ cur, prev, upGood, label }: { cur: number | null; prev: number | null; upGood: boolean; label: string }) {
  if (cur == null || prev == null) return <span className="muted">No {label} figure</span>;
  if (prev === 0 && cur === 0) return <span className="muted">Same as {label}</span>;
  if (prev === 0) return <span className="muted">New vs {label}</span>;
  const p = (cur - prev) / Math.abs(prev);
  if (Math.abs(p) < 0.005) return <span className="muted">Same as {label}</span>;
  const up = p > 0;
  return (
    <span>
      <span className={up === upGood ? "d-good" : "d-bad"}>{up ? "▲" : "▼"} {pct(p)}</span> <span className="muted">vs {label}</span>
    </span>
  );
}

export function Kpi({ label, value, lead, children }: { label: string; value: number; lead?: boolean; children?: ReactNode }) {
  const { book } = useApp();
  return (
    <div className={`kpi${lead ? " lead" : ""}`}>
      <span className="lbl">{label}</span>
      <span className="v"><span className="cc">{book.settings.currency}</span>{money(value)}</span>
      <span className="sub">{children}</span>
    </div>
  );
}

/** "≈ USD 1,234" in the second currency, when one is set. */
export function Alt({ v }: { v: number }) {
  const { book, altRate } = useApp();
  const code = book.settings.alt?.code;
  if (!code || !altRate) return null;
  return <span>≈ {code} {money(v / altRate)}</span>;
}

export function YearSelect({ value, onChange, id, label }: { value: number; onChange: (y: number) => void; id: string; label: string }) {
  const { book } = useApp();
  return (
    <select id={id} aria-label={label} value={value} onChange={(e) => onChange(Number(e.target.value))}>
      {book.knownYears().map((y) => <option key={y} value={y}>{y}</option>)}
    </select>
  );
}
