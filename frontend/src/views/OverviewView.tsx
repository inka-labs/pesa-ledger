/** Where the app opens: this month in four numbers, what needs attention, goals, and the last six months. */

import { useState, type ReactNode } from "react";
import { SEARCH_KEY } from "../ui/keys";
import { useApp, type Tab, type View } from "../context";
import { money } from "../model/format";
import { fmtYM, MONTHS, MONTHS_LONG, nextYM, prevYM } from "../model/ledger";
import type { YM } from "../model/types";
import { Alt, Delta, Kpi } from "../ui/bits";

type Item = { tone: "bad" | "warn" | "info"; text: ReactNode; action: string; tab: Tab; patch?: Partial<View> };

const CHECKLIST_KEY = "pesa-ledger.checklist-hidden";

export function OverviewView() {
  const { book, go, openSearch, ratesError } = useApp();
  const today = book.today;
  const t = book.monthTotals(today.y, today.m);
  const prev = prevYM(today);
  const tp = book.monthTotals(prev.y, prev.m);
  const pl = book.planRange(today.y, today.m, today.m);
  const next = nextYM(today);
  const cur = book.settings.currency;

  // What needs attention, most pressing first
  const items: Item[] = [];
  if (!t.has)
    items.push({ tone: "info", text: <>Nothing recorded for {MONTHS_LONG[today.m - 1]} yet.</>, action: `Record ${MONTHS[today.m - 1]}`, tab: "month", patch: { ...today } });
  const over = book.settings.cats
    .filter((c) => book.effectOf(c.id) === "out" && !c.archived)
    .map((c) => ({ c, a: book.actual(today.y, today.m, c.id) ?? 0, b: book.planMonthly(today.y, today.m, c.id) ?? 0 }))
    .filter((x) => x.b > 0 && x.a > x.b)
    .sort((x, y) => y.a - y.b - (x.a - x.b));
  over.slice(0, 4).forEach(({ c, a, b }) =>
    items.push({ tone: "bad", text: <><b>{c.name}</b> is over budget by {cur} {money(a - b)} this month.</>, action: "See it", tab: "month", patch: { ...today, focusCat: c.id } }));
  if (over.length > 4) items.push({ tone: "bad", text: <>{over.length - 4} more categories are over budget.</>, action: "See them", tab: "month", patch: { ...today } });
  const ahead = book.ahead(12);
  const unbudgeted = ahead.filter((r) => r.f.src === "none").map((r) => r.ym);
  if (unbudgeted.length)
    items.push({ tone: "warn", text: <>{unbudgeted.length === 1 ? `${fmtYM(unbudgeted[0])} has` : `${unbudgeted.length} of the next 12 months (from ${fmtYM(unbudgeted[0])}) have`} no budget.</>, action: "Plan it", tab: "budget", patch: { planYear: unbudgeted[0].y } });
  ahead.filter((r) => r.f.src === "budget" && r.f.left < 0).slice(0, 2).forEach((r) =>
    items.push({ tone: "warn", text: <><b>{fmtYM(r.ym)}</b> is expected to come up short by {cur} {money(-r.f.left)}.</>, action: "Adjust budget", tab: "budget", patch: { planYear: r.ym.y } }));
  book.settings.goals.forEach((g) => {
    const r = book.goal(g);
    if (!r.reached && !r.onTrack)
      items.push({ tone: "warn", text: <><b>{g.name}</b> is behind: it needs {cur} {money(r.neededPerMonth)} a month to make its deadline.</>, action: "See goal", tab: "goals" });
  });
  if (ratesError) items.push({ tone: "info", text: <>Exchange rates couldn't be updated. {ratesError}</>, action: "Check", tab: "settings" });

  // The last six months' left over, for a sense of direction
  const six: { ym: YM; left: number | null }[] = [];
  let p = today;
  for (let i = 0; i < 6; i++) { const mt = book.monthTotals(p.y, p.m); six.unshift({ ym: p, left: mt.has ? mt.left : null }); p = prevYM(p); }
  const maxAbs = Math.max(1, ...six.map((s) => Math.abs(s.left ?? 0)));

  return (
    <>
      <div className="panel-h">
        <h2>{MONTHS_LONG[today.m - 1]} {today.y}</h2>
        <span className="muted">Your money this month</span>
        <div className="end">
          <button className="btn primary" onClick={() => go("month", { ...today })}>Record {MONTHS[today.m - 1]}</button>
          <button className="btn" onClick={() => go("budget", { planYear: next.y })}>Plan {MONTHS[next.m - 1]}</button>
          <button className="btn ghost" onClick={openSearch}>Search <kbd>{SEARCH_KEY}</kbd></button>
        </div>
      </div>

      <Checklist />

      <div className="kpis">
        {(["income", "saved", "spent", "left"] as const).map((k, i) => (
          <Kpi key={k} label={{ income: "Income", saved: "Saved", spent: "Spent", left: "Left over" }[k]} value={t[k]} lead={i === 3}>
            {(k === "saved" || k === "spent") && pl.has && <span>Budget {money(pl[k])}</span>}
            <Delta cur={t.has ? t[k] : null} prev={tp.has ? tp[k] : null} upGood={k !== "spent"} label={MONTHS[prev.m - 1]} />
            <Alt v={t[k]} />
          </Kpi>
        ))}
      </div>

      <div className="cols overview">
        <div className="panel">
          <div className="panel-h"><h3>Needs attention</h3>{items.length > 0 && <span className="chip">{items.length}</span>}</div>
          {items.length ? (
            <ul className="attention">
              {items.map((it, i) => (
                <li key={i} className={`att ${it.tone}`}>
                  <span className="dot" aria-hidden />
                  <span className="txt">{it.text}</span>
                  <button className="btn" onClick={() => go(it.tab, it.patch)}>{it.action}</button>
                </li>
              ))}
            </ul>
          ) : <p className="ok-all"><span className="chip ok">✓ All clear</span> Nothing over budget, every month ahead is planned, and your goals are on track.</p>}
        </div>

        <div className="stack">
          <div className="panel">
            <div className="panel-h"><h3>Left over, last six months</h3><div className="end"><button className="btn ghost" onClick={() => go("year", { yearView: today.y })}>Year view</button></div></div>
            <div className="six">
              {six.map(({ ym, left }) => (
                <button key={`${ym.y}-${ym.m}`} className="sixrow" onClick={() => go("month", { ...ym })} title={`Open ${fmtYM(ym)}`}>
                  <span className="lbl6">{MONTHS[ym.m - 1]}</span>
                  <span className="track6">
                    {left != null && <i className={left < 0 ? "neg" : ""} style={{ width: `${(Math.abs(left) / maxAbs) * 100}%` }} />}
                  </span>
                  <span className={`num v6 ${left != null && left < 0 ? "d-bad" : ""}`}>{left == null ? "–" : money(left)}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="panel-h"><h3>Goals</h3><div className="end"><button className="btn ghost" onClick={() => go("goals")}>{book.settings.goals.length ? "All goals" : "Add a goal"}</button></div></div>
            {book.settings.goals.length ? book.settings.goals.slice(0, 4).map((g) => {
              const r = book.goal(g);
              return (
                <div key={g.id} className="gmini">
                  <div className="bar"><b>{g.name}</b><span className="muted small" style={{ marginLeft: "auto" }}>{Math.round(r.progress * 100)}%</span></div>
                  <div className="prog"><i style={{ width: `${r.progress * 100}%` }} /></div>
                  <span className="small muted">{money(r.saved)} of {money(g.target)} · {r.reached ? "reached" : r.onTrack ? "on track" : "behind pace"}</span>
                </div>
              );
            }) : <p className="small muted">Set a target, like an emergency fund, and link the categories that count towards it.</p>}
          </div>
        </div>
      </div>
    </>
  );
}

function Checklist() {
  const { book, go } = useApp();
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(CHECKLIST_KEY) === "1"; } catch { return false; } });
  const recorded = Object.values(book.ledger.years).some((yd) => Object.values(yd.actual).some((r) => Object.keys(r).length));
  const steps: { done: boolean; label: string; tab: Tab; patch?: Partial<View> }[] = [
    { done: book.settings.cats.length > 0, label: "Set up your categories", tab: "categories" },
    { done: book.hasAnyBudget(book.today.y), label: `Set a budget for ${book.today.y}`, tab: "budget", patch: { planYear: book.today.y } },
    { done: recorded, label: "Record a month's figures", tab: "month", patch: { ...book.today } },
    { done: book.settings.goals.length > 0, label: "Add a goal", tab: "goals" },
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
            {s.done ? <span>{s.label}</span> : <button className="link" onClick={() => go(s.tab, s.patch)}>{s.label}</button>}
          </li>
        ))}
      </ol>
    </div>
  );
}
