/** Small pieces every view uses: amount boxes, deltas, KPI tiles, swatches, year pickers. */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { amountText, money, pct } from "../model/format";
import type { Group, Totals } from "../model/types";
import { colorOf } from "../model/theme";
import { useApp } from "../context";
import { ArrowRight, ChevronRight } from "lucide-react";

/** The fold arrow on a group or section: points right when folded, down when open. */
export function Chev({ open }: { open: boolean }) {
  return <ChevronRight size={16} strokeWidth={2.2} className={`chev${open ? " open" : ""}`} aria-hidden />;
}

/** "Go somewhere" (another page, a month, a list): one look everywhere, the accent colour with an arrow. */
export function GoLink({ onClick, children, className, title }: { onClick: () => void; children: ReactNode; className?: string; title?: string }) {
  return (
    <button type="button" className={`go${className ? ` ${className}` : ""}`} onClick={onClick} title={title}>
      <span>{children}</span><ArrowRight size={14} aria-hidden />
    </button>
  );
}

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
    // said out loud too: a red border alone is missed on a phone and by a screen reader
    if ("error" in r) { setBad(r.error); notify(`${label}: ${r.error}`); return; }
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
        if (e.key === "Escape" && (draft !== amountText(value) || bad)) { e.preventDefault(); setDraft(amountText(value)); setBad(""); }
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
export function Sparkline({ values, label, color = "var(--accent)" }: { values: (number | null)[]; label: string; color?: string }) {
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
      <path d={d} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={x(last)} cy={y(values[last]!)} r={2.6} fill={color} vectorEffect="non-scaling-stroke" />
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

/** What a one-off-free page left out, so the totals never silently disagree with the Spending page. */
export function OneOffNote({ t, what }: { t: Totals; what: string }) {
  const { book, view } = useApp();
  if (!view.regular || !t.oneOff.any) return null;
  const parts = ([["income", "income"], ["saved", "savings"], ["spent", "spending"]] as const)
    .filter(([k]) => t.oneOff[k]).map(([k, label]) => `${money(t.oneOff[k])} of ${label}`);
  return <div className="notice">One-offs left out of {what}: {parts.join(", ")} ({book.settings.currency}).</div>;
}

/** On pages that list months, a reminder of what a month holds when months are pay cycles. */
export function CycleNote() {
  const { book } = useApp();
  if (!book.settings.paycycle) return null;
  return <p className="cycle-note">Months are pay months: <b>Sep</b> is September's pay and the October spending it paid for.</p>;
}

/** A group's name in a table, as a button that folds its categories away. */
export function GroupToggle({ g, folded, onToggle, count }: { g: Group; folded: boolean; onToggle: () => void; count: number }) {
  return (
    <button className="fold trow" aria-expanded={!folded} onClick={onToggle} title={folded ? `Show ${g.name}'s categories` : `Fold ${g.name}`}>
      <Chev open={!folded} />
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

// Stat cards -----------------------------------------------------------------------------------

/** "in", "spent" and "saved" are the three money figures, the same colour on every card and chart
 *  (--m-in / --m-spent / --m-saved); "green" is the accent (on track), "amber" a warning, "slate" neutral. */
export type StatTone = "in" | "spent" | "saved" | "green" | "amber" | "slate";
const TONE_VAR: Record<StatTone, string> = { in: "var(--m-in)", spent: "var(--m-spent)", saved: "var(--m-saved)", green: "var(--accent)", amber: "var(--warn)", slate: "var(--ink-2)" };
export const toneColor = (t: StatTone) => TONE_VAR[t];

/** A change as a badge: "▲ 12%" in green when that's good, red when it isn't (null: nothing to compare). */
export function changeBadge(cur: number, prev: number | null | undefined, upGood: boolean): { text: string; good: boolean | null } | null {
  if (prev == null || prev === 0 || !Number.isFinite(cur)) return null;
  const p = (cur - prev) / Math.abs(prev);
  if (Math.abs(p) < 0.005) return { text: "0%", good: null };
  const n = Math.abs(p) * 100;
  return { text: `${p > 0 ? "▲" : "▼"} ${n >= 100 ? Math.round(n).toLocaleString("en-US") : n >= 10 ? Math.round(n) : n.toFixed(1).replace(/\.0$/, "")}%`, good: (p > 0) === upGood };
}

/** The card the dashboard-style pages share: a coloured round icon, the label, the figure (with the
 *  currency small beside it), a change badge, an optional progress bar or trend line, one line under it. */
export function StatCard({ icon: Icon, label, value, tone = "green", badge, badgeLabel, line, share, spark, valueTone, plain, lead }: {
  icon: React.ComponentType<{ size?: number }>; label: string; value: number | string; tone?: StatTone;
  badge?: { text: string; good: boolean | null } | null; badgeLabel?: string; line?: ReactNode;
  share?: number | null; spark?: (number | null)[]; valueTone?: "bad" | "warn"; plain?: boolean; lead?: boolean;
}) {
  const { book } = useApp();
  const c = TONE_VAR[tone];
  return (
    <div className={`stat${lead ? " lead" : ""}`} style={{ ["--tone" as string]: c }}>
      <div className="stat-top">
        <span className="stat-i" aria-hidden><Icon size={18} /></span>
        <span className="stat-lv">
          <span className="stat-l">{label}</span>
          <span className={`num stat-v${valueTone === "bad" ? " d-bad" : valueTone === "warn" ? " warn-ink" : ""}`}>
            {!plain && typeof value === "number" && <span className="cc">{book.settings.currency}</span>}
            {typeof value === "number" ? money(value) : value}
          </span>
        </span>
      </div>
      {share != null && <div className={`meter thin${share > 1.0001 ? (share > 1.1 ? " way" : " over") : ""}`}><i style={{ width: `${Math.min(100, Math.max(0, share) * 100)}%` }} /></div>}
      {(badge || line || spark) && (
        <div className="stat-foot small">
          <span className="stat-foot-l">
            {badge && <span className="stat-chg"><span className={`badge ${badge.good == null ? "" : badge.good ? "up" : "down"}`}>{badge.text}</span>{badgeLabel && <span className="muted">{badgeLabel}</span>}</span>}
            {line && <span className="muted">{line}</span>}
          </span>
          {spark && <span className="stat-spark"><Sparkline values={spark} label={`${label}, recent months`} color={c} /></span>}
        </div>
      )}
    </div>
  );
}

/** The last `n` months of one figure (to the month given), for a stat card's trend line. */
export function recent(book: { monthTotals: (y: number, m: number) => Totals }, to: { y: number; m: number }, pick: (t: Totals) => number, n = 6): (number | null)[] {
  const out: (number | null)[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(to.y, to.m - 1 - i, 1);
    const t = book.monthTotals(d.getFullYear(), d.getMonth() + 1);
    out.push(t.has ? pick(t) : null);
  }
  return out;
}

export type SummaryCell = {
  label: string; value: number | string; tone?: StatTone; valueTone?: "bad" | "warn"; plain?: boolean;
  share?: number | null; badge?: { text: string; good: boolean | null } | null; badgeLabel?: string; line?: ReactNode;
};

/** The month's figures as one compact strip (four across, two by two on a phone), for pages whose real
 *  work is the list underneath: the figures stay in view without pushing the list off the screen. */
export function SummaryStrip({ cells, foot }: { cells: SummaryCell[]; foot?: ReactNode }) {
  const { book } = useApp();
  return (
    <section className="sumbar" aria-label="The month in figures">
      <div className="sumbar-cells">
        {cells.map((c, i) => (
          <div key={c.label} className={`sumcell${i === 0 ? " lead" : ""}`} style={{ ["--tone" as string]: TONE_VAR[c.tone ?? "slate"] }}>
            <span className="sum-l"><i className="sum-dot" aria-hidden />{c.label}</span>
            <span className={`num sum-v${c.valueTone === "bad" ? " d-bad" : c.valueTone === "warn" ? " warn-ink" : ""}`}>
              {!c.plain && typeof c.value === "number" && <span className="cc">{book.settings.currency}</span>}
              {typeof c.value === "number" ? money(c.value) : c.value}
            </span>
            {c.share != null && <div className={`meter thin${c.share > 1.0001 ? (c.share > 1.1 ? " way" : " over") : ""}`}><i style={{ width: `${Math.min(100, Math.max(0, c.share) * 100)}%` }} /></div>}
            {(c.badge || c.line) && (
              <span className="sum-sub small">
                {c.badge && <><span className={`badge ${c.badge.good == null ? "" : c.badge.good ? "up" : "down"}`}>{c.badge.text}</span>{c.badgeLabel && <span className="muted"> {c.badgeLabel}</span>}</>}
                {c.badge && c.line ? <span className="muted"> · </span> : null}
                {c.line && <span className="muted">{c.line}</span>}
              </span>
            )}
          </div>
        ))}
      </div>
      {foot && <div className="sumbar-foot small">{foot}</div>}
    </section>
  );
}
