import { useCallback, useEffect, useState } from "react";
import { useApp } from "../context";
import { newId } from "../model/csv";
import { amountText, money } from "../model/format";
import { fmtYM, MONTHS, parseYM } from "../model/ledger";
import type { Goal } from "../model/types";
import { Swatch } from "../ui/bits";

export function GoalsView() {
  const { book, change, notify } = useApp();
  const [editing, setEditing] = useState<string | null>(null);
  const close = useCallback(() => setEditing(null), []);
  const goals = book.settings.goals;
  const save = (g: Goal) => {
    change((l) => {
      const i = l.settings.goals.findIndex((x) => x.id === g.id);
      if (i >= 0) l.settings.goals[i] = g;
      else l.settings.goals.push(g);
    }, ["settings"]);
    setEditing(null);
  };
  const remove = (id: string) => {
    const name = book.settings.goals.find((g) => g.id === id)?.name;
    change((l) => void (l.settings.goals = l.settings.goals.filter((g) => g.id !== id)), ["settings"]);
    notify(`Deleted the goal “${name}”.`, true);
  };

  return (
    <>
      <div className="panel-h">
        <h2>Goals</h2>
        <span className="muted">Progress counts every amount entered in the linked categories</span>
        <div className="end"><button className="btn primary" onClick={() => setEditing("new")}>New goal</button></div>
      </div>
      {goals.length ? (
        <div className="goals">
          {goals.map((g) => <GoalCard key={g.id} g={g} editing={editing === g.id} onEdit={() => setEditing(g.id)} onDelete={() => remove(g.id)} />)}
        </div>
      ) : (
        <div className="panel"><p className="muted">No goals yet. A goal tracks a target, such as an emergency fund or a car fund, against the savings or sinking-fund categories you link to it.</p></div>
      )}
      {/* editing happens in a side sheet, so the cards never move or stretch */}
      {editing && <GoalForm key={editing} goal={goals.find((g) => g.id === editing)} onSave={save} onCancel={close} />}
    </>
  );
}

