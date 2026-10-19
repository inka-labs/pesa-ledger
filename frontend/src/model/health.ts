/** Is the money going where it should? Each check compares the ledger with a common rule of thumb and says
 *  good / warn / bad, with the figures behind it. One-offs are left out throughout: they'd make a usual
 *  month look unusual. Rules: savings ≥ 20% of income (50/30/20), rent ≤ 30% of income, an emergency fund
 *  of at least 6 months of essential costs (more when income varies), spending growing no faster than income. */

import { addMonths, Book, MONTHS, nextYM, fmtYM } from "./ledger";
import type { YM } from "./types";

export type Tone = "good" | "warn" | "bad" | "info";
export type CheckId = "savings" | "ef" | "fixed" | "rent" | "growth" | "negative" | "funds" | "income";
export type Check = {
  id: CheckId;
  title: string;
  /** the headline figure, e.g. "34%" or "2.6 months" */
  value: string;
  tone: Tone;
  /** one or two sentences: what it means, with the figures */
  detail: string;
  /** the rule it's measured against */
  rule: string;
  /** what to set up first, when the check can't run */
  setup?: string;
};

const pc = (x: number) => `${Math.round(x * 100)}%`;
const k = (v: number) => Math.round(v).toLocaleString("en-US");
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b), h = Math.floor(s.length / 2);
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
};

/** The figures the checks share: the last 12 months (to this one) that have any figures, one-offs left out. */
export function healthStats(book: Book) {
  const R = book.regular;
  const window: { ym: YM; t: ReturnType<Book["monthTotals"]> }[] = [];
  for (let i = 11; i >= 0; i--) {
    const ym = addMonths(book.today, -i);
    const t = R.monthTotals(ym.y, ym.m);
    if (t.has) window.push({ ym, t });
  }
  const incomes = window.map((w) => w.t.income).filter((v) => v > 0);
  const avgIncome = mean(incomes);
  const sd = Math.sqrt(mean(incomes.map((v) => (v - avgIncome) ** 2)));
  const totalIncome = window.reduce((s, w) => s + w.t.income, 0);
  const totalSaved = window.reduce((s, w) => s + w.t.saved, 0);

  // essential costs a month: the higher of the last three recorded months and next month's budget,
  // so a new, higher rent counts from the month it's budgeted
  const outGroups = book.settings.groups.filter((g) => book.effectOfGroup(g) === "out").map((g) => g.id);
  const essential = (book.settings.health?.essential ?? outGroups).filter((id) => book.groups[id]);
  const ess = (t: { byGroup: Record<string, number> }) => essential.reduce((s, id) => s + (t.byGroup[id] || 0), 0);
  const recent = window.slice(-3).map((w) => ess(w.t));
  const next = nextYM(book.today);
  const nextPlan = ess(book.planRange(next.y, next.m, next.m));
  const essentials = Math.max(mean(recent), nextPlan);

  return {
    window, months: window.length, avgIncome, typicalIncome: median(incomes), lowIncome: incomes.length ? Math.min(...incomes) : 0,
    cv: avgIncome ? sd / avgIncome : 0, savingsRate: totalIncome ? totalSaved / totalIncome : 0, totalIncome,
    essential, essentials, essentialsFromBudget: nextPlan > mean(recent),
    negative: window.filter((w) => w.t.left < 0).map((w) => w.ym),
  };
}

/** How many months of essential costs the fund should hold, by how much income varies. */
export function efTargetMonths(cv: number): number {
  return cv < 0.2 ? 6 : cv < 0.4 ? 9 : 12;
}

/** The emergency fund's balance: an account's latest balance or a goal's progress. */
export function emergencyFund(book: Book): { name: string; amount: number } | null {
  const ef = book.settings.health?.ef;
  if (!ef) return null;
  const id = ef.slice(2);
  if (ef.startsWith("a:")) {
    const a = book.accounts(true).find((x) => x.id === id);
    const b = a && book.balanceAsOf(book.today, a.id);
    return a ? { name: a.name, amount: b?.value ?? 0 } : null;
  }
  const g = book.settings.goals.find((x) => x.id === id);
  return g ? { name: g.name, amount: book.goal(g).saved } : null;
}

