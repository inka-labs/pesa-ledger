import { useState } from "react";
import { useApp } from "../context";
import { newId } from "../model/csv";
import { amountText, money } from "../model/format";
import { fmtYM, MONTHS, parseYM } from "../model/ledger";
import type { Goal } from "../model/types";
import { Swatch } from "../ui/bits";

export function GoalsView() {
  const { book, change, notify } = useApp();
  const [editing, setEditing] = useState<string | null>(null);
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
      {editing === "new" && <GoalForm onSave={save} onCancel={() => setEditing(null)} />}
      {goals.length ? (
        <div className="goals">
          {goals.map((g) => (editing === g.id
            ? <GoalForm key={g.id} goal={g} onSave={save} onCancel={() => setEditing(null)} />
            : <GoalCard key={g.id} g={g} onEdit={() => setEditing(g.id)} onDelete={() => remove(g.id)} />))}
        </div>
      ) : editing !== "new" && (
        <div className="panel"><p className="muted">No goals yet. A goal tracks a target, such as an emergency fund or a car fund, against the savings or sinking-fund categories you link to it.</p></div>
      )}
    </>
  );
}

function GoalCard({ g, onEdit, onDelete }: { g: Goal; onEdit: () => void; onDelete: () => void }) {
  const { book } = useApp();
  const [confirm, setConfirm] = useState(false);
  const r = book.goal(g);
  const deadline = parseYM(g.deadline);
  const linked = g.cats.map((cid) => book.cats[cid]?.name).filter(Boolean).join(", ") || "No categories linked";
  return (
    <article className="goal">
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
  return (
    <form className="panel" onSubmit={submit}>
      <h3>{goal ? "Edit goal" : "New goal"}</h3>
      <div className="form-grid">
        <label className="field"><span className="lbl">Goal</span><input value={g.name} onChange={(e) => setG({ ...g, name: e.target.value })} placeholder="Emergency fund to 600k" required /></label>
        <label className="field"><span className="lbl">Target ({book.settings.currency}, or e.g. USD 20,000)</span><input className="amt" value={g.target} onChange={(e) => setG({ ...g, target: e.target.value })} required /></label>
        <label className="field"><span className="lbl">Reach it by</span><input type="month" value={g.deadline} onChange={(e) => setG({ ...g, deadline: e.target.value })} /></label>
        <label className="field"><span className="lbl">Already put aside</span><input className="amt" inputMode="decimal" value={g.start} onChange={(e) => setG({ ...g, start: e.target.value })} /></label>
        <label className="field"><span className="lbl">Count contributions from</span><input type="month" value={g.from} onChange={(e) => setG({ ...g, from: e.target.value })} /></label>
      </div>
      <div className="field">
        <span className="lbl">Counts towards this goal</span>
        <div className="checks">
          {book.settings.groups.filter((gr) => book.effectOfGroup(gr) !== "in").flatMap((gr) => book.catsIn(gr.id).map((c) => (
            <label key={c.id}><input type="checkbox" checked={g.cats.includes(c.id)} onChange={() => toggle(c.id)} /><Swatch g={gr} />{c.name}</label>
          )))}
        </div>
      </div>
      {error && <div className="notice err" role="alert">{error}</div>}
      <div className="bar"><button className="btn primary">{goal ? "Save goal" : "Add goal"}</button><button type="button" className="btn ghost" onClick={onCancel}>Cancel</button></div>
    </form>
  );
}