function GoalCard({ g, editing, onEdit, onDelete }: { g: Goal; editing: boolean; onEdit: () => void; onDelete: () => void }) {
  const { book } = useApp();
  const [confirm, setConfirm] = useState(false);
  const r = book.goal(g);
  const deadline = parseYM(g.deadline);
  const linked = g.cats.map((cid) => book.cats[cid]?.name).filter(Boolean).join(", ") || "No categories linked";
  return (
    <article className={`goal${editing ? " editing" : ""}`}>
      <div className="top-l">
        <h3>{g.name}</h3>
        {r.reached ? <span className="chip ok">✓ Reached</span> : r.onTrack ? <span className="chip ok">✓ On track</span> : <span className="chip over">▲ Behind pace</span>}
      </div>
      <div><span className="big">{money(r.saved)}</span> <span className="muted">of {book.settings.currency} {money(g.target)}</span></div>
      <div className="prog" role="progressbar" aria-valuenow={Math.round(r.progress * 100)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${r.progress * 100}%` }} /></div>
      <dl>
        <dt>Progress</dt><dd>{Math.round(r.progress * 100)}%</dd>
        <dt>Deadline</dt><dd>{MONTHS[deadline.m - 1]} {deadline.y} · {r.monthsLeft} mo</dd>
        <dt>Needed per month</dt><dd>{money(r.neededPerMonth)}</dd>
        <dt>Your average</dt><dd>{money(r.average)}</dd>
        <dt>At this pace</dt><dd>{r.reached ? "Done" : r.atPace ? fmtYM(r.atPace) : "No contributions yet"}</dd>
        <dt>On your budget</dt><dd>{r.reached ? "Done" : !r.budgeted ? "No budget set" : r.onBudget ? fmtYM(r.onBudget) : "Not within the budgets set so far"}</dd>
        {r.budgeted && !r.reached && <><dt>Budgeted by deadline</dt><dd>{money(r.byDeadline)}</dd></>}
      </dl>
      <span className="small muted">{linked}</span>
      <div className="bar">
        <button className="btn" onClick={onEdit}>Edit</button>
        {confirm
          ? <><button className="btn danger" onClick={onDelete}>Delete goal</button><button className="btn ghost" onClick={() => setConfirm(false)}>Keep it</button></>
          : <button className="btn ghost danger" onClick={() => setConfirm(true)}>Delete</button>}
      </div>
    </article>
  );
}

function GoalForm({ goal, onSave, onCancel }: { goal?: Goal; onSave: (g: Goal) => void; onCancel: () => void }) {
  const { book, read, notify } = useApp();
  const y = book.today.y;
  const [g, setG] = useState(() => ({
    name: goal?.name ?? "", target: amountText(goal?.target), deadline: goal?.deadline ?? `${y}-12`,
    start: amountText(goal?.start ?? 0), from: goal?.from ?? `${y}-01`, cats: goal?.cats ?? [],
  }));
  const [error, setError] = useState("");
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = read(g.target), s = read(g.start);
    if ("error" in t) return setError(`Target: ${t.error}`);
    if ("error" in s) return setError(`Already put aside: ${s.error}`);
    if (!t.value || t.value <= 0) return setError("Enter a target amount above zero.");
    if (!g.deadline || !g.from) return setError("Choose a deadline and a month to count from.");
    const cur = book.settings.currency;
    const notes = [t, s].flatMap((r) => (r.converted ? [`${r.converted.code} ${amountText(r.converted.amount)} → ${cur} ${money(r.value)}`] : []));
    if (notes.length) notify(`Converted at today's rate: ${notes.join(", ")}`);
    onSave({ id: goal?.id ?? newId("g"), name: g.name.trim() || "Goal", target: t.value, deadline: g.deadline, start: s.value ?? 0, from: g.from, cats: g.cats });
  };
  const toggle = (cid: string) => setG((x) => ({ ...x, cats: x.cats.includes(cid) ? x.cats.filter((c) => c !== cid) : [...x.cats, cid] }));
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onCancel]);

  // Savings groups first and open; the rest folded, unless they hold a linked category
  const groups = book.settings.groups.filter((gr) => book.effectOfGroup(gr) !== "in" && book.catsIn(gr.id).length);
  const aside = groups.filter((gr) => book.effectOfGroup(gr) === "aside");
  const others = groups.filter((gr) => book.effectOfGroup(gr) !== "aside");
  const [showOthers, setShowOthers] = useState(() => others.some((gr) => book.catsIn(gr.id).some((c) => g.cats.includes(c.id))));
  const chips = (list: typeof groups) => list.map((gr) => (
    <div key={gr.id} className="pick-group">
      <span className="lbl"><Swatch g={gr} /> {gr.name}</span>
      <div className="pick-chips">
        {book.catsIn(gr.id).map((c) => {
          const on = g.cats.includes(c.id);
          return <button type="button" key={c.id} className={`pick${on ? " on" : ""}`} aria-pressed={on} onClick={() => toggle(c.id)}>{on && <span aria-hidden>✓ </span>}{c.name}</button>;
        })}
      </div>
    </div>
  ));
  const linkedOthers = others.reduce((n, gr) => n + book.catsIn(gr.id).filter((c) => g.cats.includes(c.id)).length, 0);

  return (
    <div className="sheet-back" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
    <form className="sheet" role="dialog" aria-modal="true" aria-label={goal ? "Edit goal" : "New goal"} onSubmit={submit}>
      <div className="sheet-h">
        <h3>{goal ? "Edit goal" : "New goal"}</h3>
        <button type="button" className="iconbtn" aria-label="Close" onClick={onCancel}>✕</button>
      </div>
      <div className="sheet-body">
      <div className="form-grid">
        <label className="field"><span className="lbl">Goal</span><input value={g.name} onChange={(e) => setG({ ...g, name: e.target.value })} placeholder="Emergency fund to 600k" required /></label>
        <label className="field"><span className="lbl">Target ({book.settings.currency}, or e.g. USD 20,000)</span><input className="amt" value={g.target} onChange={(e) => setG({ ...g, target: e.target.value })} required /></label>
        <label className="field"><span className="lbl">Reach it by</span><input type="month" value={g.deadline} onChange={(e) => setG({ ...g, deadline: e.target.value })} /></label>
        <label className="field"><span className="lbl">Already put aside</span><input className="amt" inputMode="decimal" value={g.start} onChange={(e) => setG({ ...g, start: e.target.value })} /></label>
        <label className="field"><span className="lbl">Count contributions from</span><input type="month" value={g.from} onChange={(e) => setG({ ...g, from: e.target.value })} /></label>
      </div>
      <div className="field">
        <span className="lbl">Counts towards this goal · {g.cats.length ? `${g.cats.length} linked` : "pick the categories you save it in"}</span>
        {chips(aside)}
        {others.length > 0 && (
          <>
            <button type="button" className="link small" aria-expanded={showOthers} onClick={() => setShowOthers((x) => !x)}>
              {showOthers ? "Hide other categories" : `Show other categories${linkedOthers ? ` (${linkedOthers} linked)` : ""}`}
            </button>
            {showOthers && chips(others)}
          </>
        )}
      </div>
      </div>
      <div className="sheet-foot">
        {error && <div className="notice err" role="alert">{error}</div>}
        <div className="bar"><button className="btn primary">{goal ? "Save goal" : "Add goal"}</button><button type="button" className="btn ghost" onClick={onCancel}>Cancel</button></div>
      </div>
    </form>
    </div>
  );
}