export function rentCategory(book: Book) {
  const id = book.settings.health?.rent;
  if (id && book.cats[id]) return book.cats[id];
  return book.settings.cats.find((c) => /\brent\b/i.test(c.name) && book.effectOf(c.id) === "out") ?? null;
}

export function healthChecks(book: Book): Check[] {
  const s = healthStats(book);
  const out: Check[] = [];
  if (!s.months) return out;
  const R = book.regular;

  // 1. Savings rate
  out.push({
    id: "savings", title: "Savings rate", value: pc(s.savingsRate),
    tone: s.savingsRate >= 0.2 ? "good" : s.savingsRate >= 0.1 ? "warn" : "bad",
    rule: "Save at least 20% of income (the 50/30/20 rule)",
    detail: `Over the last ${s.months} months you set aside ${k(s.savingsRate * s.totalIncome)} of ${k(s.totalIncome)} that came in.`,
  });

  // 2. Emergency fund cover
  const ef = emergencyFund(book);
  const target = efTargetMonths(s.cv);
  if (!ef) {
    out.push({ id: "ef", title: "Emergency fund", value: "–", tone: "info", rule: "At least 6 months of essential costs",
      detail: "Choose the account or goal that holds your emergency fund to see how many months it would cover.", setup: "Choose your emergency fund" });
  } else {
    const cover = s.essentials ? ef.amount / s.essentials : 0;
    out.push({
      id: "ef", title: "Emergency fund", value: `${cover.toFixed(1)} months`,
      tone: cover >= 6 ? "good" : cover >= 3 ? "warn" : "bad",
      rule: `At least 6 months of essential costs${target > 6 ? `; ${target} with income that varies as much as yours` : ""}`,
      detail: `${ef.name} holds ${k(ef.amount)}. Essential costs run about ${k(s.essentials)} a month${s.essentialsFromBudget ? " (next month's budget)" : ""}, so 6 months is ${k(6 * s.essentials)}${target > 6 ? ` and ${target} months is ${k(target * s.essentials)}` : ""}.`,
    });
  }

  // 3. Essential costs against a weak month
  if (s.lowIncome > 0) {
    const r = s.essentials / s.lowIncome;
    out.push({
      id: "fixed", title: "Essentials in a weak month", value: pc(r),
      tone: r <= 0.6 ? "good" : r <= 1 ? "warn" : "bad",
      rule: "Essential costs well within your lowest month's income (under 60%)",
      detail: `Essentials of about ${k(s.essentials)} a month against your lowest month of ${k(s.lowIncome)}${r > 1 ? `: a month like that falls ${k(s.essentials - s.lowIncome)} short, which the emergency fund has to cover` : ""}. In a typical month (${k(s.typicalIncome)}) they're ${pc(s.essentials / s.typicalIncome)}.`,
    });
  }

  // 4. Rent
  const rent = rentCategory(book);
  if (!rent) {
    out.push({ id: "rent", title: "Rent", value: "–", tone: "info", rule: "Rent at most 30% of income",
      detail: "Choose your rent category to compare it with your income.", setup: "Choose your rent category" });
  } else if (s.avgIncome > 0) {
    const next = nextYM(book.today);
    let amount = book.planMonthly(next.y, next.m, rent.id);
    if (amount == null) for (let i = 0; i < 12 && amount == null; i++) { const p = addMonths(book.today, -i); amount = R.actual(p.y, p.m, rent.id); }
    if (amount != null) {
      const r = amount / s.avgIncome;
      out.push({
        id: "rent", title: "Rent", value: pc(r),
        tone: r <= 0.3 ? "good" : r <= 0.4 ? "warn" : "bad",
        rule: "Rent at most 30% of income",
        detail: `${rent.name} at ${k(amount)} a month against average income of ${k(s.avgIncome)}. In your lowest month it would be ${pc(amount / s.lowIncome)}.`,
      });
    }
  }

  // 5. Spending growing faster than income (this year to date against the same months last year)
  const y = book.today.y, upto = book.today.m;
  const now = R.rangeTotals(y, 1, upto), then = R.rangeTotals(y - 1, 1, upto);
  if (now.has && then.has && then.income > 0 && then.spent > 0) {
    const gi = (now.income - then.income) / then.income, gs = (now.spent - then.spent) / then.spent;
    const faster = book.settings.groups
      .filter((g) => book.effectOfGroup(g) === "out" && (then.byGroup[g.id] || 0) > 0)
      .map((g) => ({ g, r: ((now.byGroup[g.id] || 0) - then.byGroup[g.id]) / then.byGroup[g.id] }))
      .filter((x) => x.r > gi + 0.02)
      .sort((a, b) => b.r - a.r);
    const sign = (x: number) => `${x >= 0 ? "+" : "−"}${pc(Math.abs(x))}`;
    out.push({
      id: "growth", title: "Spending vs income", value: `${sign(gs)} vs ${sign(gi)}`,
      tone: gs <= gi + 0.02 ? "good" : gs <= gi + 0.1 ? "warn" : "bad",
      rule: "Spending growing no faster than income",
      detail: `Jan–${MONTHS[upto - 1]} against the same months of ${y - 1}: spending ${sign(gs)}, income ${sign(gi)}.${faster.length ? ` Growing faster than income: ${faster.slice(0, 3).map((x) => `${x.g.name} (${sign(x.r)})`).join(", ")}.` : ""}`,
    });
  }

  // 6. Months that went negative
  const n = s.negative.length;
  out.push({
    id: "negative", title: "Months in the red", value: String(n),
    tone: n === 0 ? "good" : n <= 2 ? "warn" : "bad",
    rule: "Spend and save no more than comes in each month",
    detail: n ? `${s.negative.map(fmtYM).join(", ")} took more than came in, leaving one-offs aside.` : `None of the last ${s.months} months took more than came in.`,
  });

  // 7. Sinking funds
  const funds = book.settings.cats.filter((c) => c.fund && !c.archived).map((c) => ({ c, f: book.fund(c.id)! }));
  if (funds.length) {
    const short = funds.filter((x) => x.f.status === "short" || x.f.status === "overdue");
    const over = funds.filter((x) => x.f.over > 0);
    out.push({
      id: "funds", title: "Sinking funds", value: `${funds.length - short.length} of ${funds.length} on track`,
      tone: funds.some((x) => x.f.status === "overdue") ? "bad" : short.length ? "warn" : "good",
      rule: "Each fund holds its bill by the time it's due",
      detail: [
        short.length ? `Short: ${short.map((x) => `${x.c.name} by ${k(x.f.short)}`).join(", ")}.` : "",
        over.length ? `More than needed: ${over.map((x) => `${x.c.name} by ${k(x.f.over)}`).join(", ")}, which could go elsewhere.` : "",
      ].filter(Boolean).join(" ") || "Every fund will hold its bill in time.",
    });
  }

  // 8. How much income varies
  if (s.months >= 3 && s.avgIncome > 0) {
    out.push({
      id: "income", title: "Income", value: s.cv < 0.2 ? "Steady" : s.cv < 0.4 ? "Varies" : "Varies a lot",
      tone: "info", rule: "The more income varies, the bigger the emergency fund should be",
      detail: `Average ${k(s.avgIncome)} a month, typical ${k(s.typicalIncome)}, lowest ${k(s.lowIncome)} (it moves about ±${pc(s.cv)}). Plan essentials from the typical or lowest month, not the average.`,
    });
  }
  return out;
}
