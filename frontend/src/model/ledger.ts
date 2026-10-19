/** The ledger's arithmetic: totals, budgets, forecasts, comparisons and goals. Pure functions over a
 *  Ledger, so the views never compute money themselves and the tests cover all of it. */

import type { Category, Effect, Goal, Group, Kind, Ledger, Metric, Totals, YearDoc, YM } from "./types";

/** The three types every ledger starts with (and what older ledgers, saved before custom types, use). */
export const DEFAULT_KINDS: Kind[] = [
  { id: "income", name: "Income", effect: "in" },
  { id: "saving", name: "Saving", effect: "aside" },
  { id: "expense", name: "Spending", effect: "out" },
];

export const EFFECTS: { id: Effect; label: string; help: string }[] = [
  { id: "in", label: "Money in", help: "Adds to what's left over. Not budgeted." },
  { id: "aside", label: "Set aside", help: "Saved or invested. Budgeted, and counted in Saved." },
  { id: "out", label: "Money out", help: "Spent. Budgeted, and counted in Spent." },
  { id: "none", label: "Not counted", help: "Tracked only, like transfers or loans owed to you. Never in the totals." },
];

export const kindsOf = (s: { kinds?: Kind[] }) => (s.kinds?.length ? s.kinds : DEFAULT_KINDS);

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
  return { actual: {}, budget: {}, plan: {}, notes: {}, oneoff: {} };
}

function blank(): Totals {
  return { income: 0, saved: 0, spent: 0, left: 0, byGroup: {}, byCat: {}, has: false, oneOff: { income: 0, saved: 0, spent: 0, any: false, byGroup: {} } };
}

/** Indexes over one ledger. Build one per render (cheap) and ask it everything. */
export class Book {
  readonly cats: Record<string, Category> = {};
  readonly groups: Record<string, Group> = {};
  readonly kinds: Record<string, Kind> = {};

  /** `regularOnly` leaves one-offs out of every actual figure (see `regular`). */
  constructor(readonly ledger: Ledger, readonly today: YM = thisMonth(), readonly regularOnly = false) {
    ledger.settings.cats.forEach((c) => (this.cats[c.id] = c));
    ledger.settings.groups.forEach((g) => (this.groups[g.id] = g));
    kindsOf(ledger.settings).forEach((k) => (this.kinds[k.id] = k));
  }

  private _regular?: Book;
  /** The same ledger with one-offs left out: for comparing years and judging the usual month. */
  get regular(): Book {
    if (this.regularOnly) return this;
    return (this._regular ??= new Book(this.ledger, this.today, true));
  }

  get settings() {
    return this.ledger.settings;
  }

  kindList(): Kind[] {
    return kindsOf(this.settings);
  }

  year(y: number): YearDoc | undefined {
    return this.ledger.years[String(y)];
  }

  /** How a group's figures count. A group whose type was removed counts as money out. */
  effectOfGroup(g: Group | undefined): Effect {
    return (g && this.kinds[g.kind]?.effect) || "out";
  }

  effectOf(cid: string): Effect {
    return this.effectOfGroup(this.groups[this.cats[cid]?.group]);
  }

  catsIn(gid: string, includeArchived = false) {
    return this.settings.cats.filter((c) => c.group === gid && (includeArchived || !c.archived));
  }

  /** Groups whose money leaves what's left over: set aside or spent (stacked in the charts, budgeted). */
  outGroups() {
    return this.settings.groups.filter((g) => ["aside", "out"].includes(this.effectOfGroup(g)));
  }

