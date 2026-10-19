import { useState } from "react";
import { useApp } from "../context";
import { setActual, setBudget, setNote } from "../model/edit";
import { money } from "../model/format";
import { before, mk, MONTHS, MONTHS_LONG, nextYM, prevYM } from "../model/ledger";
import { newId } from "../model/csv";
import type { Category, Group } from "../model/types";
import { Alt, AmountInput, Delta, Kpi, Swatch, TextInput } from "../ui/bits";

export function MonthView() {
  const { book, change, view, setView, go } = useApp();
  const { y, m } = view;
  const t = book.monthTotals(y, m);
  const p = prevYM({ y, m });
  const tp = book.monthTotals(p.y, p.m);
  const ly = book.monthTotals(y - 1, m);
  const pl = book.planRange(y, m, m);
  const pLabel = MONTHS[p.m - 1] + (p.y !== y ? ` ${p.y}` : "");
  const future = before(book.today, { y, m });
  const prevRow = book.year(p.y)?.actual?.[mk(p.m)];
  const val = (tt: typeof t, k: "income" | "saved" | "spent" | "left") => (tt.has ? tt[k] : null);

  const copyPrev = () =>
    change((l) => {
      for (const [cid, v] of Object.entries(prevRow ?? {}))
        if (book.actual(y, m, cid) == null && book.cats[cid] && !book.cats[cid].archived) setActual(l, y, m, cid, v);
    }, [`y:${y}`]);
  const fillBudget = () =>
    change((l) => {
      for (const c of book.settings.cats) {
        const b = book.planMonthly(y, m, c.id);
        if (b && !c.archived && book.actual(y, m, c.id) == null) setActual(l, y, m, c.id, Math.round(b));
      }
    }, [`y:${y}`]);

  const tiles = (["income", "saved", "spent", "left"] as const).map((k, i) => (
    <Kpi key={k} label={{ income: "Income", saved: "Saved", spent: "Spent", left: "Left over" }[k]} value={t[k]} lead={i === 3}>
      {pl.has && <span>Budget {money(pl[k])}</span>}
      <Delta cur={val(t, k)} prev={val(tp, k)} upGood={k !== "spent"} label={pLabel} />
      {ly.has && <Delta cur={val(t, k)} prev={ly[k]} upGood={k !== "spent"} label={`${MONTHS[m - 1]} ${y - 1}`} />}
      {k === "saved" && t.income > 0 && <span>{Math.round((t.saved / t.income) * 100)}% of income</span>}
      <Alt v={t[k]} />
    </Kpi>
  ));

  return (
    <>
      <div className="panel-h">
        <div className="monthnav">
          <button className="btn" aria-label="Previous month" onClick={() => setView(prevYM({ y, m }))}>‹</button>
          <h2>{MONTHS_LONG[m - 1]} {y}</h2>
          <button className="btn" aria-label="Next month" onClick={() => setView(nextYM({ y, m }))}>›</button>
        </div>
        <div className="end">
          {(y !== book.today.y || m !== book.today.m) && <button className="btn ghost" onClick={() => setView(book.today)}>This month</button>}
          <button className="btn" disabled={!prevRow} onClick={copyPrev} title={`Fill empty boxes with ${pLabel}'s amounts`}>Copy {pLabel} into empty boxes</button>
          <button className="btn" disabled={!pl.has} onClick={fillBudget} title="Fill empty actual boxes with this month's budget">Fill empty from budget</button>
        </div>
      </div>
      {future && (
        <div className="notice">
          This month is still ahead. Set its budget in the Budget column, or plan the whole year on the{" "}
          <button className="link" onClick={() => go("budget", { planYear: y })}>Budget</button> tab.
        </div>
      )}
      <div className="kpis">{tiles}</div>
      <div className="groups">
        {book.settings.groups.map((g) => <GroupSection key={g.id} g={g} gAct={t.byGroup[g.id] || 0} gPlan={pl.byGroup[g.id] || 0} />)}
        {!book.settings.groups.length && <div className="panel">Add groups and categories on the <button className="link" onClick={() => go("categories")}>Categories</button> tab to start.</div>}
      </div>
      <div className="panel">
        <label className="lbl" htmlFor="mnote">Notes for {MONTHS_LONG[m - 1]}</label>
        <TextInput key={`${y}-${m}`} id="mnote" multiline label={`Notes for ${MONTHS_LONG[m - 1]}`}
          value={book.year(y)?.notes?.[mk(m)] ?? ""}
          placeholder="Anything worth remembering: a late payment, a one-off cost, a decision for next month."
          onCommit={(text) => change((l) => void setNote(l, y, m, text), [`y:${y}`])} />
      </div>
    </>
  );
}

