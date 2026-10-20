/** Small pieces every view uses: amount boxes, deltas, KPI tiles, swatches, year pickers. */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { amountText, money, pct } from "../model/format";
import type { Group, Totals } from "../model/types";
import { colorOf } from "../model/theme";
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
        if (e.key === "Enter") e.currentTarget.blur(); // leaving the box saves it (once)
        if (e.key === "Escape") { setDraft(amountText(value)); setBad(""); }
      }}
    />
  );
}

/** Text committed when you leave the box (names, notes): saves one change, not one per keystroke.
 *  `onCommit` can return false to refuse the text (a name already in use), which puts the old one back. */
export function TextInput(props: { value: string; onCommit: (v: string) => void | boolean; label: string; placeholder?: string; className?: string; style?: React.CSSProperties; multiline?: boolean; id?: string }) {
  const { value, onCommit, label, placeholder, className, style, multiline, id } = props;
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setDraft(value); }, [value]);
  const common = {
    id, className, style, value: draft, placeholder, "aria-label": label, title: draft.length > 24 ? draft : undefined, // a long name in a narrow box, in full
    onFocus: () => (focused.current = true),
    onBlur: () => { focused.current = false; if (draft !== value && onCommit(draft) === false) setDraft(value); },
  };
  return multiline ? (
    <textarea {...common} onChange={(e) => setDraft(e.target.value)} />
  ) : (
    <input {...common} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
  );
}

export function Swatch({ g }: { g: Pick<Group, "slot" | "color"> }) {
  return <span className="sw" style={{ background: colorOf(g) }} />;
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

export function Kpi({ label, value, lead, children, spark }: { label: string; value: number; lead?: boolean; children?: ReactNode; spark?: (number | null)[] }) {
  const { book } = useApp();
  return (
    <div className={`kpi${lead ? " lead" : ""}${lead && value < 0 ? " neg" : ""}`}>
      <span className="lbl">{label}</span>
      <span className="v"><span className="cc">{book.settings.currency}</span>{money(value)}</span>
      {spark && <Sparkline values={spark} label={`${label}, last ${spark.length} months`} />}
      <span className="sub">{children}</span>
    </div>
  );
}

/** A small trend line: the shape of the last months, the latest marked. Gaps (no figures) break the line. */
export function Sparkline({ values, label }: { values: (number | null)[]; label: string }) {
  const nums = values.filter((v): v is number => v != null);
  if (nums.length < 2) return null;
  const W = 120, H = 30, lo = Math.min(0, ...nums), hi = Math.max(...nums, lo + 1);
  const x = (i: number) => (i / (values.length - 1)) * W;
  const y = (v: number) => H - 2 - ((v - lo) / (hi - lo)) * (H - 4);
  const d = values.map((v, i) => (v == null ? "" : `${i && values[i - 1] != null ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`)).join("");
  const last = values.length - 1 - [...values].reverse().findIndex((v) => v != null);
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={label}>
      {lo < 0 && <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="var(--line)" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={x(last)} cy={y(values[last]!)} r={2.6} fill="var(--accent)" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Progress as a ring with the percentage inside. */
export function Ring({ value, size = 56, tone }: { value: number; size?: number; tone?: "good" | "bad" | "warn" }) {
  const r = (size - 8) / 2, c = 2 * Math.PI * r, p = Math.max(0, Math.min(1, value));
  const col = tone === "bad" ? "var(--bad)" : tone === "warn" ? "var(--warn)" : "var(--accent)";
  return (
    <svg className="ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${Math.round(p * 100)}%`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--sunk)" strokeWidth={6} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={col} strokeWidth={6} strokeLinecap="round"
        strokeDasharray={`${c * p} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} className="ring-arc" />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle">{Math.round(p * 100)}%</text>
    </svg>
  );
}

/** An empty page: an icon, what the page is for, and the one thing to do first. */
export function EmptyState({ icon: Icon, title, children, action }: { icon: React.ComponentType<{ size?: number; strokeWidth?: number }>; title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="panel empty">
      <span className="empty-icon" aria-hidden><Icon size={26} strokeWidth={1.7} /></span>
      <h3>{title}</h3>
      <p className="muted">{children}</p>
      {action}
    </div>
  );
}

/** "≈ USD 1,234 · EUR 1,100" in the other currencies, when any are set. */
export function Alt({ v }: { v: number }) {
  const { altRates } = useApp();
  if (!altRates.length) return null;
  // the first three, and every one of them on hover
  const all = altRates.map((a) => `${a.code} ${money(v / a.rate)}`);
  return <span title={all.length > 3 ? all.join(" · ") : undefined}>≈ {all.slice(0, 3).join(" · ")}</span>;
}

/** "Leave out one-offs", for pages that compare periods. Hidden until something is marked one-off. */
export function OneOffToggle() {
  const { book, view, setView } = useApp();
  if (!book.hasOneOffs()) return null;
  return (
    <label className="bar small" title="Leave out the parts of figures marked one-off (a car, a renovation), to compare usual months">
      <input type="checkbox" checked={view.regular} onChange={(e) => setView({ regular: e.target.checked })} /> Leave out one-offs
    </label>
  );
}

/** What a one-off-free page left out, so the totals never silently disagree with the Month page. */
export function OneOffNote({ t, what }: { t: Totals; what: string }) {
  const { book, view } = useApp();
  if (!view.regular || !t.oneOff.any) return null;
  const parts = ([["income", "income"], ["saved", "savings"], ["spent", "spending"]] as const)
    .filter(([k]) => t.oneOff[k]).map(([k, label]) => `${money(t.oneOff[k])} of ${label}`);
  return <div className="notice">One-offs left out of {what}: {parts.join(", ")} ({book.settings.currency}).</div>;
}

/** A group's name in a table, as a button that folds its categories away. */
export function GroupToggle({ g, folded, onToggle, count }: { g: Group; folded: boolean; onToggle: () => void; count: number }) {
  return (
    <button className="fold trow" aria-expanded={!folded} onClick={onToggle} title={folded ? `Show ${g.name}'s categories` : `Fold ${g.name}`}>
      <span className={`chev${folded ? "" : " open"}`} aria-hidden>▸</span>
      <Swatch g={g} /> {g.name}
      {folded && count > 0 && <span className="muted small"> · {count}</span>}
    </button>
  );
}

/** "Collapse all" / "Expand all" for a table of groups. */
export function FoldAll({ ids, folded, setAll }: { ids: string[]; folded: Set<string>; setAll: (ids: string[], fold: boolean) => void }) {
  const allFolded = ids.length > 0 && ids.every((id) => folded.has(id));
  return (
    <div className="end">
      <button className="btn ghost" onClick={() => setAll(ids, !allFolded)}>{allFolded ? "Expand all" : "Collapse all"}</button>
    </div>
  );
}

export function YearSelect({ value, onChange, id, label }: { value: number; onChange: (y: number) => void; id: string; label: string }) {
  const { book } = useApp();
  return (
    <select id={id} aria-label={label} value={value} onChange={(e) => onChange(Number(e.target.value))}>
      {book.knownYears().map((y) => <option key={y} value={y}>{y}</option>)}
    </select>
  );
}