  private add(r: Totals, cid: string, v: number) {
    const c = this.cats[cid];
    const g = c && this.groups[c.group];
    if (!g) return;
    r.has = true;
    r.byGroup[g.id] = (r.byGroup[g.id] || 0) + v;
    r.byCat[cid] = (r.byCat[cid] || 0) + v;
    const effect = this.effectOfGroup(g);
    if (effect === "in") r.income += v;
    else if (effect === "aside") r.saved += v;
    else if (effect === "out") r.spent += v;
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
      if (!row) continue;
      for (const [cid, v] of Object.entries(row)) {
        if (!isNum(v)) continue;
        const part = this.oneOffPart(y, m, cid);
        if (part) {
          const e = this.effectOf(cid);
          if (e !== "none") {
            r.oneOff.any = true;
            r.oneOff[e === "in" ? "income" : e === "aside" ? "saved" : "spent"] += part;
            const gid = this.cats[cid]?.group;
            if (gid) r.oneOff.byGroup[gid] = (r.oneOff.byGroup[gid] || 0) + part;
          }
        }
        this.add(r, cid, this.regularOnly ? v - part : v);
      }
    }
    return r;
  }

  oneOff(y: number, m: number, cid: string) {
    const o = this.year(y)?.oneoff?.[mk(m)]?.[cid];
    return o && isNum(o.amount) ? o : null;
  }

  /** How much of a month's figure is one-off: never more than the figure itself. */
  oneOffPart(y: number, m: number, cid: string): number {
    const o = this.oneOff(y, m, cid);
    const v = this.year(y)?.actual?.[mk(m)]?.[cid];
    if (!o || !isNum(v)) return 0;
    return v >= 0 ? Math.min(Math.max(o.amount, 0), v) : Math.max(Math.min(o.amount, 0), v);
  }

  hasOneOffs(): boolean {
    return Object.values(this.ledger.years).some((yd) => Object.values(yd.oneoff ?? {}).some((r) => Object.keys(r).length > 0));
  }

  lastDataMonth(y: number): number {
    for (let m = 12; m >= 1; m--) if (this.monthTotals(y, m).has) return m;
    return 0;
  }

  // Budgets --------------------------------------------------------------------------------------
  // A yearly plan spreads evenly across the months; a budget set for one month overrides that month.
  // Only savings and spending are budgeted: income is what comes in, so it has no budget, and a
  // forecast uses expectedIncome() for months that haven't happened.

  budgeted(cid: string): boolean {
    const e = this.effectOf(cid);
    return e === "aside" || e === "out";
  }

  planAnnual(y: number, cid: string): number | null {
    if (!this.budgeted(cid)) return null;
    const v = this.year(y)?.plan?.[cid];
    return isNum(v) ? v : null;
  }

  budgetOverride(y: number, m: number, cid: string): number | null {
    if (!this.budgeted(cid)) return null;
    const v = this.year(y)?.budget?.[mk(m)]?.[cid];
    return isNum(v) ? v : null;
  }

  /** What's likely to come in: the average income of the last `n` months (up to today) that had any.
   *  One-off income (a bonus, a sale) is left out: it isn't expected again. */
  expectedIncome(n = 3): { amount: number; months: number } {
    let p = this.today, sum = 0, found = 0;
    for (let i = 0; i < 24 && found < n; i++) {
      const t = this.regular.monthTotals(p.y, p.m);
      if (t.income > 0) { sum += t.income; found++; }
      p = prevYM(p);
    }
    return { amount: found ? sum / found : 0, months: found };
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

  /** What happened if the month has figures; otherwise its budget, with income expected at the recent average. */
  forecastMonth(y: number, m: number, expected = this.expectedIncome().amount): Totals & { src: "actual" | "budget" | "none" } {
    const t = this.monthTotals(y, m);
    if (t.has) return { ...t, src: "actual" };
    const p = this.planRange(y, m, m);
    const src = p.has ? "budget" : "none";
    if (!p.has) return { ...p, src };
    return { ...p, income: expected, left: expected - p.saved - p.spent, src };
  }

  forecastYear(y: number): Totals {
    const r = blank();
    const expected = this.expectedIncome().amount;
    for (let m = 1; m <= 12; m++) {
      const f = this.forecastMonth(y, m, expected);
      if (!f.has) continue;
      r.has = true;
      r.income += f.income;
      r.saved += f.saved;
      r.spent += f.spent;
      for (const [g, v] of Object.entries(f.byGroup)) r.byGroup[g] = (r.byGroup[g] || 0) + v;
    }
    r.left = r.income - r.saved - r.spent;
    return r;
  }

  /** The next `n` months from today, each with its forecast and the running total of what's left over. */
  ahead(n = 12) {
    const out: { ym: YM; f: ReturnType<Book["forecastMonth"]>; running: number }[] = [];
    let p = this.today, running = 0;
    const expected = this.expectedIncome().amount;
    for (let i = 0; i < n; i++) {
      const f = this.forecastMonth(p.y, p.m, expected);
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

  /** How much of a measure's figure for these months is one-off (in a regular book: how much was left out). */
  metricOneOff(y: number, m1: number, key: Metric, m2 = m1): number {
    const o = this.rangeTotals(y, m1, m2).oneOff;
    if (!o.any) return 0;
    if (key.startsWith("g:")) return o.byGroup[key.slice(2)] || 0;
    if (key.startsWith("c:")) { let s = 0; for (let m = m1; m <= m2; m++) s += this.oneOffPart(y, m, key.slice(2)); return s; }
    if (key === "left") return o.income - o.saved - o.spent;
    return o[key as "income" | "saved" | "spent"] || 0;
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
    if (key.startsWith("g:")) return this.effectOfGroup(this.groups[key.slice(2)]) !== "out";
    if (key.startsWith("c:")) return this.effectOf(key.slice(2)) !== "out";
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