function GroupSection({ g, gAct, gPlan }: { g: Group; gAct: number; gPlan: number }) {
  const { book, change, view } = useApp();
  const { y, m } = view;
  const [name, setName] = useState("");
  const cats = book.catsIn(g.id, true).filter((c) => !c.archived || book.actual(y, m, c.id) != null);
  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    change((l) => void l.settings.cats.push({ id: newId("c"), name: name.trim(), group: g.id }), ["settings"]);
    setName("");
  };
  return (
    <section className="grp">
      <div className="grp-h">
        <Swatch g={g} />
        <h3>{g.name}</h3>
        <span className="tot"><span className="num">{money(gAct)}</span> <span className="muted">of {money(gPlan)} budgeted</span></span>
      </div>
      <div>
        {cats.length > 0 && (
          <div className="row head lbl"><span>Category</span><span className="r">Budget</span><span className="r">Actual</span><span>Progress</span><span className="r">Month on month</span></div>
        )}
        {cats.map((c) => <CategoryRow key={c.id} c={c} g={g} />)}
      </div>
      <form className="addrow" onSubmit={add}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={`Add a category to ${g.name}`} aria-label={`New category in ${g.name}`} />
        <button className="btn">Add</button>
      </form>
    </section>
  );
}

function CategoryRow({ c, g }: { c: Category; g: Group }) {
  const { book, change, view } = useApp();
  const { y, m } = view;
  const a = book.actual(y, m, c.id);
  const budget = book.planMonthly(y, m, c.id);
  const own = book.budgetOverride(y, m, c.id);
  const annual = book.planAnnual(y, c.id);
  const p = prevYM({ y, m });
  const prev = book.actual(p.y, p.m, c.id);
  const spending = g.kind === "expense";

  let progress = <span className="muted small">No budget</span>;
  if (budget) {
    const ratio = (a || 0) / budget;
    const over = spending && ratio > 1.0001;
    const chip = a == null ? null
      : over ? <span className="chip over">▲ Over by {money(a - budget)}</span>
      : !spending && ratio >= 0.9999 ? <span className="chip ok">✓ On budget</span>
      : !spending ? <span className="chip">{Math.round(ratio * 100)}% of budget</span>
      : <span className="chip">{money(budget - a)} left</span>;
    progress = (
      <div className="mcell">
        <div className={`meter${over ? " over" : ""}`} style={{ width: "100%" }}><i style={{ width: `${Math.min(100, ratio * 100)}%` }} /></div>
        {chip}
      </div>
    );
  }
  return (
    <div className="row">
      <div className="name">{c.name}{c.archived && <small>Archived</small>}</div>
      <div className="c-plan">
        <AmountInput value={own} placeholder={annual != null ? money(annual / 12) : "–"}
          title={annual != null ? "Leave blank to use the yearly budget ÷ 12" : "Budget for this month"}
          label={`${c.name} budget for ${MONTHS[m - 1]}`}
          onCommit={(v) => change((l) => void setBudget(l, y, m, c.id, v), [`y:${y}`])} />
      </div>
      <div>
        <AmountInput value={a} label={`${c.name} actual for ${MONTHS[m - 1]}`}
          onCommit={(v) => change((l) => void setActual(l, y, m, c.id, v), [`y:${y}`])} />
      </div>
      <div className="c-meter">{progress}</div>
      <div className="r small c-delta">{(a != null || prev != null) && <Delta cur={a} prev={prev} upGood={!spending} label={MONTHS[p.m - 1]} />}</div>
    </div>
  );
}
