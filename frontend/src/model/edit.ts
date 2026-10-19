/** Edits applied to a draft copy of the ledger (see store.change). Each returns the save key it touched. */

import { emptyYear, mk } from "./ledger";
import type { Ledger, OneOff, YearDoc } from "./types";

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
