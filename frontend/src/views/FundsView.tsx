/** Sinking funds: money put aside a little at a time for a bill you know is coming (car insurance and
 *  service, school fees, a yearly subscription). Each fund lives on its category: a target, a due month,
 *  and how often the bill comes round. When it's paid, the next cycle starts with whatever was left. */

import { useCallback, useState } from "react";
import { useApp } from "../context";
import { payFund } from "../model/edit";
import { amountText, money } from "../model/format";
import { addMonths, fmtYM, parseYM, ymKey } from "../model/ledger";
import type { Fund, Ledger } from "../model/types";
import { Swatch } from "../ui/bits";
import { Sheet } from "../ui/Sheet";

const EVERY: { v: number; label: string }[] = [
  { v: 12, label: "Every year" }, { v: 6, label: "Every 6 months" }, { v: 3, label: "Every 3 months" }, { v: 24, label: "Every 2 years" }, { v: 0, label: "Just once" },
];

export function FundsView() {
  const { book, go } = useApp();
  const [editing, setEditing] = useState<string | null>(null); // a category id, or "new"
  const close = useCallback(() => setEditing(null), []);
  const funds = book.settings.cats.filter((c) => c.fund && !c.archived);
  const totals = funds.reduce((s, c) => { const f = book.fund(c.id)!; return { saved: s.saved + f.saved, target: s.target + c.fund!.target, need: s.need + (f.status === "ready" ? 0 : f.neededPerMonth) }; }, { saved: 0, target: 0, need: 0 });
  return (
    <>
      <div className="panel-h">
        <h2>Sinking funds</h2>
        <span className="muted">Put a little aside each month for bills you know are coming</span>
        <div className="end"><button className="btn primary" onClick={() => setEditing("new")}>New fund</button></div>
      </div>
      {funds.length > 0 && (
        <div className="notice">
          {funds.length} {funds.length === 1 ? "fund holds" : "funds hold"} <b>{money(totals.saved)}</b> of the <b>{money(totals.target)}</b> their bills need.
          {totals.need > 0 && <> Together they need about <b>{money(totals.need)}</b> a month to be ready in time. </>}
          {" "}Amounts come from what you record in each fund's category on the <button className="link" onClick={() => go("month", { ...book.today })}>Month</button> page, and the budget there sets the pace.
        </div>
      )}
      {funds.length ? (
        <div className="goals">{funds.map((c) => <FundCard key={c.id} cid={c.id} editing={editing === c.id} onEdit={() => setEditing(c.id)} />)}</div>
      ) : (
        <div className="panel">
          <p className="muted">No sinking funds yet. A fund turns a category (say, <i>Car service &amp; insurance</i>) into a pot with a target and a due date, so you can see whether you're putting enough aside each month, or more than the bill needs.</p>
          <button className="btn" onClick={() => setEditing("new")}>Set up a fund</button>
        </div>
      )}
      {editing && <FundForm cid={editing === "new" ? null : editing} onClose={close} />}
    </>
  );
}

function FundCard({ cid, editing, onEdit }: { cid: string; editing: boolean; onEdit: () => void }) {
  const { book, change, notify, read, go } = useApp();
  const c = book.cats[cid];
  const f = book.fund(cid)!;
  const g = book.groups[c.group];
  const due = parseYM(c.fund!.due);
  const [paying, setPaying] = useState(false);
  const [paid, setPaid] = useState("");
  const [bad, setBad] = useState("");
  const chip = f.status === "ready" ? <span className="chip ok">✓ Ready</span>
    : f.status === "on-pace" ? <span className="chip ok">✓ On pace</span>
    : f.status === "overdue" ? <span className="chip over">▲ Due, short {money(f.remaining)}</span>
    : <span className="chip over">▲ Short by {money(f.short)}</span>;
  const pay = (e: React.FormEvent) => {
    e.preventDefault();
    const r = read(paid);
    if ("error" in r || r.value == null || r.value < 0) { setBad("Enter what the bill came to."); return; }
    change((l) => payFund(l, cid, f.saved, r.value!, book.today), ["settings"]);
    const left = Math.max(0, f.saved - r.value);
    notify(c.fund!.every ? `Paid. ${c.name} starts again${left ? ` with ${money(left)} carried over` : ""}.` : `Paid. ${c.name}'s fund is closed.`, true);
    setPaying(false);
  };
  return (
    <article className={`goal${editing ? " editing" : ""}`}>
      <div className="top-l"><h3>{g && <Swatch g={g} />} {c.name}</h3>{chip}</div>
      <div><span className="big">{money(f.saved)}</span> <span className="muted">of {book.settings.currency} {money(c.fund!.target)}</span></div>
      <div className="prog" role="progressbar" aria-valuenow={Math.round(f.progress * 100)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${f.progress * 100}%` }} /></div>
      <dl>
        <dt>Due</dt><dd>{fmtYM(due)} · {f.monthsLeft} mo</dd>
        <dt>Needed per month</dt><dd>{f.status === "ready" ? "Nothing more" : money(f.neededPerMonth)}</dd>
        <dt>Your average</dt><dd>{money(f.average)}</dd>
        <dt>Budgeted until due</dt><dd>{money(f.planned)}</dd>
        <dt>Repeats</dt><dd>{EVERY.find((x) => x.v === c.fund!.every)?.label ?? `Every ${c.fund!.every} months`}</dd>
      </dl>
      {f.over > 0 && <p className="small"><b>{money(f.over)} more than the bill</b> {f.status === "ready" ? <>is in it now{f.planned > 0 && <>, and another <b>{money(f.planned)}</b> is budgeted before it's due</>}</> : "by the due month on your budget"}. You could lower its budget or move the extra to a goal.</p>}
      {f.status === "short" && <p className="small">To be ready, put about <b>{money(f.neededPerMonth)}</b> a month into it, or <button className="link" onClick={() => go("budget", { planYear: book.today.y })}>raise its budget</button>.</p>}
      {paying ? (
        <form className="oneoff-pop" onSubmit={pay}>
          <label className="lbl" htmlFor={`paid-${cid}`}>What did the bill come to?</label>
          <input id={`paid-${cid}`} className={`amt${bad ? " invalid" : ""}`} inputMode="decimal" autoFocus value={paid} onChange={(e) => { setPaid(e.target.value); setBad(""); }} onFocus={(e) => e.currentTarget.select()} />
          {bad && <span className="small d-bad">{bad}</span>}
          <span className="small muted">{c.fund!.every ? `Whatever's left carries into the next cycle, due ${fmtYM(addMonths(due, c.fund!.every))}.` : "This was a one-time fund, so it closes."}</span>
          <div className="bar"><button className="btn primary">Mark paid</button><button type="button" className="btn ghost" onClick={() => setPaying(false)}>Cancel</button></div>
        </form>
      ) : (
        <div className="bar">
          <button className="btn" onClick={() => { setPaid(amountText(c.fund!.target)); setPaying(true); }}>Bill paid…</button>
          <button className="btn ghost" onClick={onEdit}>Edit</button>
        </div>
      )}
    </article>
  );
}

