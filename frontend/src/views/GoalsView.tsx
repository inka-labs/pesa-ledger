/** Goals: what you're saving towards, each as a card with one progress bar and one line on what it
 *  needs. A goal can be one amount or a list of items (a move: deposit, movers, a sofa) whose total is
 *  the target, ticked off as they're paid. Money counts from linked categories and from "Add money". */

import { useCallback, useMemo, useState } from "react";
import { useApp } from "../context";
import { newId } from "../model/csv";
import { amountText, money } from "../model/format";
import { fmtYM, MONTHS, parseYM, ymKey } from "../model/ledger";
import type { Goal, GoalItem } from "../model/types";
import { EmptyState, Swatch } from "../ui/bits";
import { Sheet } from "../ui/Sheet";
import { Check, Ellipsis, Plus, Target, Trash2 } from "lucide-react";

type Filter = "active" | "reached" | "all";
const TEMPLATES: { name: string; months: number; target?: number; items?: string[] }[] = [
  { name: "Emergency fund", months: 12 },
  { name: "Holiday", months: 6, items: ["Flights", "Accommodation", "Spending money"] },
  { name: "Moving house", months: 4, items: ["Deposit", "First month's rent", "Movers", "Furniture"] },
  { name: "School fees", months: 6 },
  { name: "A car", months: 18, items: ["The car", "Insurance", "Registration"] },
  { name: "Wedding", months: 12, items: ["Venue", "Catering", "Attire", "Photography"] },
];

export function GoalsView() {
  const { book, change, notify } = useApp();
  const [editing, setEditing] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("active");
  const close = useCallback(() => setEditing(null), []);
  const goals = book.settings.goals;
  const rows = useMemo(() => goals.map((g) => ({ g, r: book.goal(g) })), [goals, book]);
  const shown = rows.filter(({ r }) => (filter === "all" ? true : filter === "reached" ? r.reached : !r.reached));

  const save = (g: Goal) => {
    change((l) => {
      const i = l.settings.goals.findIndex((x) => x.id === g.id);
      if (i >= 0) l.settings.goals[i] = g; else l.settings.goals.push(g);
    }, ["settings"]);
    setEditing(null);
  };

  const active = rows.filter(({ r }) => !r.reached);
  const saved = active.reduce((s, { r }) => s + r.saved, 0);
  const target = active.reduce((s, { g }) => s + g.target, 0);
  const perMonth = active.reduce((s, { r }) => s + r.neededPerMonth, 0);
  const behind = active.filter(({ r }) => !r.onTrack).length;

  return (
    <>
      <div className="panel-h">
        <h2>Goals</h2>
        <div className="end"><button className="btn primary" onClick={() => setEditing("new")}><Plus size={16} aria-hidden /> New goal</button></div>
      </div>
      {goals.length ? (
        <>
          <div className="sumline">
            <div><span className="lbl">Saved so far</span><span className="num big">{money(saved)}</span><span className="muted small">of {money(target)} across {active.length} {active.length === 1 ? "goal" : "goals"}</span></div>
            <div><span className="lbl">Needed a month</span><span className="num">{money(perMonth)}</span><span className="muted small">to make every deadline</span></div>
            <div><span className="lbl">Behind pace</span><span className={`num${behind ? " warn-ink" : ""}`}>{behind}</span></div>
          </div>
          <div className="seg" role="group" aria-label="Show">
            {(["active", "reached", "all"] as Filter[]).map((f) => (
              <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {f === "active" ? `In progress (${active.length})` : f === "reached" ? `Reached (${rows.length - active.length})` : "All"}
              </button>
            ))}
          </div>
          <div className="gcards">
            {shown.map(({ g }) => <GoalCard key={g.id} g={g} onEdit={() => setEditing(g.id)} />)}
            {!shown.length && <p className="muted">{filter === "reached" ? "No goal reached yet." : "Every goal is reached."}</p>}
          </div>
        </>
      ) : (
        <>
          <EmptyState icon={Target} title="What are you saving for?" action={<button className="btn primary" onClick={() => setEditing("new")}>New goal</button>}>
            A goal is a target and a date: an emergency fund, a move, school fees. It can be one amount or a list of things, and it tells you what to put aside each month.
          </EmptyState>
        </>
      )}
      {editing && <GoalForm key={editing} goal={goals.find((g) => g.id === editing)} onSave={save} onCancel={close}
        onDelete={(id) => { const name = goals.find((g) => g.id === id)?.name; change((l) => void (l.settings.goals = l.settings.goals.filter((g) => g.id !== id)), ["settings"]); notify(`Deleted the goal “${name}”.`, true); setEditing(null); }} />}
    </>
  );
}

