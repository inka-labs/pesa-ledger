/** Allocation: how income divides up, against the long-standing rules (50/30/20, 70/20/10, the Babylon tenth,
 *  six jars...) or the person's own split. Pick a rule, see actual and budget against it for a period, say
 *  what goes in which bucket; each card shows how well its rule fits the same money. */

import { useState } from "react";
import { useApp } from "../context";
import { allocate, CUSTOM_ID, defaultBucket, period, PERIODS, ruleById, RULES, type BucketResult, type PeriodId, type Rule } from "../model/allocation";
import { money } from "../model/format";
import { newId } from "../model/csv";
import type { AllocationSettings, Ledger, Totals } from "../model/types";
import { EmptyState, Swatch } from "../ui/bits";
import { ChartPie } from "lucide-react";

const col = (i: number) => `var(--s${(i % 8) + 1})`;
const pc = (x: number) => `${Math.round(x * 100)}%`;
const KIND = { max: "at most", min: "at least", target: "about" } as const;
const SIGN = { max: "≤", min: "≥", target: "≈" } as const;

export function AllocationView() {
  const { book, change } = useApp();
  const [per, setPer] = useState<PeriodId>("12m");
  const chosen = ruleById(book, book.settings.allocation?.rule);
  const [peek, setPeek] = useState<string | null>(null);
  const rule = ruleById(book, peek) ?? chosen ?? RULES[0];
  const p = period(book, per);
  const set = (fn: (a: AllocationSettings) => void) => change((l: Ledger) => { const a = (l.settings.allocation ??= {}); fn(a); }, ["settings"]);
  const use = (id: string) => { set((a) => { a.rule = id; }); setPeek(null); };
  const base = p.actual ?? p.budget;

  return (
    <>
      <div className="panel-h">
        <h2>Allocation</h2>
        <span className="muted">How your income divides up, against the rules people have budgeted by for generations</span>
        <div className="end">
          <div className="seg" role="group" aria-label="Period">
            {PERIODS.map((x) => <button key={x.id} className={per === x.id ? "on" : ""} aria-pressed={per === x.id} onClick={() => setPer(x.id)}>{x.label}</button>)}
          </div>
        </div>
      </div>

      <div className="rule-cards" role="list">
        {[...RULES, ...(book.settings.allocation?.custom?.length ? [ruleById(book, CUSTOM_ID)!] : [])].map((r) => (
          <button key={r.id} role="listitem" className={`rule-card${r.id === rule.id ? " on" : ""}`} onClick={() => setPeek(r.id === chosen?.id ? null : r.id)} aria-pressed={r.id === rule.id}>
            <span className="rc-h"><b>{r.name}</b><FitChip rule={r} t={base} />{r.id === chosen?.id && <span className="chip ok">Yours</span>}</span>
            <span className="rc-bar">{r.buckets.map((b, i) => <i key={b.id} style={{ width: `${b.pct}%`, background: col(i) }} title={`${b.name} ${b.pct}%`} />)}</span>
            <span className="small muted">{r.idea}</span>
          </button>
        ))}
        <CustomCard onUse={() => use(CUSTOM_ID)} />
      </div>

      {!base || base.income <= 0 ? (
        <EmptyState icon={ChartPie} title={`Nothing to divide up for ${PERIODS.find((x) => x.id === per)!.label.toLowerCase()} yet`}>
          {per === "next" ? "Set next month's budget on the Budget tab and it shows here against the rule." : "Record some income and spending for these months and they'll be measured against the rule."}
        </EmptyState>
      ) : (
        <RulePanel rule={rule} actual={p.actual} budget={p.budget} isChosen={rule.id === chosen?.id} onUse={() => use(rule.id)} />
      )}

      <Mapping rule={rule} />

    </>
  );
}

/** How many of a rule's buckets the period's money hits, on its card. */
function FitChip({ rule, t }: { rule: Rule; t: Totals | null }) {
  const { book } = useApp();
  if (!t || t.income <= 0) return null;
  const a = allocate(book, rule, t);
  const tone = a.rows.some((x) => x.tone === "bad") ? "bad" : a.score < a.rows.length ? "warn" : "good";
  return <span className={`hchip ${tone} fit`} title={`${a.score} of ${a.rows.length} buckets on target for this period`}>{a.score}/{a.rows.length}</span>;
}

