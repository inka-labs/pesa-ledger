/** The insight cards: where this month's spending is heading, and a finished month in words. */

import { useApp } from "../context";
import { money } from "../model/format";
import { monthStory, pace } from "../model/insights";
import { MONTHS, MONTHS_LONG } from "../model/ledger";
import type { YM } from "../model/types";
import { BookOpenText, Gauge } from "lucide-react";

/** "At this pace you'll spend about X by 30 Nov": spent so far, the rest projected, and the budget mark. */
export function PaceCard() {
  const { book, go } = useApp();
  const p = pace(book);
  if (!p || (p.spent === 0 && p.projected === 0)) return null;
  const ym = book.today;
  const end = `${p.days} ${MONTHS[ym.m - 1]}`;
  const scale = Math.max(p.budget, p.projected, 1) * 1.04;
  const w = (v: number) => `${(Math.max(0, v) / scale) * 100}%`;
  const over = p.budget > 0 && p.gap > p.budget * 0.02;
  const under = p.budget > 0 && p.gap < -p.budget * 0.02;
  return (
    <section className="panel pace">
      <div className="panel-h">
        <span className="ins-i" aria-hidden><Gauge size={16} /></span>
        <h3>Where {MONTHS_LONG[ym.m - 1]} is heading</h3>
        <span className="muted small">day {p.day} of {p.days}</span>
      </div>
      <p className="pace-say">
        At this pace you'll spend about <b className="num">{money(p.projected)}</b> by {end}
        {p.budget > 0 && (over
          ? <>, <b className="d-bad">{money(p.gap)} over</b> the budget of {money(p.budget)}.</>
          : under ? <>, <b className="d-good">{money(-p.gap)} under</b> the budget of {money(p.budget)}.</>
          : <>, right on the budget of {money(p.budget)}.</>)}
        {p.budget <= 0 && "."}
      </p>
      <div className="pace-bar" role="img" aria-label={`Spent ${money(p.spent)} so far, about ${money(p.projected)} by month end, budget ${money(p.budget)}`}>
        <i className="pb-spent" style={{ width: w(p.spent) }} />
        <i className={`pb-rest${over ? " over" : ""}`} style={{ left: w(p.spent), width: w(p.projected - p.spent) }} />
        {p.budget > 0 && <b className="pb-mark" style={{ left: w(p.budget) }} title={`Budget ${money(p.budget)}`} />}
      </div>
      <div className="pace-key small">
        <span><i className="pb-spent" /> Spent so far <b className="num">{money(p.spent)}</b></span>
        <span><i className={`pb-rest${over ? " over" : ""}`} /> Still to come <b className="num">{money(Math.max(0, p.projected - p.spent))}</b></span>
        {p.budget > 0 && <span><i className="pb-mark-key" /> Budget <b className="num">{money(p.budget)}</b></span>}
      </div>
      {over && p.drivers.length > 0 && (
        <p className="small muted">
          Mostly {p.drivers.map((d, i) => (
            <span key={d.c.id}>{i ? (i === p.drivers.length - 1 ? " and " : ", ") : ""}<button className="link" onClick={() => go("month", { ...ym, focusCat: d.c.id })}>{d.c.name}</button> (heading for {money(d.projected)} of {money(d.budget)})</span>
          ))}.
        </p>
      )}
      <p className="small muted">Expenses you add one at a time carry on at their daily rate; totals you type in count as done; anything not recorded yet is expected to reach its budget.</p>
    </section>
  );
}

/** A finished month, in a few plain sentences. */
export function StoryCard({ ym }: { ym: YM }) {
  const { book, go } = useApp();
  const s = monthStory(book, ym);
  if (!s) return null;
  return (
    <section className="panel story">
      <div className="panel-h">
        <span className="ins-i" aria-hidden><BookOpenText size={16} /></span>
        <h3>{s.title}</h3>
        <div className="end"><button className="btn ghost" onClick={() => go("month", { ...ym })}>Open {MONTHS[ym.m - 1]}</button></div>
      </div>
      <ul className="story-lines">{s.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
    </section>
  );
}
