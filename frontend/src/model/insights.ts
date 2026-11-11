/** What the figures say, in words: the month's story against a usual month, where spending is heading by
 *  month end, what's probably missing, and what's out of the ordinary. Pure: everything comes from the Book
 *  and the date passed in, so it's tested like the rest of the maths.
 *
 *  "Usual" is a category's average over the three months before (months with any figures), one-off
 *  categories left out. Pace projects each category on its own: what was added one at a time continues at
 *  its daily rate, what was typed in as a total is taken as done, and a category with nothing yet is expected to reach
 *  its budget (or its usual amount when it has none). */

import { Book, MONTHS, MONTHS_LONG, prevYM } from "./ledger";
import type { Category, YM } from "./types";

const k = (v: number) => Math.round(v).toLocaleString("en-US");

/** The months before `ym` that have any figures, newest first, at most `n`. */
function priorMonths(book: Book, ym: YM, n = 3): YM[] {
  const out: YM[] = [];
  let p = prevYM(ym);
  for (let i = 0; i < 24 && out.length < n; i++) {
    if (book.monthTotals(p.y, p.m).has) out.push(p);
    p = prevYM(p);
  }
  return out;
}

/** A category's usual month: the middle of the months before `ym` that have figures (0 where it had none).
 *  The middle, not the average, so one big bill (a car service every four months) doesn't move "usual". */
export function usual(book: Book, ym: YM, cid: string, n = 3): { amount: number; months: number; times: number } {
  const ms = priorMonths(book, ym, n);
  const vals = ms.map((p) => book.actual(p.y, p.m, cid));
  const times = vals.filter((v) => v != null).length;
  const sorted = vals.map((v) => v ?? 0).sort((a, b) => a - b), h = Math.floor(sorted.length / 2);
  const amount = !sorted.length ? 0 : sorted.length % 2 ? sorted[h] : (sorted[h - 1] + sorted[h]) / 2;
  return { amount, months: ms.length, times };
}

/** The everyday categories insights look at: spending and saving, not archived, not one-off. */
const everyday = (book: Book, effects: string[] = ["out"]) =>
  book.settings.cats.filter((c) => !c.archived && !c.oneoff && effects.includes(book.effectOf(c.id)));

// The month in words -------------------------------------------------------------------------------

export type Story = { title: string; lines: string[] };

/** A finished month, told against a usual month: what came in, what went out, what changed most, saving. */
export function monthStory(book: Book, ym: YM): Story | null {
  const t = book.regular.monthTotals(ym.y, ym.m);
  if (!t.has) return null;
  const name = MONTHS_LONG[ym.m - 1];
  const ms = priorMonths(book, ym);
  const avg = (pick: (x: ReturnType<Book["monthTotals"]>) => number) =>
    ms.length ? ms.reduce((s, p) => s + pick(book.regular.monthTotals(p.y, p.m)), 0) / ms.length : null;
  const lines: string[] = [];
  const vs = (cur: number, was: number | null, more: string, less: string) => {
    if (was == null || was === 0) return "";
    const p = (cur - was) / Math.abs(was);
    return Math.abs(p) < 0.03 ? ", about the same as usual" : `, ${Math.round(Math.abs(p) * 100)}% ${p > 0 ? more : less} than usual`;
  };
  if (t.income) lines.push(`${k(t.income)} came in${vs(t.income, avg((x) => x.income), "more", "less")}.`);
  lines.push(`You spent ${k(t.spent)}${vs(t.spent, avg((x) => x.spent), "more", "less")}.`);

  // the categories that moved most against their usual month
  if (ms.length) {
    const moves = everyday(book).map((c) => ({ c, d: (book.actual(ym.y, ym.m, c.id) ?? 0) - usual(book, ym, c.id).amount }))
      .filter((x) => Math.abs(x.d) >= Math.max(500, t.spent * 0.01));
    const up = [...moves].sort((a, b) => b.d - a.d).filter((x) => x.d > 0).slice(0, 2);
    const down = [...moves].sort((a, b) => a.d - b.d).filter((x) => x.d < 0).slice(0, 1);
    const part = (xs: typeof up, word: string) => xs.map((x) => `${x.c.name} ${word} by ${k(Math.abs(x.d))}`).join(" and ");
    const said = [part(up, "rose"), part(down, "fell")].filter(Boolean).join("; ");
    if (said) lines.push(`${said}.`);
  }
  if (t.income > 0) {
    const rate = t.saved / t.income;
    lines.push(`You saved ${k(t.saved)}, ${Math.round(rate * 100)}% of what came in${rate >= 0.2 ? " — at or above the 20% rule of thumb" : ""}.`);
    lines.push(t.left >= 0 ? `${k(t.left)} was left over.` : `${k(-t.left)} more went out than came in.`);
  }
  const sv = book.spendingVsBudget(ym.y, ym.m);
  if (sv.budget > 0) {
    const over = everyday(book).filter((c) => { const b = book.planMonthly(ym.y, ym.m, c.id); const a = book.actual(ym.y, ym.m, c.id); return !!b && a != null && a > b; });
    lines.push(sv.spent <= sv.budget
      ? `Spending stayed within the budget, with ${k(sv.budget - sv.spent)} to spare${over.length ? `, though ${over.length} ${over.length === 1 ? "category went" : "categories went"} over` : ""}.`
      : `Spending went ${k(sv.spent - sv.budget)} over the budget; ${over.length} ${over.length === 1 ? "category was" : "categories were"} over.`);
  }
  return { title: `${name} ${ym.y} in words`, lines };
}

