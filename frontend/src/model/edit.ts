/** Edits applied to a draft copy of the ledger (see store.change). Each returns the save key it touched. */

import { addMonths, emptyYear, mk, nextYM, parseYM, ymKey } from "./ledger";
import type { Ledger, OneOff, YearDoc, YM } from "./types";

export function yearOf(l: Ledger, y: number): YearDoc {
  return (l.years[String(y)] ??= emptyYear());
}

export function setActual(l: Ledger, y: number, m: number, cid: string, v: number | null): string {
  const row = (yearOf(l, y).actual[mk(m)] ??= {});
  if (v == null) {
    delete row[cid];
    setOneOff(l, y, m, cid, null); // a one-off is part of a figure, so it goes with it
  } else row[cid] = v;
  return `y:${y}`;
}

/** Mark part of a month's figure as one-off (null: it's all regular again). */
export function setOneOff(l: Ledger, y: number, m: number, cid: string, o: OneOff | null): string {
  const all = (yearOf(l, y).oneoff ??= {});
  const row = (all[mk(m)] ??= {});
  if (!o || !o.amount) delete row[cid];
  else row[cid] = { amount: o.amount, note: (o.note ?? "").trim() };
  if (!Object.keys(row).length) delete all[mk(m)];
  return `y:${y}`;
}

/** One month's budget on its own; null goes back to the yearly plan's even share. */
export function setBudget(l: Ledger, y: number, m: number, cid: string, v: number | null): string {
  const row = (yearOf(l, y).budget[mk(m)] ??= {});
  if (v == null) delete row[cid];
  else row[cid] = v;
  return `y:${y}`;
}

/** A yearly figure, spread evenly: it replaces any month-by-month budgets for that category. */
export function setPlan(l: Ledger, y: number, cid: string, v: number | null): string {
  const yd = yearOf(l, y);
  if (v == null) delete yd.plan[cid];
  else yd.plan[cid] = v;
  Object.values(yd.budget).forEach((row) => delete row[cid]);
  return `y:${y}`;
}

export function setNote(l: Ledger, y: number, m: number, text: string): string {
  const yd = yearOf(l, y);
  if (text.trim()) yd.notes[mk(m)] = text;
  else delete yd.notes[mk(m)];
  return `y:${y}`;
}

/** An account's balance at the end of a month (null clears it). */
export function setBalance(l: Ledger, y: number, m: number, aid: string, v: number | null): string {
  const all = (yearOf(l, y).balances ??= {});
  const row = (all[mk(m)] ??= {});
  if (v == null) delete row[aid];
  else row[aid] = v;
  if (!Object.keys(row).length) delete all[mk(m)];
  return `y:${y}`;
}

/** The bill a fund was for has been paid: what's left over starts the next cycle, `every` months on
 *  (a one-time fund is removed). `saved` is what the fund held, `paid` what the bill came to. */
export function payFund(l: Ledger, cid: string, saved: number, paid: number, today: YM): void {
  const c = l.settings.cats.find((x) => x.id === cid);
  if (!c?.fund) return;
  if (!c.fund.every) { delete c.fund; return; }
  // the next bill is `every` months after this one; a bill paid late doesn't start the next cycle
  // already overdue, so step on until the next due month is after this one
  let due = addMonths(parseYM(c.fund.due), c.fund.every);
  while (due.y * 12 + due.m <= today.y * 12 + today.m) due = addMonths(due, c.fund.every);
  c.fund = { ...c.fund, start: Math.max(0, saved - paid), from: ymKey(nextYM(today)), due: ymKey(due) };
}
