/** Edits applied to a draft copy of the ledger (see store.change). Each returns the save key it touched. */

import { emptyYear, mk } from "./ledger";
import type { Ledger, YearDoc } from "./types";

export function yearOf(l: Ledger, y: number): YearDoc {
  return (l.years[String(y)] ??= emptyYear());
}

export function setActual(l: Ledger, y: number, m: number, cid: string, v: number | null): string {
  const row = (yearOf(l, y).actual[mk(m)] ??= {});
  if (v == null) delete row[cid];
  else row[cid] = v;
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