/** A finished month as figures to lay out: the four totals beside their usual month, the categories that
 *  moved most, and how spending did against the budget. */
export type Review = {
  ym: YM;
  rows: { key: "income" | "spent" | "saved" | "left"; label: string; value: number; usual: number | null }[];
  moves: { c: Category; value: number; usual: number; d: number }[];
  savedRate: number | null;
  budget: { spent: number; budget: number; over: number } | null;
};

export function review(book: Book, ym: YM): Review | null {
  const t = book.regular.monthTotals(ym.y, ym.m);
  if (!t.has) return null;
  const ms = priorMonths(book, ym);
  const avg = (k: "income" | "spent" | "saved" | "left") =>
    ms.length ? ms.reduce((s, p) => s + book.regular.monthTotals(p.y, p.m)[k], 0) / ms.length : null;
  const rows = ([["income", "Came in"], ["spent", "Spent"], ["saved", "Saved"], ["left", "Left over"]] as const)
    .map(([key, label]) => ({ key, label, value: t[key], usual: avg(key) }));
  const moves = ms.length ? everyday(book).map((c) => {
    const value = book.actual(ym.y, ym.m, c.id) ?? 0, u = usual(book, ym, c.id).amount;
    return { c, value, usual: u, d: value - u };
  }).filter((x) => Math.abs(x.d) >= Math.max(500, t.spent * 0.01)).sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, 4) : [];
  const sv = book.spendingVsBudget(ym.y, ym.m);
  const over = everyday(book).filter((c) => { const b = book.planMonthly(ym.y, ym.m, c.id); const a = book.actual(ym.y, ym.m, c.id); return !!b && a != null && a > b; }).length;
  return { ym, rows, moves, savedRate: t.income > 0 ? t.saved / t.income : null, budget: sv.budget > 0 ? { spent: sv.spent, budget: sv.budget, over } : null };
}

// Pace ---------------------------------------------------------------------------------------------

export type Pace = {
  day: number; days: number;
  /** the last day the month's spending covers: its calendar end, or the day before the next payday */
  end: Date;
  spent: number; projected: number; budget: number;
  /** projected minus budget: above 0 is heading over */
  gap: number;
  /** the categories adding most to an overspend, with their projection */
  drivers: { c: Category; projected: number; budget: number }[];
};

/** The days a ledger month's spending covers: the calendar month, or with a pay cycle from its payday to
 *  the day before the next one (October's pay on the 31st covers 31 Oct – 29 Nov). */
export function period(settings: { paycycle?: { payday: number } | null }, ym: YM): { start: Date; next: Date } {
  const pd = settings.paycycle?.payday;
  if (!pd) return { start: new Date(ym.y, ym.m - 1, 1), next: new Date(ym.y, ym.m, 1) };
  const on = (y: number, m0: number) => new Date(y, m0, Math.min(pd, new Date(y, m0 + 1, 0).getDate()));
  return { start: on(ym.y, ym.m - 1), next: on(ym.y, ym.m) };
}

/** Where this month's everyday spending is heading by the end of the period it covers. Null when today
 *  isn't inside that period. */
