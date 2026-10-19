/** The ledger's arithmetic: totals, budgets, forecasts, comparisons and goals. Pure functions over a
 *  Ledger, so the views never compute money themselves and the tests cover all of it. */

import type { Category, Goal, Group, Ledger, Metric, Totals, YearDoc, YM } from "./types";

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export const mk = (m: number) => String(m).padStart(2, "0");
export const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function thisMonth(d = new Date()): YM {
  return { y: d.getFullYear(), m: d.getMonth() + 1 };
}
export const prevYM = ({ y, m }: YM): YM => (m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 });
export const nextYM = ({ y, m }: YM): YM => (m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 });
export const before = (a: YM, b: YM) => a.y < b.y || (a.y === b.y && a.m < b.m);
export const parseYM = (s: string): YM => { const [y, m] = s.split("-").map(Number); return { y, m }; };
export const fmtYM = ({ y, m }: YM) => `${MONTHS[m - 1]} ${y}`;

export function emptyYear(): YearDoc {
  return { actual: {}, budget: {}, plan: {}, notes: {} };
}

function blank(): Totals {
  return { income: 0, saved: 0, spent: 0, left: 0, byGroup: {}, byCat: {}, has: false };
}

/** Indexes over one ledger. Build one per render (cheap) and ask it everything. */
export class Book {
  readonly cats: Record<string, Category> = {};
  readonly groups: Record<string, Group> = {};

  constructor(readonly ledger: Ledger, readonly today: YM = thisMonth()) {
    ledger.settings.cats.forEach((c) => (this.cats[c.id] = c));
    ledger.settings.groups.forEach((g) => (this.groups[g.id] = g));
  }

  get settings() {
    return this.ledger.settings;
  }

  year(y: number): YearDoc | undefined {
    return this.ledger.years[String(y)];
  }

  kindOf(cid: string) {
    return this.groups[this.cats[cid]?.group]?.kind;
  }

  catsIn(gid: string, includeArchived = false) {
    return this.settings.cats.filter((c) => c.group === gid && (includeArchived || !c.archived));
  }

  outGroups() {
    return this.settings.groups.filter((g) => g.kind !== "income");
  }

  private add(r: Totals, cid: string, v: number) {
    const c = this.cats[cid];
    const g = c && this.groups[c.group];
    if (!g) return;
    r.has = true;
    r.byGroup[g.id] = (r.byGroup[g.id] || 0) + v;
    r.byCat[cid] = (r.byCat[cid] || 0) + v;
    if (g.kind === "income") r.income += v;
    else if (g.kind === "saving") r.saved += v;
    else r.spent += v;
    r.left = r.income - r.saved - r.spent;
  }

  // Actual figures -----------------------------------------------------------------------------

  actual(y: number, m: number, cid: string): number | null {
    const v = this.year(y)?.actual?.[mk(m)]?.[cid];
    return isNum(v) ? v : null;
  }

  monthTotals(y: number, m: number): Totals {
    return this.rangeTotals(y, m, m);
  }

  rangeTotals(y: number, m1: number, m2: number): Totals {
    const r = blank();
    for (let m = m1; m <= m2; m++) {
      const row = this.year(y)?.actual?.[mk(m)];
      if (row) for (const [cid, v] of Object.entries(row)) if (isNum(v)) this.add(r, cid, v);
    }
    return r;
  }

  lastDataMonth(y: number): number {
    for (let m = 12; m >= 1; m--) if (this.monthTotals(y, m).has) return m;
    return 0;
  }

  // Budgets --------------------------------------------------------------------------------------
  // A yearly plan spreads evenly across the months; a budget set for one month overrides that month.

  planAnnual(y: number, cid: string): number | null {
    const v = this.year(y)?.plan?.[cid];
    return isNum(v) ? v : null;
  }

  budgetOverride(y: number, m: number, cid: string): number | null {
    const v = this.year(y)?.budget?.[mk(m)]?.[cid];
    return isNum(v) ? v : null;
  }

  planMonthly(y: number, m: number, cid: string): number | null {
    const o = this.budgetOverride(y, m, cid);
    if (o != null) return o;
    const a = this.planAnnual(y, cid);
    return a == null ? null : a / 12;
  }

  planYear(y: number, cid: string): number | null {
    let s = 0, any = false;
    for (let m = 1; m <= 12; m++) {
      const v = this.planMonthly(y, m, cid);
      if (v != null) { s += v; any = true; }
    }
    return any ? s : null;
  }

  planRange(y: number, m1: number, m2: number): Totals {
    const r = blank();
    for (const c of this.settings.cats)
      for (let m = m1; m <= m2; m++) {
        const v = this.planMonthly(y, m, c.id);
        if (v != null) this.add(r, c.id, v);
      }
    return r;
  }

  hasAnyBudget(y: number): boolean {
    const yd = this.year(y);
    return !!yd && (Object.keys(yd.plan || {}).length > 0 || Object.values(yd.budget || {}).some((r) => Object.keys(r).length > 0));
  }

