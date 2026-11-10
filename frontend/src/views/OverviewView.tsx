/** Home: how this month is going in one figure (what's left to spend), where the money went by group,
 *  and at most three things worth doing. Everything else lives on its own page under More. */

import { useState, type ReactNode } from "react";
import { useApp, type Tab, type View } from "../context";
import { money } from "../model/format";
import { cycleLabel, fmtYM, mk, MONTHS, MONTHS_LONG, nextYM, parseYM, prevYM } from "../model/ledger";
import { setActual } from "../model/edit";
import { Swatch } from "../ui/bits";
import { ArrowDownToLine, Gauge, PiggyBank, Plus, ShoppingBag, Wallet } from "lucide-react";
import { GroupDonut, InOutChart } from "../ui/homeCharts";

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

  const prev = prevYM(today);
  const tp = book.monthTotals(prev.y, prev.m);
  const expected = book.expectedIncome();
  const goals = book.settings.goals.map((g) => ({ g, r: book.goal(g) })).filter(({ r }) => !r.reached).slice(0, 3);

  // the expenses added one at a time this month and last, newest first
  const recent = [today, prev].flatMap((p) =>
    Object.entries(book.year(p.y)?.entries?.[mk(p.m)] ?? {}).flatMap(([cid, es]) => es.map((e, i) => ({ p, cid, e, i }))))
    .sort((x, y) => (y.p.y * 12 + y.p.m) - (x.p.y * 12 + x.p.m) || (y.e.day ?? 0) - (x.e.day ?? 0) || y.i - x.i)
    .slice(0, 8);
  const changeOf = (cur: number, was: number | null, upGood: boolean) => {
    if (was == null || was === 0) return null;
    const p = (cur - was) / Math.abs(was);
    if (Math.abs(p) < 0.005) return { text: "0%", good: null };
    return { text: `${p > 0 ? "▲" : "▼"} ${Math.round(Math.abs(p) * 100)}%`, good: (p > 0) === upGood };
  };
  const vsLast = `vs ${MONTHS[prev.m - 1]}`;

  return (
    <>
      <div className="panel-h">
        <div><h2>{MONTHS_LONG[today.m - 1]} {today.y}</h2>
          <span className="muted small">{cycleLabel(book.settings, today) ?? "Your money this month"}</span></div>
        <div className="end">
          <button className="btn" onClick={() => go("budget", { planYear: today.y, planMonth: today.m })}><Wallet size={15} aria-hidden /> Budget</button>
          <button className="btn primary" onClick={() => { setView({ ...today }); addExpense(); }}><Plus size={16} aria-hidden /> Add expense</button>
        </div>
      </div>

      <Checklist />

      <div className="stats four">
        <Stat icon={Gauge} label={budget > 0 ? (left >= 0 ? "Left to spend" : "Over budget") : "Spent"} value={budget > 0 ? Math.abs(left) : sv.spent} lead
          tone={budget > 0 && ratio > 1.1 ? "bad" : budget > 0 && left < 0 ? "warn" : undefined}
          share={budget > 0 ? ratio : null}
          line={budget > 0
            ? <>Spent {money(sv.spent)} of {money(budget)}{daysLeft != null && daysLeft > 0 && left > 0 ? ` · ${money(left / daysLeft)} a day` : ""}</>
            : <button className="link" onClick={() => go("budget", { planYear: today.y, planMonth: today.m })}>Set a budget</button>} />
        <Stat icon={ArrowDownToLine} label="Came in" value={t.income} badge={changeOf(t.income, tp.has ? tp.income : null, true)} badgeLabel={vsLast}
          line={t.income === 0 && expected.months ? `About ${money(expected.amount)} usually` : `${MONTHS[prev.m - 1]}: ${tp.has ? money(tp.income) : "–"}`} />
        <Stat icon={ShoppingBag} label="Spent" value={t.spent} badge={changeOf(t.spent, tp.has ? tp.spent : null, false)} badgeLabel={vsLast}
          line={sv.oneOff ? `incl. ${money(sv.oneOff)} one-off` : `${MONTHS[prev.m - 1]}: ${tp.has ? money(tp.spent) : "–"}`} />
        <Stat icon={PiggyBank} label="Saved" value={t.saved} badge={changeOf(t.saved, tp.has ? tp.saved : null, true)} badgeLabel={vsLast}
          line={t.income > 0 ? `${Math.round((t.saved / t.income) * 100)}% of what came in` : pl.saved > 0 ? `${money(pl.saved)} planned` : "Nothing saved yet"} />
      </div>

      <div className="dash2">
        <div className="panel">
          <div className="panel-h"><h3>Money in and out</h3><span className="muted small">last 12 months · click a month to open it</span></div>
          <InOutChart book={book} onMonth={(ym) => go("month", { ...ym })} />
        </div>
        <div className="panel">
          <div className="panel-h"><h3>Where it went</h3><div className="end"><button className="btn ghost" onClick={() => go("month", { ...today })}>Details</button></div></div>
          <GroupDonut book={book} t={t} />
        </div>
      </div>

      <div className="dash2">
        <div className="panel">
          <div className="panel-h"><h3>Recent expenses</h3><div className="end"><button className="btn ghost" onClick={() => go("month", { ...today })}>See all</button></div></div>
          {recent.length ? (
            <table className="t recent">
              <thead><tr><th>Category</th><th>Note</th><th>Date</th><th>Amount</th></tr></thead>
              <tbody>
                {recent.map(({ p, cid, e, i }) => {
                  const c = book.cats[cid], g = c && book.groups[c.group];
                  return (
                    <tr key={`${p.y}-${p.m}-${cid}-${i}`}>
                      <td>{g && <Swatch g={g} />} {c?.name ?? "Removed category"}</td>
                      <td className="muted">{e.note || "–"}</td>
                      <td className="muted">{e.day ? `${e.day} ` : ""}{MONTHS[p.m - 1]}</td>
                      <td className="num">{money(e.amount)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="muted small">Expenses you add with <button className="link" onClick={() => { setView({ ...today }); addExpense(); }}>Add expense</button> show up here, newest first.</p>
          )}
        </div>
        <div className="stack">
          {shown.length > 0 && (
            <div className="panel">
              <div className="panel-h"><h3>To do</h3>{items.length > 0 && <span className="chip">{items.length}</span>}</div>
              <ul className="todo">
                {shown.map((it) => (
                  <li key={it.key}><span>{it.text}</span><button className="btn" onClick={it.run}>{it.action}</button></li>
                ))}
              </ul>
              {items.length > 3 && <button className="link small" onClick={() => setAll((x) => !x)}>{all ? "Show fewer" : `Show ${items.length - 3} more`}</button>}
            </div>
          )}
          {goals.length > 0 && (
            <div className="panel">
              <div className="panel-h"><h3>Goals</h3><div className="end"><button className="btn ghost" onClick={() => go("goals")}>All goals</button></div></div>
              <ul className="gbars">
                {goals.map(({ g, r }) => (
                  <li key={g.id}>
                    <button onClick={() => go("goals")}>
                      <span className="gname">{g.name}{!r.onTrack && <span className="pill warn">Behind</span>}</span>
                      <span className="num">{Math.round(r.progress * 100)}%</span>
                      <div className={`meter thin${r.onTrack ? "" : " over"}`}><i style={{ width: `${r.progress * 100}%` }} /></div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/** A stat card: an icon, the figure, a change badge, an optional bar, one line of context. */
function Stat({ icon: Icon, label, value, line, share, tone, badge, badgeLabel, lead }: {
  icon: typeof Wallet; label: string; value: number; line: ReactNode; share?: number | null; tone?: "bad" | "warn";
  badge?: { text: string; good: boolean | null } | null; badgeLabel?: string; lead?: boolean;
}) {
  const { book } = useApp();
  return (
    <div className={`stat${lead ? " lead" : ""}`}>
      <span className="stat-h">
        <span className="stat-i" aria-hidden><Icon size={17} /></span>
        {badge && <span className={`badge ${badge.good == null ? "" : badge.good ? "up" : "down"}`} title={badgeLabel}>{badge.text}<span className="sr-only"> {badgeLabel}</span></span>}
      </span>
      <span className="lbl">{label}</span>
      <span className={`num stat-v${tone === "bad" ? " d-bad" : tone === "warn" ? " warn-ink" : ""}`}><span className="cc">{book.settings.currency}</span>{money(value)}</span>
      {share != null && <div className={`meter thin${share > 1.0001 ? (share > 1.1 ? " way" : " over") : ""}`}><i style={{ width: `${Math.min(100, share * 100)}%` }} /></div>}
      <span className="small muted">{line}</span>
    </div>
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
