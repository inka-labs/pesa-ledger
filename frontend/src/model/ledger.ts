/** The ledger's arithmetic: totals, budgets, forecasts, comparisons and goals. Pure functions over a
 *  Ledger, so the views never compute money themselves and the tests cover all of it. */

import type { Category, Effect, Goal, Group, Kind, Ledger, Metric, PayCycle, Totals, YearDoc, YM } from "./types";

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
/** The month whose figures you're living on today. With a pay cycle that's last month's until payday. */
export function currentMonth(settings?: { paycycle?: PayCycle | null } | null, d = new Date()): YM {
  const t = thisMonth(d), pc = settings?.paycycle;
  if (!pc) return t;
  // a payday past the end of a short month means its last day
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return d.getDate() >= Math.min(pc.payday, last) ? t : prevYM(t);
}
export const prevYM = ({ y, m }: YM): YM => (m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 });
export const nextYM = ({ y, m }: YM): YM => (m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 });
export const before = (a: YM, b: YM) => a.y < b.y || (a.y === b.y && a.m < b.m);
export const parseYM = (s: string): YM => { const [y, m] = s.split("-").map(Number); return { y, m }; };
export const fmtYM = ({ y, m }: YM) => `${MONTHS[m - 1]} ${y}`;
/** "September pay → October spending", when months are pay cycles; null otherwise. */
export function cycleLabel(settings: { paycycle?: PayCycle | null }, ym: YM, long = true): string | null {
  if (!settings.paycycle) return null;
  const n = addMonths(ym, 1), names = long ? MONTHS_LONG : MONTHS;
  return `${names[ym.m - 1]} pay → ${names[n.m - 1]}${n.y !== ym.y ? ` ${n.y}` : ""} spending`;
}
export const ymKey = ({ y, m }: YM) => `${y}-${mk(m)}`;
/** `n` months after (or before, when negative) a month. */
export const addMonths = ({ y, m }: YM, n: number): YM => { const i = y * 12 + (m - 1) + n; return { y: Math.floor(i / 12), m: (i % 12) + 1 }; };
/** Months from `a` to `b`, counting both (0 when `b` is before `a`). */
export const monthsFromTo = (a: YM, b: YM) => Math.max(0, (b.y - a.y) * 12 + (b.m - a.m) + 1);