  /** What happened if the month has figures, otherwise what's budgeted. */
  forecastMonth(y: number, m: number): Totals & { src: "actual" | "budget" | "none" } {
    const t = this.monthTotals(y, m);
    if (t.has) return { ...t, src: "actual" };
    const p = this.planRange(y, m, m);
    return { ...p, src: p.has ? "budget" : "none" };
  }

  forecastYear(y: number): Totals {
    const r = blank();
    for (let m = 1; m <= 12; m++) {
      const f = this.forecastMonth(y, m);
      for (const [cid, v] of Object.entries(f.byCat)) this.add(r, cid, v);
    }
    return r;
  }

  /** The next `n` months from today, each with its forecast and the running total of what's left over. */
  ahead(n = 12) {
    const out: { ym: YM; f: ReturnType<Book["forecastMonth"]>; running: number }[] = [];
    let p = this.today, running = 0;
    for (let i = 0; i < n; i++) {
      const f = this.forecastMonth(p.y, p.m);
      running += f.left;
      out.push({ ym: p, f, running });
      p = nextYM(p);
    }
    return out;
  }

  // Comparisons ----------------------------------------------------------------------------------

  metric(y: number, m1: number, key: Metric, m2 = m1): number | null {
    const t = this.rangeTotals(y, m1, m2);
    if (!t.has) return null;
    if (key.startsWith("g:")) return t.byGroup[key.slice(2)] || 0;
    if (key.startsWith("c:")) return t.byCat[key.slice(2)] || 0;
    return t[key as "income" | "saved" | "spent" | "left"];
  }

  metricLabel(key: Metric): string {
    const base: Record<string, string> = { income: "Income", saved: "Saved", spent: "Spent", left: "Left over" };
    if (base[key]) return base[key];
    if (key.startsWith("g:")) return this.groups[key.slice(2)]?.name || "Group";
    if (key.startsWith("c:")) return this.cats[key.slice(2)]?.name || "Category";
    return key;
  }

  /** Whether a rise is good news: more income or savings is, more spending isn't. */
  upIsGood(key: Metric): boolean {
    if (key === "spent") return false;
    if (key.startsWith("g:")) return this.groups[key.slice(2)]?.kind !== "expense";
    if (key.startsWith("c:")) return this.kindOf(key.slice(2)) !== "expense";
    return true;
  }

  knownYears(): number[] {
    const s = new Set([this.today.y + 1, this.today.y, this.today.y - 1, ...Object.keys(this.ledger.years).map(Number)]);
    return [...s].filter((n) => !Number.isNaN(n)).sort((a, b) => b - a);
  }

  catHasData(cid: string): boolean {
    return Object.values(this.ledger.years).some(
      (yd) =>
        Object.values(yd.actual || {}).some((r) => isNum(r?.[cid])) ||
        isNum(yd.plan?.[cid]) ||
        Object.values(yd.budget || {}).some((r) => isNum(r?.[cid])),
    );
  }

  // Goals ----------------------------------------------------------------------------------------

  goal(g: Goal) {
    const from = parseYM(g.from || `${this.today.y}-01`);
    const deadline = parseYM(g.deadline || `${this.today.y}-12`);
    let contributed = 0, monthsWith = 0;
    for (const y of Object.keys(this.ledger.years).map(Number).sort()) {
      if (y < from.y) continue;
      for (let m = 1; m <= 12; m++) {
        if (y === from.y && m < from.m) continue;
        let any = false;
        for (const cid of g.cats) {
          const v = this.actual(y, m, cid);
          if (v != null) { contributed += v; any = true; }
        }
        if (any) monthsWith++;
      }
    }
    const saved = (g.start || 0) + contributed;
    const remaining = Math.max(0, g.target - saved);
    const monthsLeft = Math.max(0, (deadline.y - this.today.y) * 12 + (deadline.m - this.today.m) + 1);
    const average = monthsWith ? contributed / monthsWith : 0;
    const neededPerMonth = monthsLeft ? remaining / monthsLeft : remaining;

    let atPace: YM | null = null;
    if (remaining > 0 && average > 0) {
      let p = this.today;
      for (let i = 1; i < Math.ceil(remaining / average); i++) p = nextYM(p);
      atPace = p;
    }

    // Project forward on the linked categories' budgets, for months without actual figures.
    let projected = saved, onBudget: YM | null = null, byDeadline = saved, budgeted = false;
    let p = this.today;
    for (let i = 0; i < 120; i++) {
      if (!before(p, from)) {
        const hasActual = g.cats.some((cid) => this.actual(p.y, p.m, cid) != null);
        if (!hasActual)
          for (const cid of g.cats) {
            const v = this.planMonthly(p.y, p.m, cid);
            if (v) { projected += v; budgeted = true; }
          }
      }
      if (!onBudget && projected >= g.target) onBudget = p;
      if (!before(deadline, p)) byDeadline = projected;
      p = nextYM(p);
    }
    const reached = remaining === 0;
    const onTrack = reached || (budgeted ? byDeadline >= g.target : average >= neededPerMonth);
    return {
      saved, remaining, average, neededPerMonth, monthsLeft, atPace, onBudget, byDeadline, budgeted, reached, onTrack,
      progress: g.target ? Math.min(1, saved / g.target) : 0,
    };
  }
}
