/** Home: how this month is going in one figure (what's left to spend), where the money went by group,
 *  and at most three things worth doing. Everything else lives on its own page under More. */

import { useState, type ReactNode } from "react";
import { useApp, type Tab, type View } from "../context";
import { money } from "../model/format";
import { cycleLabel, fmtYM, MONTHS, MONTHS_LONG, nextYM, parseYM } from "../model/ledger";
import { setActual } from "../model/edit";
import { Swatch } from "../ui/bits";
import { Plus } from "lucide-react";

type Item = { key: string; text: ReactNode; action: string; run: () => void };

const CHECKLIST_KEY = "pesa-ledger.checklist-hidden";

export function OverviewView() {
  const { book, go, setView, addExpense, change, notify } = useApp();
  const today = book.today;
  const t = book.monthTotals(today.y, today.m);
  const pl = book.planRange(today.y, today.m, today.m);
  const next = nextYM(today);
  const cur = book.settings.currency;

  // what's left to spend: this month's everyday budget minus everyday spending (one-offs beside it)
  const sv = book.spendingVsBudget(today.y, today.m);
  const budget = sv.budget;
  const left = budget - sv.spent;
  const ratio = budget > 0 ? sv.spent / budget : 0;
  const now = new Date();
  const daysLeft = book.settings.paycycle ? null : new Date(today.y, today.m, 0).getDate() - now.getDate();

  // a few things worth doing, most pressing first
  const items: Item[] = [];
  const unpaid = book.unpaid(today.y, today.m);
  if (unpaid.length)
    items.push({
      key: "unpaid", text: unpaid.length === 1 ? <><b>{unpaid[0].name}</b> ({money(unpaid[0].repeat!)}) repeats every month and isn't recorded yet.</> : <>{unpaid.length} repeating amounts aren't recorded yet ({unpaid.map((c) => c.name).slice(0, 3).join(", ")}{unpaid.length > 3 ? "…" : ""}).</>,
      action: unpaid.length === 1 ? "Record it" : "Record all",
      run: () => { change((l) => { for (const c of unpaid) setActual(l, today.y, today.m, c.id, c.repeat!); }, [`y:${today.y}`]); notify(unpaid.length === 1 ? `Recorded ${unpaid[0].name}.` : `Recorded ${unpaid.length} repeating amounts.`, true); },
    });
  const over = book.settings.cats
    .filter((c) => book.effectOf(c.id) === "out" && !c.archived)
    .map((c) => ({ c, a: book.actual(today.y, today.m, c.id) ?? 0, b: book.planMonthly(today.y, today.m, c.id) ?? 0 }))
    .filter((x) => x.b > 0 && x.a > x.b)
    .sort((x, y) => y.a - y.b - (x.a - x.b));
  if (over.length)
    items.push({
      key: "over", text: over.length === 1 ? <><b>{over[0].c.name}</b> is {cur} {money(over[0].a - over[0].b)} over budget.</> : <><b>{over.length} categories</b> are over budget, most of all {over[0].c.name} (by {money(over[0].a - over[0].b)}).</>,
      action: "See spending", run: () => go("month", { ...today, focusCat: over[0].c.id }),
    });
  if (!book.planRange(next.y, next.m, next.m).has)
    items.push({ key: "next", text: <>{MONTHS_LONG[next.m - 1]} has no budget yet.</>, action: `Plan ${MONTHS[next.m - 1]}`, run: () => go("budget", { planYear: next.y, planMonth: next.m }) });
  const behind = book.settings.goals.filter((g) => { const r = book.goal(g); return !r.reached && !r.onTrack; });
  const short = book.settings.cats.filter((c) => c.fund && !c.archived && ["short", "overdue"].includes(book.fund(c.id)!.status));
  if (behind.length)
    items.push({ key: "goals", text: behind.length === 1 ? <><b>{behind[0].name}</b> is behind pace.</> : <>{behind.length} goals are behind pace.</>, action: "See goals", run: () => go("goals") });
  if (short.length)
    items.push({ key: "funds", text: short.length === 1 ? <><b>{short[0].name}</b> won't have enough by {fmtYM(parseYM(short[0].fund!.due))}.</> : <>{short.length} sinking funds won't have enough for their bills.</>, action: "See funds", run: () => go("funds") });
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, 3);

  const groups = book.settings.groups
    .filter((g) => { const e = book.effectOfGroup(g); return e === "out" || e === "aside"; })
    .map((g) => ({ g, a: t.byGroup[g.id] || 0, b: pl.byGroup[g.id] || 0 }))
    .filter((x) => x.a || x.b);

  return (
    <>
      <div className="panel-h">
        <h2>{MONTHS_LONG[today.m - 1]} {today.y}</h2>
        {cycleLabel(book.settings, today) && <span className="muted">{cycleLabel(book.settings, today)}</span>}
      </div>

      <Checklist />

      <section className="hero">
        {budget > 0 ? (
          <>
            <span className="lbl">{left >= 0 ? "Left to spend" : "Over budget"}</span>
            <span className={`hero-v num${ratio > 1.1 ? " d-bad" : left < 0 ? " warn-ink" : ""}`}><span className="cc">{cur}</span>{money(Math.abs(left))}</span>
            <div className={`meter${ratio > 1.0001 ? (ratio > 1.1 ? " way" : " over") : ""}`}><i style={{ width: `${Math.min(100, ratio * 100)}%` }} /></div>
            <span className="muted">
              Spent {money(sv.spent)} of {money(budget)}
              {sv.oneOff ? `, plus ${money(sv.oneOff)} on one-offs` : ""}
              {daysLeft != null && daysLeft > 0 && left > 0 ? ` · about ${money(left / daysLeft)} a day for the ${daysLeft} days left` : ""}
            </span>
          </>
        ) : (
          <>
            <span className="lbl">Spent this month</span>
            <span className="hero-v num"><span className="cc">{cur}</span>{money(t.spent)}</span>
            <span className="muted">Set a budget to see what's left to spend. <button className="link" onClick={() => go("budget", { planYear: today.y, planMonth: today.m })}>Set a budget</button></span>
          </>
        )}
        <div className="hero-actions">
          <button className="btn primary" onClick={() => { setView({ ...today }); addExpense(); }}><Plus size={16} aria-hidden /> Add expense</button>
          <button className="btn" onClick={() => go("month", { ...today })}>See all spending</button>
        </div>
      </section>

      <div className="trio">
        <div><span className="lbl">Came in</span><span className="num">{money(t.income)}</span></div>
        <div><span className="lbl">Saved</span><span className="num">{money(t.saved)}</span></div>
        <div><span className="lbl">Left over</span><span className={`num${t.left < 0 ? " d-bad" : ""}`}>{money(t.left)}</span></div>
      </div>

      {shown.length > 0 && (
        <div className="panel">
          <div className="panel-h"><h3>To do</h3></div>
          <ul className="todo">
            {shown.map((it) => (
              <li key={it.key}><span>{it.text}</span><button className="btn" onClick={it.run}>{it.action}</button></li>
            ))}
          </ul>
          {items.length > 3 && <button className="link small" onClick={() => setAll((x) => !x)}>{all ? "Show fewer" : `Show ${items.length - 3} more`}</button>}
        </div>
      )}

      {groups.length > 0 && (
        <div className="panel">
          <div className="panel-h"><h3>Where it went</h3></div>
          <ul className="gbars">
            {groups.map(({ g, a, b }) => {
              const r = b > 0 ? a / b : 0;
              const out = book.effectOfGroup(g) === "out";
              return (
                <li key={g.id}>
                  <button onClick={() => go("month", { ...today })}>
                    <span className="gname"><Swatch g={g} /> {g.name}</span>
                    <span className="num">{money(a)}{b > 0 && <span className="muted"> / {money(b)}</span>}</span>
                    <div className={`meter thin${out && r > 1.0001 ? (r > 1.1 ? " way" : " over") : ""}`}><i style={{ width: `${b > 0 ? Math.min(100, r * 100) : 0}%` }} /></div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );
}

function Checklist() {
  const { book, go } = useApp();
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(CHECKLIST_KEY) === "1"; } catch { return false; } });
  const recorded = Object.values(book.ledger.years).some((yd) => Object.values(yd.actual).some((r) => Object.keys(r).length));
  const steps: { done: boolean; label: string; tab: Tab; patch?: Partial<View> }[] = [
    { done: book.settings.cats.length > 0, label: "Choose your categories", tab: "categories" },
    { done: book.hasAnyBudget(book.today.y), label: "Set a budget", tab: "budget", patch: { planYear: book.today.y, planMonth: book.today.m } },
    { done: recorded, label: "Add your first expense", tab: "month", patch: { ...book.today } },
  ];
  const left = steps.filter((s) => !s.done).length;
  if (hidden || left === 0) return null;
  const hide = () => { setHidden(true); try { localStorage.setItem(CHECKLIST_KEY, "1"); } catch { /* private window */ } };
  return (
    <div className="panel checklist">
      <div className="panel-h"><h3>Getting started</h3><span className="muted small">{steps.length - left} of {steps.length} done</span>
        <div className="end"><button className="btn ghost" onClick={hide}>Hide</button></div></div>
      <ol>
        {steps.map((s) => (
          <li key={s.label} className={s.done ? "done" : ""}>
            <span className="tick" aria-hidden>{s.done ? "✓" : ""}</span>
            {s.done ? <span>{s.label}<span className="sr-only"> (done)</span></span> : <button className="link" onClick={() => go(s.tab, s.patch)}>{s.label}</button>}
          </li>
        ))}
      </ol>
    </div>
  );
}