export function emptyYear(): YearDoc {
  return { actual: {}, budget: {}, plan: {}, notes: {}, oneoff: {}, balances: {}, entries: {} };
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

  /** How much of a month's figure is one-off: all of it in a one-off category, else the part marked as
   *  one-off that month (never more than the figure itself). */
  oneOffPart(y: number, m: number, cid: string): number {
    const v = this.year(y)?.actual?.[mk(m)]?.[cid];
    if (this.cats[cid]?.oneoff) return isNum(v) ? v : 0;
    const o = this.oneOff(y, m, cid);
    if (!o || !isNum(v)) return 0;
    return v >= 0 ? Math.min(Math.max(o.amount, 0), v) : Math.max(Math.min(o.amount, 0), v);
  }

  /** Everyday spending against its budget for a month, one-offs left out of both (a car bought from a
   *  one-off category isn't "over budget"); `oneOff` is what was spent on one-offs beside it. */
  spendingVsBudget(y: number, m: number): { spent: number; budget: number; oneOff: number } {
    const t = this.monthTotals(y, m);
    let budget = 0;
    for (const c of this.settings.cats)
      if (!c.oneoff && this.effectOf(c.id) === "out") budget += this.planMonthly(y, m, c.id) ?? 0;
    return { spent: t.spent - t.oneOff.spent, budget, oneOff: t.oneOff.spent };
  }

  hasOneOffs(): boolean {
    if (this.settings.cats.some((c) => c.oneoff)) return true;
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

  /** What's likely to come in: the average income of the last `n` finished months that had any. This
   *  month isn't one of them: it's still coming in (a salary not recorded yet would pull it down).
   *  One-off income (a bonus, a sale) is left out: it isn't expected again. */
  expectedIncome(n = 3): { amount: number; months: number } {
    let p = prevYM(this.today), sum = 0, found = 0;
    for (let i = 0; i < 24 && found < n; i++) {
      const t = this.regular.monthTotals(p.y, p.m);
      if (t.income > 0) { sum += t.income; found++; }
      p = prevYM(p);
    }
    return { amount: found ? sum / found : 0, months: found };
  }

  /** A month's budget: its own, else its share of the yearly plan, else the category's repeating amount.
   *  The months without a budget of their own share what the yearly plan has left after the ones that
   *  do, in whole units (the last of them takes the remainder), so the year still adds up to the plan. */
  planMonthly(y: number, m: number, cid: string): number | null {
    const o = this.budgetOverride(y, m, cid);
    if (o != null) return o;
    const a = this.planAnnual(y, cid);
    if (a != null) {
      let set = 0, free = 0, last = 0;
      for (let i = 1; i <= 12; i++) {
        const v = this.budgetOverride(y, i, cid);
        if (v != null) set += v;
        else { free++; last = i; }
      }
      const rest = Math.max(0, a - set);
      const share = Math.floor(rest / free);
      return m === last ? rest - share * (free - 1) : share;
    }
    const r = this.cats[cid]?.repeat;
    return this.budgeted(cid) && isNum(r) && !this.cats[cid].archived ? r : null;
  }

  // Repeating amounts ----------------------------------------------------------------------------

  /** Categories with a repeating amount that have nothing recorded for the month yet. */
  unpaid(y: number, m: number): Category[] {
    return this.settings.cats.filter((c) => isNum(c.repeat) && c.repeat !== 0 && !c.archived && this.effectOf(c.id) !== "none" && this.actual(y, m, c.id) == null);
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

  /** What happened if the month has figures; otherwise its budget, with income expected at the recent
   *  average. This month counts what's recorded so far plus the budget of every category with nothing
   *  recorded yet, and the expected income until some comes in. */
  forecastMonth(y: number, m: number, expected = this.expectedIncome().amount): Totals & { src: "actual" | "budget" | "none" } {
    const t = this.monthTotals(y, m);
    if (t.has && y === this.today.y && m === this.today.m) {
      const r: Totals = { ...t, byGroup: { ...t.byGroup }, byCat: { ...t.byCat } };
      for (const c of this.settings.cats) {
        if (this.actual(y, m, c.id) != null) continue;
        const v = this.planMonthly(y, m, c.id);
        if (v != null) this.add(r, c.id, v);
      }
      if (r.income === 0) r.income = expected;
      r.left = r.income - r.saved - r.spent;
      return { ...r, src: "actual" };
    }
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

  // Sinking funds --------------------------------------------------------------------------------

  /** Where a category's sinking fund stands: what's in it, what the bill needs, and whether the budget gets there. */
  fund(cid: string) {
    const f = this.cats[cid]?.fund;
    if (!f) return null;
    const from = parseYM(f.from);
    // a bill due in a month is paid from the month before's pay when months are pay cycles
    const due = this.settings.paycycle ? prevYM(parseYM(f.due)) : parseYM(f.due);
    let contributed = 0, monthsWith = 0;
    for (let p = from; !before(this.today, p); p = nextYM(p)) {
      const v = this.actual(p.y, p.m, cid);
      if (v != null) { contributed += v; monthsWith++; }
    }
    const saved = (f.start || 0) + contributed;
    // months still to put money in: from this month (if it has nothing yet) to the due month
    const firstOpen = this.actual(this.today.y, this.today.m, cid) == null ? this.today : nextYM(this.today);
    const monthsLeft = monthsFromTo(firstOpen, due);
    let planned = 0;
    for (let i = 0, p = firstOpen; i < monthsLeft; i++, p = nextYM(p)) planned += this.planMonthly(p.y, p.m, cid) ?? 0;
    const remaining = Math.max(0, f.target - saved);
    const projected = saved + planned;
    const average = monthsWith ? contributed / monthsWith : 0;
    const neededPerMonth = monthsLeft ? remaining / monthsLeft : remaining;
    const status: "ready" | "on-pace" | "short" | "overdue" =
      saved >= f.target ? "ready" : monthsLeft === 0 ? "overdue" : projected >= f.target - 0.5 ? "on-pace" : "short";
    return {
      fund: f, saved, remaining, monthsLeft, neededPerMonth, average, planned, projected,
      /** what will be in it beyond the bill: by now if it's already there, else by the due month on budget */
      over: Math.max(0, (status === "ready" ? saved : projected) - f.target),
      short: Math.max(0, f.target - projected),
      status, progress: f.target > 0 ? Math.min(1, saved / f.target) : 0,
    };
  }

  // Accounts and net worth ---------------------------------------------------------------------------

  accounts(includeArchived = false) {
    return (this.settings.accounts ?? []).filter((a) => includeArchived || !a.archived);
  }

  balance(y: number, m: number, aid: string): number | null {
    const v = this.year(y)?.balances?.[mk(m)]?.[aid];
    return isNum(v) ? v : null;
  }

  /** The last balance recorded for an account at or before a month (balances carry forward), within ten years. */
  balanceAsOf(ym: YM, aid: string): { value: number; ym: YM } | null {
    let p = ym;
    for (let i = 0; i < 120; i++, p = prevYM(p)) {
      const v = this.balance(p.y, p.m, aid);
      if (v != null) return { value: v, ym: p };
    }
    return null;
  }

  /** Assets minus debts at the end of a month, each account at its latest balance; null before any balance. */
  netWorth(ym: YM): { total: number; assets: number; debts: number; byAccount: Record<string, number> } | null {
    let assets = 0, debts = 0, any = false;
    const byAccount: Record<string, number> = {};
    for (const a of this.accounts(true)) {
      const b = this.balanceAsOf(ym, a.id);
      if (!b) continue;
      any = true;
      byAccount[a.id] = b.value;
      if (a.debt) debts += b.value; else assets += b.value;
    }
    return any ? { total: assets - debts, assets, debts, byAccount } : null;
  }

  /** What an account gained in a month beyond what was put in: interest, returns or a change in value.
   *  Needs a balance for the month and for the one before. For a debt, it's what the debt grew by beyond
   *  repayments (so interest charged shows as a positive figure). */
  growth(y: number, m: number, aid: string): number | null {
    const a = this.accounts(true).find((x) => x.id === aid);
    const now = this.balance(y, m, aid);
    const p = prevYM({ y, m });
    const before_ = this.balance(p.y, p.m, aid);
    if (!a || now == null || before_ == null) return null;
    // a debt's change is mostly repayments: without knowing them, there's no telling what interest cost
    if (a.debt && !a.cats.length) return null;
    const put = a.cats.reduce((s, cid) => s + (this.actual(y, m, cid) ?? 0), 0);
    return a.debt ? now - before_ + put : now - before_ - put;
  }

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
