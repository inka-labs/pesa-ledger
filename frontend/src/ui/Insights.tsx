/** The insight cards: where this month's spending is heading, and a finished month reviewed against usual. */

import { useApp } from "../context";
import { money } from "../model/format";
import { pace, review } from "../model/insights";
import { MONTHS, MONTHS_LONG } from "../model/ledger";
import type { YM } from "../model/types";
import { changeBadge } from "./bits";
import { CalendarCheck2, Info, TrendingUp } from "lucide-react";

const HOW = "Expenses you add one at a time carry on at their daily rate; totals you type in count as done; anything not recorded yet is expected to reach its budget (or its usual amount).";

/** Two figures (where spending lands by month end, and how that sits against the budget), the bar, and the
 *  categories doing most to push it over. */
export function PaceCard() {
  const { book, go } = useApp();
  const p = pace(book);
  if (!p || (p.spent === 0 && p.projected === 0)) return null;
  const ym = book.today;
  const endLabel = `${p.end.getDate()} ${MONTHS[p.end.getMonth()]}`;
  const scale = Math.max(p.budget, p.projected, 1) * 1.04;
  const w = (v: number) => `${(Math.max(0, v) / scale) * 100}%`;
  const over = p.budget > 0 && p.gap > p.budget * 0.02;
  const under = p.budget > 0 && p.gap < -p.budget * 0.02;
  const tone = over ? (p.gap > p.budget * 0.1 ? "bad" : "warn") : under ? "good" : "";
  return (
    <section className="panel ins">
      <div className="ins-h">
        <span className="ins-i" aria-hidden><TrendingUp size={16} /></span>
        <h3>Where {MONTHS_LONG[ym.m - 1]} is heading</h3>
        <span className="pill">Day {p.day} of {p.days}</span>
        <span className="ins-how" tabIndex={0} title={HOW} aria-label={`How this is worked out: ${HOW}`}><Info size={15} aria-hidden /></span>
      </div>
      <div className="ins-figs">
        <div><span className="lbl">By {endLabel}</span><span className="num ins-big">{money(p.projected)}</span><span className="muted small">at this pace</span></div>
        {p.budget > 0 && (
          <div><span className="lbl">Against the budget</span>
            <span className={`num ins-big ${tone === "bad" ? "d-bad" : tone === "warn" ? "warn-ink" : tone === "good" ? "d-good" : ""}`}>
              {over ? `+${money(p.gap)}` : under ? `−${money(-p.gap)}` : "On it"}
            </span>
            <span className="muted small">{over ? "over" : under ? "to spare" : ""} · budget {money(p.budget)}</span></div>
        )}
        <div><span className="lbl">Spent so far</span><span className="num ins-big ins-mid">{money(p.spent)}</span><span className="muted small">{p.budget > 0 ? `${Math.round((p.spent / p.budget) * 100)}% of the budget` : ""}</span></div>
      </div>
      <div className="pace-bar" role="img" aria-label={`Spent ${money(p.spent)} so far, about ${money(p.projected)} by month end, budget ${money(p.budget)}`}>
        <i className="pb-spent" style={{ width: w(p.spent) }} />
        <i className={`pb-rest${over ? " over" : ""}`} style={{ left: w(p.spent), width: w(p.projected - p.spent) }} />
        {p.budget > 0 && <b className="pb-mark" style={{ left: w(p.budget) }} title={`Budget ${money(p.budget)}`} />}
      </div>
      <div className="pace-key small">
        <span><i className="pb-spent" /> Spent</span>
        <span><i className={`pb-rest${over ? " over" : ""}`} /> Still to come {money(Math.max(0, p.projected - p.spent))}</span>
        {p.budget > 0 && <span><i className="pb-mark-key" /> Budget</span>}
      </div>
      {p.budget > 0 && p.days > p.day && (
        <p className="allow small">
          {p.budget - p.spent > 0
            ? <>To finish on budget you can spend about <b className="num">{money((p.budget - p.spent) / (p.days - p.day))}</b> a day for the {p.days - p.day} days left.</>
            : <>The budget is used up, with {p.days - p.day} days to go.</>}
          {over && p.budget - p.spent > 0 && <> At this pace it's <b className="num d-bad">{money((p.projected - p.spent) / (p.days - p.day))}</b> a day.</>}
        </p>
      )}
      {!(over && p.drivers.length > 0) && (() => {
        const biggest = book.settings.cats
          .filter((c) => !c.archived && !c.oneoff && book.effectOf(c.id) === "out")
          .map((c) => ({ c, a: book.actual(ym.y, ym.m, c.id) ?? 0 }))
          .filter((x) => x.a > 0).sort((a, b) => b.a - a.a).slice(0, 4);
        if (!biggest.length) return null;
        const top = biggest[0].a;
        return (
          <div className="drivers">
            <span className="lbl">Most of it so far</span>
            {biggest.map(({ c, a }) => (
              <button key={c.id} className="driver" onClick={() => go("month", { ...ym, focusCat: c.id })} title={`Open ${c.name}`}>
                <span className="dn">{c.name}</span>
                <span className="dbar plain"><i style={{ width: `${(a / top) * 100}%` }} /></span>
                <span className="num">{money(a)}</span>
              </button>
            ))}
          </div>
        );
      })()}
      {over && p.drivers.length > 0 && (
        <div className="drivers">
          <span className="lbl">Pushing it over</span>
          {p.drivers.map((d) => (
            <button key={d.c.id} className="driver" onClick={() => go("month", { ...ym, focusCat: d.c.id })} title={`Open ${d.c.name}`}>
              <span className="dn">{d.c.name}</span>
              <span className="dbar"><i style={{ width: `${Math.min(100, (d.budget / d.projected) * 100)}%` }} /></span>
              <span className="num d-bad">+{money(d.projected - d.budget)}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

/** A finished month: the four totals with how they compare to usual, what changed most, and a verdict. */
export function ReviewCard({ ym }: { ym: YM }) {
  const { book, go } = useApp();
  const r = review(book, ym);
  if (!r) return null;
  const upGood = { income: true, spent: false, saved: true, left: true } as const;
  return (
    <section className="panel ins">
      <div className="ins-h">
        <span className="ins-i" aria-hidden><CalendarCheck2 size={16} /></span>
        <h3>{MONTHS_LONG[ym.m - 1]} in review</h3>
        <button className="link small end" onClick={() => go("month", { ...ym })}>Open {MONTHS[ym.m - 1]}</button>
      </div>
      <div className="rv-grid">
        {r.rows.map((row) => {
          const b = changeBadge(row.value, row.usual, upGood[row.key]);
          return (
            <div key={row.key} className="rv-cell">
              <span className="lbl">{row.label}</span>
              <span className={`num rv-v${row.key === "left" && row.value < 0 ? " d-bad" : ""}`}>{money(row.value)}</span>
              {b ? <span className="small"><span className={`badge ${b.good == null ? "" : b.good ? "up" : "down"}`}>{b.text}</span> <span className="muted">vs usual</span></span>
                : <span className="small muted">no usual month yet</span>}
            </div>
          );
        })}
      </div>
      {r.moves.length > 0 && (
        <div className="rv-moves">
          <span className="lbl">What changed most</span>
          <div className="pick-chips">
            {r.moves.map((x) => (
              <button key={x.c.id} className={`mv ${x.d > 0 ? "up" : "down"}`} onClick={() => go("month", { ...ym, focusCat: x.c.id })}
                title={`${x.c.name}: ${money(x.value)}, usually about ${money(x.usual)}`}>
                {x.d > 0 ? "▲" : "▼"} {x.c.name} <b className="num">{x.d > 0 ? "+" : "−"}{money(Math.abs(x.d))}</b>
              </button>
            ))}
          </div>
        </div>
      )}
      <p className="rv-verdict small">
        {r.budget && (r.budget.spent <= r.budget.budget
          ? <>Spending stayed within budget, <b className="num">{money(r.budget.budget - r.budget.spent)}</b> to spare{r.budget.over ? `, though ${r.budget.over} ${r.budget.over === 1 ? "category" : "categories"} went over` : ""}.</>
          : <>Spending went <b className="num d-bad">{money(r.budget.spent - r.budget.budget)}</b> over budget across {r.budget.over} {r.budget.over === 1 ? "category" : "categories"}.</>)}
        {r.savedRate != null && <> You saved <b>{Math.round(r.savedRate * 100)}%</b> of what came in{r.savedRate >= 0.2 ? " — at or above the 20% rule of thumb" : " — below the 20% rule of thumb"}.</>}
      </p>
    </section>
  );
}