function GoalCard({ g, onEdit }: { g: Goal; onEdit: () => void }) {
  const { book, change, read, notify } = useApp();
  const r = book.goal(g);
  const d = parseYM(g.deadline);
  const [adding, setAdding] = useState(false);
  const [amount, setAmount] = useState("");
  const [bad, setBad] = useState("");
  const [details, setDetails] = useState(false);
  const items = g.items ?? [];
  const tone = r.reached ? "ok" : r.onTrack ? "ok" : "warn";

  const addMoney = (e: React.FormEvent) => {
    e.preventDefault();
    const v = read(amount);
    if ("error" in v) return setBad(v.error);
    if (!v.value) return setBad("Enter an amount.");
    const value = v.value;
    change((l) => { const x = l.settings.goals.find((y) => y.id === g.id)!; (x.deposits ??= []).push({ ym: ymKey(book.today), amount: value }); }, ["settings"]);
    notify(`Added ${money(value)} to ${g.name}.`, true);
    setAmount(""); setAdding(false); setBad("");
  };
  const tick = (it: GoalItem) =>
    change((l) => { const x = l.settings.goals.find((y) => y.id === g.id)!.items!.find((i) => i.id === it.id)!; x.done = !x.done; }, ["settings"]);

  return (
    <article className="gcard">
      <header>
        <h3>{g.name}</h3>
        <span className={`pill ${tone}`}>{r.reached ? "Reached" : r.onTrack ? "On track" : "Behind"}</span>
        <button className="iconbtn" aria-label={`Edit ${g.name}`} title="Edit" onClick={onEdit}><Ellipsis size={16} aria-hidden /></button>
      </header>
      <div className="gfig">
        <span className="num big">{money(r.saved)}</span>
        <span className="muted">of {money(g.target)}</span>
        <span className="gpct num">{Math.round(r.progress * 100)}%</span>
      </div>
      <div className={`meter${tone === "warn" ? " over" : ""}`}><i style={{ width: `${r.progress * 100}%` }} /></div>
      <p className="small">
        {r.reached ? <>Done{r.saved > g.target ? `, with ${money(r.saved - g.target)} more than needed` : ""}.</>
          : r.monthsLeft > 0 ? <><b>{money(r.neededPerMonth)}</b> a month to reach it by {MONTHS[d.m - 1]} {d.y} <span className="muted">({r.monthsLeft} {r.monthsLeft === 1 ? "month" : "months"} left)</span></>
          : <span className="warn-ink">The deadline has passed: {money(r.remaining)} still to go.</span>}
      </p>

      {items.length > 0 && (
        <ul className="gitems">
          {items.map((it) => (
            <li key={it.id} className={it.done ? "done" : ""}>
              <button className="gtick" aria-pressed={!!it.done} aria-label={`${it.name}: ${it.done ? "paid" : "not paid yet"}`} onClick={() => tick(it)}>{it.done && <Check size={12} aria-hidden />}</button>
              <span>{it.name}</span><span className="num">{money(it.amount)}</span>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <form className="gadd" onSubmit={addMoney}>
          <input className={`amt${bad ? " invalid" : ""}`} inputMode="decimal" autoFocus value={amount} placeholder="Amount" aria-label={`Amount to add to ${g.name}`} onChange={(e) => { setAmount(e.target.value); setBad(""); }} />
          <button className="btn primary">Add</button>
          <button type="button" className="btn ghost" onClick={() => { setAdding(false); setBad(""); }}>Cancel</button>
          {bad && <span className="small d-bad">{bad}</span>}
        </form>
      ) : (
        <div className="bar">
          {!r.reached && <button className="btn" onClick={() => setAdding(true)}><Plus size={14} aria-hidden /> Add money</button>}
          <button className="link small" aria-expanded={details} onClick={() => setDetails((x) => !x)}>{details ? "Fewer details" : "Details"}</button>
        </div>
      )}
      {details && (
        <dl className="gdl small">
          <dt>Your average</dt><dd>{money(r.average)} a month</dd>
          <dt>At this pace</dt><dd>{r.reached ? "Done" : r.atPace ? fmtYM(r.atPace) : "No contributions yet"}</dd>
          <dt>On your budget</dt><dd>{r.reached ? "Done" : !r.budgeted ? "No budget set" : r.onBudget ? fmtYM(r.onBudget) : "Not within the budgets set so far"}</dd>
          <dt>Counts from</dt><dd>{g.cats.map((c) => book.cats[c]?.name).filter(Boolean).join(", ") || "Money added here only"}</dd>
          {r.deposited !== 0 && <><dt>Added by hand</dt><dd>{money(r.deposited)}</dd></>}
        </dl>
      )}
    </article>
  );
}

function GoalForm({ goal, onSave, onCancel, onDelete }: { goal?: Goal; onSave: (g: Goal) => void; onCancel: () => void; onDelete: (id: string) => void }) {
  const { book, read } = useApp();
  const today = book.today;
  const plus = (n: number) => { const t = new Date(today.y, today.m - 1 + n, 1); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`; };
  const [name, setName] = useState(goal?.name ?? "");
  const [target, setTarget] = useState(amountText(goal?.target));
  const [deadline, setDeadline] = useState(goal?.deadline ?? plus(12));
  const [start, setStart] = useState(amountText(goal?.start ?? 0));
  const [items, setItems] = useState<{ id: string; name: string; amount: string; done?: boolean }[]>(
    (goal?.items ?? []).map((i) => ({ ...i, amount: amountText(i.amount) })));
  const [cats, setCats] = useState<string[]>(goal?.cats ?? []);
  const [showCats, setShowCats] = useState(cats.length > 0);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState("");

  const itemTotal = items.reduce((s, i) => { const r = read(i.amount); return s + ("error" in r ? 0 : r.value ?? 0); }, 0);
  const applyTemplate = (t: (typeof TEMPLATES)[number]) => {
    setName(t.name); setDeadline(plus(t.months));
    setItems((t.items ?? []).map((n) => ({ id: newId("i"), name: n, amount: "" })));
  };

  const submit = () => {
    const parsed: GoalItem[] = [];
    for (const i of items) {
      if (!i.name.trim() && !i.amount.trim()) continue;
      const r = read(i.amount);
      if ("error" in r) return setError(`${i.name || "An item"}: ${r.error}`);
      parsed.push({ id: i.id, name: i.name.trim() || "Item", amount: r.value ?? 0, ...(i.done ? { done: true } : {}) });
    }
    const t = parsed.length ? { value: parsed.reduce((s, i) => s + i.amount, 0) } : read(target);
    const s = read(start);
    if ("error" in t) return setError(`Target: ${t.error}`);
    if ("error" in s) return setError(`Already saved: ${s.error}`);
    if (!t.value || t.value <= 0) return setError(parsed.length ? "Give the items their amounts." : "Enter a target above zero.");
    onSave({
      id: goal?.id ?? newId("g"), name: name.trim() || "Goal", target: t.value, deadline, start: s.value ?? 0,
      from: goal?.from ?? ymKey(today), cats, items: parsed, deposits: goal?.deposits ?? [],
    });
  };
  const toggle = (cid: string) => setCats((x) => (x.includes(cid) ? x.filter((c) => c !== cid) : [...x, cid]));
  const groups = book.settings.groups.filter((gr) => book.effectOfGroup(gr) === "aside" && book.catsIn(gr.id).length);

  return (
    <Sheet title={goal ? "Edit goal" : "New goal"} onClose={onCancel} onSubmit={submit}
      footer={
        <>
          {error && <div className="notice err" role="alert">{error}</div>}
          <div className="bar">
            <button className="btn primary">{goal ? "Save" : "Add goal"}</button>
            <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
            {goal && (confirm
              ? <span className="end bar"><button type="button" className="btn danger" onClick={() => onDelete(goal.id)}>Delete goal</button><button type="button" className="btn ghost" onClick={() => setConfirm(false)}>Keep</button></span>
              : <button type="button" className="btn ghost danger end" onClick={() => setConfirm(true)}><Trash2 size={14} aria-hidden /> Delete</button>)}
          </div>
        </>
      }>
      {!goal && (
        <div className="field">
          <span className="lbl">Start from</span>
          <div className="pick-chips">{TEMPLATES.map((t) => <button type="button" key={t.name} className={`pick${name === t.name ? " on" : ""}`} onClick={() => applyTemplate(t)}>{t.name}</button>)}</div>
        </div>
      )}
      <label className="field"><span className="lbl">Name</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Emergency fund" /></label>
      <div className="form-grid">
        <label className="field"><span className="lbl">Target</span>
          {items.length ? <span className="num big-ish">{money(itemTotal)} <span className="muted small">the items' total</span></span>
            : <input className="amt" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="0" />}
        </label>
        <label className="field"><span className="lbl">Reach it by</span><input type="month" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></label>
        <label className="field"><span className="lbl">Already saved</span><input className="amt" inputMode="decimal" value={start} onChange={(e) => setStart(e.target.value)} /></label>
      </div>

      <div className="field">
        <span className="lbl">Items <span className="muted">(optional: a list of what it's for)</span></span>
        {items.map((it, i) => (
          <div key={it.id} className="item-row">
            <input value={it.name} placeholder="What" aria-label={`Item ${i + 1}`} onChange={(e) => setItems(items.map((x) => (x.id === it.id ? { ...x, name: e.target.value } : x)))} />
            <input className="amt" inputMode="decimal" value={it.amount} placeholder="Amount" aria-label={`${it.name || `Item ${i + 1}`} amount`} onChange={(e) => setItems(items.map((x) => (x.id === it.id ? { ...x, amount: e.target.value } : x)))} />
            <button type="button" className="iconbtn" aria-label={`Remove ${it.name || `item ${i + 1}`}`} onClick={() => setItems(items.filter((x) => x.id !== it.id))}><Trash2 size={14} aria-hidden /></button>
          </div>
        ))}
        <button type="button" className="link small" onClick={() => setItems([...items, { id: newId("i"), name: "", amount: "" }])}><Plus size={13} aria-hidden /> Add an item</button>
      </div>

      <div className="field">
        <button type="button" className="link small" aria-expanded={showCats} onClick={() => setShowCats((x) => !x)}>
          {showCats ? "Hide" : "Also count"} savings categories{cats.length ? ` (${cats.length} linked)` : ""}
        </button>
        {showCats && (
          <>
            <span className="small muted">What you record in these categories counts towards the goal, as well as money you add here.</span>
            {groups.map((gr) => (
              <div key={gr.id} className="pick-group">
                <span className="lbl"><Swatch g={gr} /> {gr.name}</span>
                <div className="pick-chips">
                  {book.catsIn(gr.id).map((c) => {
                    const on = cats.includes(c.id);
                    return <button type="button" key={c.id} className={`pick${on ? " on" : ""}`} aria-pressed={on} onClick={() => toggle(c.id)}>{on && <span aria-hidden>✓ </span>}{c.name}</button>;
                  })}
                </div>
              </div>
            ))}
            {!groups.length && <span className="small muted">No savings groups yet.</span>}
          </>
        )}
      </div>
    </Sheet>
  );
}
