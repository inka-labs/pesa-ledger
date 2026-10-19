/** Where the app opens: this month in four figures with their trends, what needs attention, where the month's
 *  money went, the health checks at a glance, what's coming up, net worth, goals and the last six months. */

import { useState, type ReactNode } from "react";
import { useApp, type Tab, type View } from "../context";
import { money } from "../model/format";
import { addMonths, before, fmtYM, MONTHS, MONTHS_LONG, nextYM, parseYM, prevYM } from "../model/ledger";
import { healthChecks, type Check } from "../model/health";
import { setActual } from "../model/edit";
import type { YM } from "../model/types";
import { Alt, Delta, Kpi, Ring, Sparkline } from "../ui/bits";
import { ShareBar } from "../ui/charts";
import { CalendarClock, CircleAlert, CircleCheck, Info, PenLine, Repeat, TriangleAlert, Wallet } from "lucide-react";

type Item = { tone: "bad" | "warn" | "info"; text: ReactNode; action: string; tab: Tab; patch?: Partial<View> };

const CHECKLIST_KEY = "pesa-ledger.checklist-hidden";

export function OverviewView() {
  const { book, go, ratesError } = useApp();
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
  book.settings.cats.filter((c) => c.fund && !c.archived).forEach((c) => {
    const f = book.fund(c.id)!;
    if (f.status === "short" || f.status === "overdue")
      items.push({ tone: "warn", text: <><b>{c.name}</b> will be {cur} {money(f.status === "overdue" ? f.remaining : f.short)} short of its bill{f.status === "overdue" ? ", which is due" : ` by ${fmtYM(parseYM(c.fund!.due))}`}.</>, action: "See fund", tab: "funds" });
  });
  const checks = healthChecks(book);
  const unhealthy = checks.filter((c) => c.tone === "bad");
  if (unhealthy.length)
    items.push({ tone: "bad", text: <>{unhealthy.length === 1 ? <><b>{unhealthy[0].title}</b> needs attention</> : <>{unhealthy.length} health checks need attention: {unhealthy.map((c) => c.title.toLowerCase()).join(", ")}</>}.</>, action: "See Health", tab: "health" });
  if (ratesError) items.push({ tone: "info", text: <>Exchange rates couldn't be updated. {ratesError}</>, action: "Check", tab: "settings" });

  // The last six months' left over, for a sense of direction
  const six: { ym: YM; left: number | null; usual: number | null }[] = [];
  let p = today;
  for (let i = 0; i < 6; i++) {
    const mt = book.monthTotals(p.y, p.m);
    const usual = mt.oneOff.any ? book.regular.monthTotals(p.y, p.m).left : null;
    six.unshift({ ym: p, left: mt.has ? mt.left : null, usual });
    p = prevYM(p);
  }
  const maxAbs = Math.max(1, ...six.map((s) => Math.abs(s.left ?? 0)));

  // the last 12 months of each headline figure, for the tiles' trend lines (one-offs left out, so a car
  // month doesn't flatten the rest)
  const trend = (k: "income" | "saved" | "spent" | "left") => {
    const out: (number | null)[] = [];
    for (let i = 11; i >= 0; i--) { const q = addMonths(today, -i); const mt = book.regular.monthTotals(q.y, q.m); out.push(mt.has ? mt[k] : null); }
    return out;
  };

  return (
    <>
      <div className="panel-h">
        <h2>{MONTHS_LONG[today.m - 1]} {today.y}</h2>
        <span className="muted">Your money this month</span>
        <div className="end">
          <button className="btn primary" onClick={() => go("month", { ...today })}><PenLine size={15} aria-hidden /> Record {MONTHS[today.m - 1]}</button>
          <button className="btn" onClick={() => go("budget", { planYear: next.y })}><Wallet size={15} aria-hidden /> Plan {MONTHS[next.m - 1]}</button>
        </div>
      </div>

      <Checklist />

      <div className="kpis">
        {(["income", "saved", "spent", "left"] as const).map((k, i) => (
          <Kpi key={k} label={{ income: "Income", saved: "Saved", spent: "Spent", left: "Left over" }[k]} value={t[k]} lead={i === 3} spark={trend(k)}>
            {(k === "saved" || k === "spent") && pl.has && <span>Budget {money(pl[k])}</span>}
            <Delta cur={t.has ? t[k] : null} prev={tp.has ? tp[k] : null} upGood={k !== "spent"} label={MONTHS[prev.m - 1]} />
            <Alt v={t[k]} />
          </Kpi>
        ))}
      </div>

      <div className="dash">
        <div className="stack">
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

          <div className="panel">
            <div className="panel-h"><h3>Where {MONTHS_LONG[today.m - 1]}'s money went</h3><div className="end"><button className="btn ghost" onClick={() => go("month", { ...today })}>Open month</button></div></div>
            <ShareBar book={book} t={t} />
          </div>

          <div className="panel">
            <div className="panel-h"><h3>Left over, last six months</h3><div className="end"><button className="btn ghost" onClick={() => go("year", { yearView: today.y })}>Year view</button></div></div>
            <div className="six">
              {six.map(({ ym, left, usual }) => (
                <button key={`${ym.y}-${ym.m}`} className="sixrow" onClick={() => go("month", { ...ym })}
                  title={usual != null ? `Open ${fmtYM(ym)}. Without its one-offs: ${cur} ${money(usual)}` : `Open ${fmtYM(ym)}`}>
                  <span className="lbl6">{MONTHS[ym.m - 1]}{usual != null && <sup className="oneoff-mark" aria-label="has a one-off">1×</sup>}</span>
                  <span className="track6">
                    {left != null && <i className={left < 0 ? "neg" : ""} style={{ width: `${(Math.abs(left) / maxAbs) * 100}%` }} />}
                  </span>
                  <span className={`num v6 ${left != null && left < 0 ? "d-bad" : ""}`}>{left == null ? "–" : money(left)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="stack">
          <HealthGlance checks={checks} />
          <ComingUp />
          <NetWorthMini />
          <div className="panel">
            <div className="panel-h"><h3>Goals</h3><div className="end"><button className="btn ghost" onClick={() => go("goals")}>{book.settings.goals.length ? "All goals" : "Add a goal"}</button></div></div>
            {book.settings.goals.length ? book.settings.goals.slice(0, 4).map((g) => {
              const r = book.goal(g);
              return (
                <div key={g.id} className="gmini">
                  <Ring value={r.progress} size={44} tone={r.reached || r.onTrack ? undefined : "warn"} />
                  <div className="fig">
                    <b>{g.name}</b>
                    <span className="small muted">{money(r.saved)} of {money(g.target)} · {r.reached ? "reached" : r.onTrack ? "on track" : "behind pace"}</span>
                  </div>
                </div>
              );
            }) : <p className="small muted">Set a target, like an emergency fund, and link the categories that count towards it.</p>}
          </div>
        </div>
      </div>
    </>
  );
}

/** Every health check as one line, worst first. */
function HealthGlance({ checks }: { checks: Check[] }) {
  const { go } = useApp();
  if (!checks.length) return null;
  const order = { bad: 0, warn: 1, good: 2, info: 3 } as const;
  const icon = { good: CircleCheck, warn: CircleAlert, bad: TriangleAlert, info: Info } as const;
  return (
    <div className="panel">
      <div className="panel-h"><h3>Health</h3><div className="end"><button className="btn ghost" onClick={() => go("health")}>All checks</button></div></div>
      <ul className="glance">
        {[...checks].sort((a, b) => order[a.tone] - order[b.tone]).map((c) => {
          const Icon = icon[c.tone];
          return (
            <li key={c.id}>
              <button onClick={() => go("health")} title={c.detail}>
                <Icon size={15} strokeWidth={2.2} className={`gl-${c.tone}`} aria-label={c.tone} />
                <span>{c.title}</span><b className="num">{c.value}</b>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** What's due soon: repeating amounts not recorded this month, and sinking-fund bills in the next six months. */
function ComingUp() {
  const { book, go, change, notify } = useApp();
  const today = book.today;
  const unpaid = book.unpaid(today.y, today.m);
  const soon = addMonths(today, 6);
  const funds = book.settings.cats
    .filter((c) => c.fund && !c.archived && !before(soon, parseYM(c.fund.due)))
    .map((c) => ({ c, f: book.fund(c.id)! }))
    .sort((a, b) => a.c.fund!.due.localeCompare(b.c.fund!.due));
  const next = nextYM(today);
  const nb = book.planRange(next.y, next.m, next.m);
  return (
    <div className="panel">
      <div className="panel-h"><h3>Coming up</h3></div>
      {!unpaid.length && !funds.length && !nb.has && <p className="small muted">Nothing due soon. Repeating amounts and sinking-fund bills show up here.</p>}
      <ul className="coming">
        {unpaid.map((c) => (
          <li key={c.id}>
            <Repeat size={15} aria-hidden className="muted" />
            <span><b>{c.name}</b> <span className="muted small">this month, not recorded</span></span>
            <span className="num">{money(c.repeat!)}</span>
            <button className="btn ghost" onClick={() => { change((l) => void setActual(l, today.y, today.m, c.id, c.repeat!), [`y:${today.y}`]); notify(`Recorded ${c.name}.`, true); }}>Record</button>
          </li>
        ))}
        {funds.map(({ c, f }) => (
          <li key={c.id}>
            <CalendarClock size={15} aria-hidden className="muted" />
            <span><b>{c.name}</b> <span className="muted small">due {fmtYM(parseYM(c.fund!.due))} · {f.status === "ready" ? "ready" : f.status === "on-pace" ? "on pace" : `short ${money(f.status === "overdue" ? f.remaining : f.short)}`}</span></span>
            <span className="num">{money(c.fund!.target)}</span>
            <button className="btn ghost" onClick={() => go("funds")}>See</button>
          </li>
        ))}
        {nb.has && (
          <li>
            <Wallet size={15} aria-hidden className="muted" />
            <span><b>{MONTHS_LONG[next.m - 1]}'s budget</b> <span className="muted small">to save {money(nb.saved)}, spend {money(nb.spent)}</span></span>
            <span className="num">{money(nb.saved + nb.spent)}</span>
            <button className="btn ghost" onClick={() => go("budget", { planYear: next.y })}>Plan</button>
          </li>
        )}
      </ul>
    </div>
  );
}

/** Net worth now, its change over the month and its last twelve months. */
function NetWorthMini() {
  const { book, go } = useApp();
  const today = book.today;
  if (!book.accounts().length)
    return (
      <div className="panel">
        <div className="panel-h"><h3>Net worth</h3></div>
        <p className="small muted">Add your accounts and balances to see what you own minus what you owe. <button className="link" onClick={() => go("networth")}>Set it up</button></p>
      </div>
    );
  const now = book.netWorth(today), prev = book.netWorth(prevYM(today));
  const series: (number | null)[] = [];
  for (let i = 11; i >= 0; i--) series.push(book.netWorth(addMonths(today, -i))?.total ?? null);
  return (
    <div className="panel">
      <div className="panel-h"><h3>Net worth</h3><div className="end"><button className="btn ghost" onClick={() => go("networth")}>Open</button></div></div>
      <div className="nwmini">
        <span className="big num">{book.settings.currency} {money(now?.total ?? 0)}</span>
        <Delta cur={now?.total ?? null} prev={prev?.total ?? null} upGood label="last month" />
      </div>
      <Sparkline values={series} label="Net worth, last 12 months" />
    </div>
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
