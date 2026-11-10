/** Edits applied to a draft copy of the ledger (see store.change). Each returns the save key it touched. */

import { addMonths, emptyYear, mk, nextYM, parseYM, ymKey } from "./ledger";
import type { Entry, Ledger, OneOff, YearDoc, YM } from "./types";

export function yearOf(l: Ledger, y: number): YearDoc {
  return (l.years[String(y)] ??= emptyYear());
}

export function setActual(l: Ledger, y: number, m: number, cid: string, v: number | null): string {
  const row = (yearOf(l, y).actual[mk(m)] ??= {});
  if (v == null) {
    delete row[cid];
    setOneOff(l, y, m, cid, null); // a one-off is part of a figure, so it goes with it
    const entries = yearOf(l, y).entries?.[mk(m)];
    if (entries) delete entries[cid]; // and so are the expenses that made it up
  } else row[cid] = v;
  return `y:${y}`;
}

/** "Add expense": add an amount to a category's figure for the month, and keep it in the month's list. */
export function addEntry(l: Ledger, y: number, m: number, cid: string, e: Entry): string {
  const yd = yearOf(l, y);
  const row = (yd.actual[mk(m)] ??= {});
  row[cid] = Math.round(((row[cid] ?? 0) + e.amount) * 100) / 100;
  const list = (((yd.entries ??= {})[mk(m)] ??= {})[cid] ??= []);
  list.push({ amount: e.amount, ...(e.note ? { note: e.note } : {}), ...(e.day ? { day: e.day } : {}) });
  return `y:${y}`;
}

/** Take an added expense back out: it leaves the list and its amount leaves the figure. */
export function removeEntry(l: Ledger, y: number, m: number, cid: string, index: number): string {
  const yd = yearOf(l, y);
  const list = yd.entries?.[mk(m)]?.[cid];
  if (!list?.[index]) return `y:${y}`;
  const [gone] = list.splice(index, 1);
  if (!list.length) delete yd.entries![mk(m)][cid];
  const row = (yd.actual[mk(m)] ??= {});
  const left = Math.round(((row[cid] ?? 0) - gone.amount) * 100) / 100;
  if (left === 0 && !list.length) setActual(l, y, m, cid, null);
  else row[cid] = left;
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

// Budgets one month at a time (the Budget page). A category has a usual monthly amount (stored as the
// yearly plan, which the months without their own budget share) and, for some months, an amount for
// that month only. Changing either keeps every other month's figure where it was.

function spread(l: Ledger, y: number, cid: string) {
  const yd = yearOf(l, y);
  let set = 0, free = 0;
  for (let i = 1; i <= 12; i++) {
    const v = yd.budget[mk(i)]?.[cid];
    if (typeof v === "number") set += v; else free++;
  }
  const plan = yd.plan[cid];
  // whole units, as the months show it (a yearly 454,000 is 37,833 a month, not 37,833.33)
  return { yd, set, free, usual: typeof plan === "number" && free ? Math.floor((plan - set) / free) : null };
}

/** The usual monthly amount: every month without a budget of its own gets `v` (null: no usual amount). */
export function setUsualBudget(l: Ledger, y: number, cid: string, v: number | null): string {
  const { yd, set, free } = spread(l, y, cid);
  if (v == null) delete yd.plan[cid];
  else yd.plan[cid] = Math.round((v * free + set) * 100) / 100;
  return `y:${y}`;
}

/** An amount for month `m` only (null: back to the usual amount). The other months keep theirs. */
export function setMonthOnly(l: Ledger, y: number, m: number, cid: string, v: number | null): string {
  const { yd, set, free, usual } = spread(l, y, cid);
  const old = yd.budget[mk(m)]?.[cid];
  const had = typeof old === "number";
  if (!had && v == null) return `y:${y}`;
  setBudget(l, y, m, cid, v);
  if (usual != null) {
    const nFree = free + (had ? 0 : -1) + (v == null ? 1 : 0);
    const nSet = set - (had ? old : 0) + (v ?? 0);
    yd.plan[cid] = Math.round((usual * nFree + nSet) * 100) / 100;
  }
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