export function pace(book: Book, now = new Date()): Pace | null {
  const ym = book.today;
  const { start, next } = period(book.settings, ym);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (today < start || today >= next) return null;
  const DAY = 86_400_000;
  const days = Math.round((next.getTime() - start.getTime()) / DAY);
  const day = Math.min(days, Math.round((today.getTime() - start.getTime()) / DAY) + 1);
  const end = new Date(next.getTime() - DAY);
  let spent = 0, projected = 0, budget = 0;
  const drivers: Pace["drivers"] = [];
  for (const c of everyday(book)) {
    const a = book.actual(ym.y, ym.m, c.id);
    const b = book.planMonthly(ym.y, ym.m, c.id) ?? 0;
    const entries = book.year(ym.y)?.entries?.[ym.m < 10 ? `0${ym.m}` : String(ym.m)]?.[c.id] ?? [];
    let p: number;
    if (a == null) p = b || usual(book, ym, c.id).amount; // nothing yet: expect its budget, or its usual month
    else {
      // what was added one at a time carries on at its daily rate; anything typed in on top is taken as done
      const added = entries.reduce((s, e) => s + e.amount, 0);
      const typed = a - added;
      p = Math.max(a, typed + (entries.length >= 2 ? (added / day) * days : added));
    }
    spent += a ?? 0; projected += p; budget += b;
    if (b && p > b * 1.05) drivers.push({ c, projected: p, budget: b });
  }
  drivers.sort((x, y) => (y.projected - y.budget) - (x.projected - x.budget));
  return { day, days, end, spent, projected, budget, gap: projected - budget, drivers: drivers.slice(0, 3) };
}

// Missed and unusual -------------------------------------------------------------------------------

export type Flag = { kind: "missed" | "high" | "rising" | "quiet"; cid?: string; text: string };

/** Things worth a look this month: categories usually recorded that are still empty, spending well above
 *  its usual level, three months of rises, and how long since an expense was last added. */
export function flags(book: Book, now = new Date()): Flag[] {
  const ym = book.today;
  const out: Flag[] = [];
  const unpaid = new Set(book.unpaid(ym.y, ym.m).map((c) => c.id)); // repeating amounts are flagged elsewhere
  const ms = priorMonths(book, ym);
  for (const c of everyday(book, ["out", "aside"])) {
    const a = book.actual(ym.y, ym.m, c.id);
    const u = usual(book, ym, c.id);
    // in every one of the last three months, nothing yet this month
    if (a == null && ms.length >= 3 && u.times === ms.length && u.amount > 0 && !unpaid.has(c.id))
      out.push({ kind: "missed", cid: c.id, text: `${c.name}: nothing recorded yet. It's usually about ${k(u.amount)} a month.` });
    // well above its usual month (spending only: saving more isn't a problem)
    if (book.effectOf(c.id) === "out" && a != null && u.months >= 2 && u.amount > 0 && a > u.amount * 1.4 && a - u.amount >= 1000)
      out.push({ kind: "high", cid: c.id, text: `${c.name} is at ${k(a)} — usually about ${k(u.amount)}.` });
    // three finished months in a row, each higher than the last
    if (book.effectOf(c.id) === "out" && ms.length >= 3) {
      const [m3, m2, m1] = ms.slice(0, 3).map((p) => book.actual(p.y, p.m, c.id));
      if (m1 != null && m2 != null && m3 != null && m1 < m2 && m2 < m3 && m3 >= m1 * 1.15 && m3 - m1 >= 500)
        out.push({ kind: "rising", cid: c.id, text: `${c.name} has risen three months running: ${k(m1)} → ${k(m2)} → ${k(m3)} (${MONTHS[ms[0].m - 1]}).` });
    }
  }
  // how long since an expense was added one at a time (only for people who add them)
  const lastDay = (p: YM) => {
    const all = Object.values(book.year(p.y)?.entries?.[p.m < 10 ? `0${p.m}` : String(p.m)] ?? {}).flat();
    return all.length ? Math.max(...all.map((e) => e.day ?? 0)) : null;
  };
  const isNow = ym.y === now.getFullYear() && ym.m === now.getMonth() + 1;
  if (isNow) {
    const d = lastDay(ym);
    const gap = d ? now.getDate() - d : null;
    const usedBefore = d != null || lastDay(prevYM(ym)) != null;
    if (usedBefore && (gap == null ? now.getDate() >= 4 : gap >= 4))
      out.push({ kind: "quiet", text: gap == null ? `Nothing added this month yet (it's the ${now.getDate()}${suffix(now.getDate())}).` : `Nothing added for ${gap} days. Anything since the ${d}${suffix(d!)}?` });
  }
  const order = { quiet: 0, missed: 1, high: 2, rising: 3 } as const;
  return out.sort((a, b) => order[a.kind] - order[b.kind]);
}

const suffix = (d: number) => (d % 10 === 1 && d !== 11 ? "st" : d % 10 === 2 && d !== 12 ? "nd" : d % 10 === 3 && d !== 13 ? "rd" : "th");