function RulePanel({ rule, actual, budget, isChosen, onUse }: { rule: Rule; actual: Totals | null; budget: Totals | null; isChosen: boolean; onUse: () => void }) {
  const { book } = useApp();
  const a = actual && actual.income > 0 ? allocate(book, rule, actual) : null;
  const b = budget && budget.income > 0 ? allocate(book, rule, budget) : null;
  const main = a ?? b!;
  const cur = book.settings.currency;
  const bars: [string, { share: number }[]][] = [
    [`${rule.name}`, rule.buckets.map((x) => ({ share: x.pct / 100 }))],
    ...(a ? [["Actual", a.rows] as [string, BucketResult[]]] : []),
    ...(b ? [["Budget", b.rows] as [string, BucketResult[]]] : []),
  ];
  return (
    <div className="panel">
      <div className="panel-h">
        <h3>{rule.name}</h3><span className="muted small">{rule.source}</span>
        <div className="end">
          <span className={`hchip ${main.rows.some((r) => r.tone === "bad") ? "bad" : main.score < main.rows.length ? "warn" : "good"}`}>{main.score} of {main.rows.length} on target</span>
          {!isChosen && <button className="btn primary" onClick={onUse}>Use this rule</button>}
        </div>
      </div>
      <div className="alloc-bars">
        {bars.map(([label, rows]) => (
          <div key={label} className="ab-row">
            <span className="ab-l">{label}</span>
            <span className="ab-bar">{rows.map((r, i) => r.share > 0 && <i key={i} style={{ width: `${Math.min(100, r.share * 100)}%`, background: col(i) }}>{r.share >= 0.08 ? pc(r.share) : ""}</i>)}</span>
          </div>
        ))}
      </div>
      <div className="alloc-table">
        <div className="at-row head lbl"><span>Bucket</span><span>Rule</span><span className="r">Actual</span><span className="r">Budget</span><span>Against the rule</span></div>
        {rule.buckets.map((bk, i) => {
          const ra = a?.rows[i], rb = b?.rows[i];
          const r = ra ?? rb!;
          const need = bk.kind === "min" ? Math.max(0, -r.gap) : bk.kind === "max" ? Math.max(0, r.gap) : Math.abs(r.gap);
          const verdict = r.tone === "good" ? "On target"
            : bk.kind === "min" ? `${pc(bk.pct / 100 - r.share)} short: ${cur} ${money(need)} more`
            : bk.kind === "max" ? `${pc(r.share - bk.pct / 100)} over: ${cur} ${money(need)} too much`
            : `${r.gap > 0 ? "Over" : "Under"} by ${cur} ${money(need)}`;
          return (
            <div key={bk.id} className="at-row">
              <span className="at-name"><span className="sw" style={{ background: col(i) }} /> <b>{bk.name}</b>{bk.hint && <small className="muted">{bk.hint}</small>}</span>
              <span className="small">{SIGN[bk.kind]} {bk.pct}% <span className="muted">({KIND[bk.kind]})</span></span>
              <span className="r">{ra ? <><b className="num">{pc(ra.share)}</b> <span className="muted small num">{money(ra.amount)}</span></> : <span className="muted">–</span>}</span>
              <span className="r">{rb ? <><b className="num">{pc(rb.share)}</b> <span className="muted small num">{money(rb.amount)}</span></> : <span className="muted">–</span>}</span>
              <span className={`hchip ${r.tone}`}>{verdict}</span>
            </div>
          );
        })}
      </div>
      <p className="small muted">
        Shares are of income for the period, one-offs left out.
        {main.rows.some((r) => r.leftover > 0) && <> Money left over ({cur} {money(main.rows.find((r) => r.leftover > 0)!.leftover)}{a && b ? " actual" : ""}) counts as savings; you can change that under “What goes where”.</>}
        {main.unassigned > 0 && <> {cur} {money(main.unassigned)} isn't assigned to any bucket: a zero-based budget would give it a job.</>}
        {main.unassigned < 0 && <> More went out than came in, by {cur} {money(-main.unassigned)}.</>}
      </p>
    </div>
  );
}

/** Which bucket each group and category is in, for the rule on screen. */
function Mapping({ rule }: { rule: Rule }) {
  const { book, change } = useApp();
  const [open, setOpen] = useState<string | null>(null);
  const map = book.settings.allocation?.maps?.[rule.id] ?? {};
  const set = (key: string, bucket: string | null) => change((l: Ledger) => {
    const a = (l.settings.allocation ??= {});
    const m = ((a.maps ??= {})[rule.id] ??= {});
    if (bucket) m[key] = bucket; else delete m[key];
  }, ["settings"]);
  const groups = book.settings.groups.filter((g) => ["aside", "out"].includes(book.effectOfGroup(g)) && book.catsIn(g.id).length);
  const name = (id: string | null) => rule.buckets.find((b) => b.id === id)?.name ?? "–";
  return (
    <details className="panel hsetup">
      <summary><h3>What goes where</h3><span className="muted small">Which of {rule.name}'s buckets each group falls in. Open a group to place single categories.</span></summary>
      <label className="bar small"><input type="checkbox" checked={book.settings.allocation?.leftover !== false}
        onChange={(e) => change((l: Ledger) => { (l.settings.allocation ??= {}).leftover = e.target.checked; }, ["settings"])} /> Count money left over as savings</label>
      <div className="map-list">
        {groups.map((g) => {
          const cats = book.catsIn(g.id);
          // what most of its categories fall in when nobody has chosen
          const tally: Record<string, number> = {};
          cats.forEach((c) => { const d = defaultBucket(book, rule, c.id); if (d) tally[d] = (tally[d] || 0) + 1; });
          const def = Object.entries(tally).sort((x, y) => y[1] - x[1])[0]?.[0] ?? null;
          return (
            <div key={g.id} className="map-group">
              <div className="map-row">
                <button className="fold" aria-expanded={open === g.id} onClick={() => setOpen(open === g.id ? null : g.id)}>
                  <span className={`chev${open === g.id ? " open" : ""}`} aria-hidden>▸</span><Swatch g={g} /> <b>{g.name}</b>
                </button>
                <select value={map[`g:${g.id}`] ?? ""} onChange={(e) => set(`g:${g.id}`, e.target.value || null)} aria-label={`${g.name}'s bucket`}>
                  <option value="">Automatic{def ? ` (${name(def)})` : ""}</option>
                  {rule.buckets.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              {open === g.id && cats.map((c) => (
                <div key={c.id} className="map-row cat">
                  <span>{c.name}</span>
                  <select value={map[`c:${c.id}`] ?? ""} onChange={(e) => set(`c:${c.id}`, e.target.value || null)} aria-label={`${c.name}'s bucket`}>
                    <option value="">{map[`g:${g.id}`] ? "Same as group" : "Automatic"} ({name(map[`g:${g.id}`] ?? defaultBucket(book, rule, c.id))})</option>
                    {rule.buckets.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </details>
  );
}

/** The person's own split: name each bucket, its share, and whether that's a cap, a floor or a target. */
function CustomCard({ onUse }: { onUse: () => void }) {
  const { book, change, notify } = useApp();
  const saved = book.settings.allocation?.custom ?? [];
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState(saved.length ? saved : [
    { id: "needs", name: "Needs", pct: 50, kind: "max" as const }, { id: "save", name: "Savings", pct: 30, kind: "min" as const }, { id: "wants", name: "Wants", pct: 20, kind: "max" as const },
  ]);
  const total = rows.reduce((s, r) => s + (Number(r.pct) || 0), 0);
  const save = () => {
    if (Math.round(total) !== 100) { notify(`The shares add up to ${total}%; make them 100%.`); return; }
    change((l: Ledger) => { (l.settings.allocation ??= {}).custom = rows.map((r) => ({ ...r, name: r.name.trim() || "Bucket", pct: Number(r.pct) })); }, ["settings"]);
    setEditing(false);
    onUse();
  };
  if (!editing)
    return (
      <button role="listitem" className="rule-card add" onClick={() => setEditing(true)}>
        <span className="rc-h"><b>{saved.length ? "Edit your own split" : "Your own split"}</b></span>
        <span className="small muted">Set your own buckets and shares, say 40% saved, 45% needs, 15% wants.</span>
      </button>
    );
  return (
    <div className="rule-card editing" role="listitem">
      <span className="rc-h"><b>Your own split</b><span className={`small ${Math.round(total) === 100 ? "muted" : "d-bad"}`}>{total}% of 100%</span></span>
      {rows.map((r, i) => (
        <div key={r.id} className="cs-row">
          <input value={r.name} aria-label="Bucket name" onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
          <select value={r.kind} aria-label="Kind" onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, kind: e.target.value as "max" | "min" | "target" } : x)))}>
            <option value="max">at most</option><option value="min">at least</option><option value="target">about</option>
          </select>
          <input className="amt" inputMode="decimal" value={r.pct} aria-label="Share in %" onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, pct: Number(e.target.value.replace(/[^\d.]/g, "")) || 0 } : x)))} />
          <button className="iconbtn" aria-label={`Remove ${r.name}`} disabled={rows.length < 2} onClick={() => setRows(rows.filter((_, j) => j !== i))}>✕</button>
        </div>
      ))}
      <div className="bar">
        {rows.length < 8 && <button className="btn ghost" onClick={() => setRows([...rows, { id: newId("b"), name: "", pct: 0, kind: "target" }])}>Add a bucket</button>}
        <button className="btn primary" onClick={save}>Save and use</button>
        <button className="btn ghost" onClick={() => setEditing(false)}>Cancel</button>
      </div>
    </div>
  );
}