function FundForm({ cid, onClose }: { cid: string | null; onClose: () => void }) {
  const { book, change, read, notify } = useApp();
  const existing = cid ? book.cats[cid]?.fund : null;
  const today = ymKey(book.today);
  const options = book.settings.cats.filter((c) => !c.archived && book.budgeted(c.id) && (!c.fund || c.id === cid));
  const [cat, setCat] = useState(cid ?? options.find((c) => /sinking|insurance|service/i.test(`${book.groups[c.group]?.name} ${c.name}`))?.id ?? options[0]?.id ?? "");
  const [f, setF] = useState({
    target: amountText(existing?.target), due: existing?.due ?? ymKey({ y: book.today.y + 1, m: 1 }),
    start: amountText(existing?.start ?? 0), from: existing?.from ?? today, every: existing?.every ?? 12,
  });
  const [error, setError] = useState("");
  const save = () => {
    const t = read(f.target), s = read(f.start);
    if ("error" in t || !t.value || t.value <= 0) return setError("Enter what the bill will come to.");
    if ("error" in s) return setError(`Already in it: ${s.error}`);
    if (!cat) return setError("Choose the category the money goes into.");
    if (!f.due || !f.from) return setError("Choose when it's due and when it started.");
    const fund: Fund = { target: t.value, due: f.due, start: s.value ?? 0, from: f.from, every: f.every };
    change((l: Ledger) => { const c = l.settings.cats.find((x) => x.id === cat); if (c) c.fund = fund; }, ["settings"]);
    onClose();
  };
  const remove = () => {
    change((l) => { const c = l.settings.cats.find((x) => x.id === cid); if (c) delete c.fund; }, ["settings"]);
    notify(`${book.cats[cid!]?.name} is a plain category again. Its figures stay.`, true);
    onClose();
  };
  return (
    <Sheet title={cid ? `Edit ${book.cats[cid]?.name}` : "New sinking fund"} onClose={onClose} onSubmit={save}
      footer={<>
        {error && <div className="notice err" role="alert">{error}</div>}
        <div className="bar">
          <button className="btn primary">{cid ? "Save fund" : "Add fund"}</button>
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          {cid && <button type="button" className="btn ghost danger" onClick={remove} style={{ marginLeft: "auto" }}>Stop tracking</button>}
        </div>
      </>}>
      <label className="field"><span className="lbl">Category the money goes into</span>
        <select value={cat} disabled={!!cid} onChange={(e) => setCat(e.target.value)}>
          {options.map((c) => <option key={c.id} value={c.id}>{book.groups[c.group]?.name} · {c.name}</option>)}
        </select>
      </label>
      <div className="form-grid">
        <label className="field"><span className="lbl">The bill ({book.settings.currency})</span><input className="amt" inputMode="decimal" value={f.target} onChange={(e) => setF({ ...f, target: e.target.value })} placeholder="60,000" autoFocus={!!cid} /></label>
        <label className="field"><span className="lbl">Due by</span><input type="month" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} /></label>
        <label className="field"><span className="lbl">Already in it</span><input className="amt" inputMode="decimal" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></label>
        <label className="field"><span className="lbl">Count amounts from</span><input type="month" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></label>
        <label className="field"><span className="lbl">The bill comes</span>
          <select value={f.every} onChange={(e) => setF({ ...f, every: Number(e.target.value) })}>
            {EVERY.map((x) => <option key={x.v} value={x.v}>{x.label}</option>)}
          </select>
        </label>
      </div>
      <p className="small muted">Everything recorded in the category from “Count amounts from” adds to the fund, on top of what's already in it. Its budget on the Budget tab (or its repeating amount) is what the app expects you to keep putting in.</p>
    </Sheet>
  );
}
