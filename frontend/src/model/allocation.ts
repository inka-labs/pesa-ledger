/** Spending-allocation rules: the long-standing ways of dividing income into shares (50/30/20, 70/20/10,
 *  the Babylon tenth, six jars...), and how the ledger's money falls into each one's buckets.
 *
 *  Each group or category is put in a bucket: what the person chose (settings.allocation.maps[rule]), else a
 *  sensible default from how it counts (saved → the savings bucket) and its name (rent → housing, family
 *  support → giving, entertainment → wants). Money left over counts towards savings unless they turn it off. */

import { addMonths, Book, nextYM } from "./ledger";
import type { Totals, YM } from "./types";

export type BucketKind = "max" | "min" | "target";
export type Role = "save" | "need" | "want" | "give" | "house" | "debt" | "learn" | "invest" | "living" | "reserve";
/** `test` is the question that decides whether something belongs; `inc` is what does and `exc` what doesn't
 *  (and where that goes instead). Unset, they come from the bucket's role (see ROLE_DEFS); `means` is the
 *  person's own wording for a bucket they made. */
export type Bucket = { id: string; name: string; pct: number; kind: BucketKind; role?: Role; hint?: string; test?: string; inc?: string; exc?: string; means?: string };
export type Definition = { test: string; inc: string; exc: string[] };
export type Rule = { id: string; name: string; source: string; idea: string; buckets: Bucket[] };

export const RULES: Rule[] = [
  {
    id: "50-30-20", name: "50/30/20", source: "Elizabeth Warren, All Your Worth (2005)",
    idea: "Half on needs, under a third on wants, a fifth saved or paying off debt.",
    buckets: [
      { id: "needs", name: "Needs", pct: 50, kind: "max", role: "need", hint: "Rent, food, transport, utilities, family you support" },
      { id: "wants", name: "Wants", pct: 30, kind: "max", role: "want", hint: "Eating out, entertainment, travel, gifts" },
      { id: "save", name: "Savings & debt", pct: 20, kind: "min", role: "save", hint: "Saving, investing, paying down debt", inc: "Savings accounts, money market funds, investments, pension, emergency fund, paying a loan off faster than you must" },
    ],
  },
  {
    id: "70-20-10", name: "70/20/10", source: "A simpler split for tighter incomes",
    idea: "Live on 70%, save 20%, and put 10% to debt or giving.",
    buckets: [
      { id: "living", name: "Living", pct: 70, kind: "max", role: "living" },
      { id: "save", name: "Savings", pct: 20, kind: "min", role: "save" },
      { id: "debt", name: "Debt or giving", pct: 10, kind: "target", role: "give", test: "Is it paying off a loan faster than you must, or giving money away?", inc: "Extra loan repayments, family support, tithe, offerings, charity", exc: "A loan's minimum repayment → Living" },
    ],
  },
  {
    id: "80-20", name: "Pay yourself first (80/20)", source: "The 'pay yourself first' principle",
    idea: "Save 20% the day income arrives; spend the rest without tracking it.",
    buckets: [
      { id: "save", name: "Paid to yourself", pct: 20, kind: "min", role: "save" },
      { id: "spend", name: "Everything else", pct: 80, kind: "max", role: "living", test: "Is it anything you didn't keep?", inc: "Rent, food, bills, transport, family support, fun: needs and wants alike" },
    ],
  },
  {
    id: "babylon", name: "The Babylon tenth", source: "George Clason, The Richest Man in Babylon (1926)",
    idea: "“A part of all you earn is yours to keep”: never less than a tenth.",
    buckets: [
      { id: "keep", name: "Kept", pct: 10, kind: "min", role: "save" },
      { id: "spend", name: "Spent", pct: 90, kind: "max", role: "living", test: "Is it anything you didn't keep?", inc: "Rent, food, bills, transport, family support, fun: needs and wants alike" },
    ],
  },
  {
    id: "10-10-80", name: "10/10/80", source: "The tithe tradition",
    idea: "Give a tenth, save a tenth, live on the rest.",
    buckets: [
      { id: "give", name: "Given", pct: 10, kind: "target", role: "give", hint: "Church, charity, family support" },
      { id: "save", name: "Saved", pct: 10, kind: "min", role: "save" },
      { id: "live", name: "Lived on", pct: 80, kind: "max", role: "living" },
    ],
  },
  {
    id: "six-jars", name: "Six jars", source: "T. Harv Eker, Secrets of the Millionaire Mind (2005)",
    idea: "Necessities 55%, and five jars of 10% (5% for giving) for the long term, investing, learning, play and others.",
    buckets: [
      { id: "nec", name: "Necessities", pct: 55, kind: "max", role: "need" },
      { id: "ltss", name: "Long-term savings", pct: 10, kind: "min", role: "reserve", hint: "Big purchases, sinking funds, emergencies" },
      { id: "ffa", name: "Financial freedom", pct: 10, kind: "min", role: "invest", hint: "Investments you never spend" },
      { id: "edu", name: "Education", pct: 10, kind: "target", role: "learn" },
      { id: "play", name: "Play", pct: 10, kind: "target", role: "want" },
      { id: "give", name: "Give", pct: 5, kind: "target", role: "give" },
    ],
  },
  {
    id: "30-30-30-10", name: "30/30/30/10", source: "A split for high savers",
    idea: "A third on housing, a third on everything else, a third saved, a tenth for fun.",
    buckets: [
      { id: "house", name: "Housing", pct: 30, kind: "max", role: "house" },
      { id: "living", name: "Other living costs", pct: 30, kind: "max", role: "need" },
      { id: "save", name: "Savings & goals", pct: 30, kind: "min", role: "save" },
      { id: "fun", name: "Wants", pct: 10, kind: "max", role: "want" },
    ],
  },
];

export const CUSTOM_ID = "custom";

export function ruleById(book: Book, id: string | null | undefined): Rule | null {
  if (!id) return null;
  if (id === CUSTOM_ID) {
    const buckets = book.settings.allocation?.custom ?? [];
    if (!buckets.length) return null;
    return { id: CUSTOM_ID, name: "Your own split", source: "Set by you", idea: buckets.map((b) => `${b.name} ${b.pct}%`).join(", "), buckets: buckets.map((b) => ({ ...b, role: /sav|keep|invest|emerg/i.test(b.name) ? "save" : undefined })) };
  }
  return RULES.find((r) => r.id === id) ?? null;
}

/** What each kind of bucket holds: a question to ask, what goes in, and what doesn't with the kind of
 *  bucket it goes to instead (named after the rule's own bucket; left out when the rule has none, or it's this one). */
export const ROLE_DEFS: Record<Role, { test: string; inc: string; exc?: [string, Role, "only"?][] }> = {
  save: { test: "Is it money you keep: saved, invested or put away for later?", inc: "Savings accounts, money market funds, investments, pension, emergency fund, life cover that builds value",
    exc: [["Money put aside for a known bill (a sinking fund)", "reserve", "only"]] },
  invest: { test: "Is it invested to grow, money you never spend?", inc: "Shares, money market funds, bonds, unit trusts, pension",
    exc: [["Savings for a planned purchase or a known bill", "reserve"]] },
  reserve: { test: "Is it put aside for a big purchase, a known bill or an emergency?", inc: "Emergency fund, sinking funds for the car service, insurance, appliances, medical costs" },
  give: { test: "Is it money you give away?", inc: "Family support, school fees you pay for someone else, tithe, offerings, charity, contributions",
    exc: [["Gifts for occasions", "want"]] },
  learn: { test: "Does it grow your own skills or knowledge?", inc: "Courses, books, training, your own school fees",
    exc: [["Fees you pay for someone else", "give"]] },
  house: { test: "Is it what you pay for the home itself?", inc: "Rent, mortgage, service charge, house insurance",
    exc: [["Bills (electricity, water, Wi‑Fi, garbage) and household things", "need"], ["Furniture and upgrades you could put off", "want"]] },
  need: { test: "Would you still pay it in a tight month, to live and work normally?",
    inc: "Food, electricity, water, Wi‑Fi, garbage, transport and fuel, medical costs, car insurance and servicing, laundry, family you've committed to support",
    exc: [["A pricier version of a need (eating out instead of cooking, a premium plan)", "want"]] },
  want: { test: "Could you drop or put it off for a few months without real harm?", inc: "Entertainment, streaming, eating out, travel, hobbies, the gym, gadgets and equipment, gifts" },
  living: { test: "Is it spent on day-to-day life, needs and wants alike?", inc: "Rent, food, bills, transport, family support, fun",
    exc: [["Money kept or invested", "save"]] },
  debt: { test: "Is it repaying a loan?", inc: "Loan and credit card repayments" },
};

/** The order to ask a rule's questions in: the first yes decides. Narrow questions come before broad ones. */
const ASK: Role[] = ["save", "invest", "reserve", "give", "learn", "debt", "house", "need", "want", "living"];

/** A bucket's definition within its rule: its own wording, else its role's, else (a bucket of your own) what you wrote. */
export function defineBucket(rule: Rule, b: Bucket): Definition {
  const base = b.role ? ROLE_DEFS[b.role] : null;
  const exc = b.exc ? [b.exc] : b.means ? [] : (base?.exc ?? []).flatMap(([what, role, only]) => {
    const to = only ? rule.buckets.find((x) => x.role === role)?.id : bucketFor(rule, role);
    return to && to !== b.id ? [`${what} → ${rule.buckets.find((x) => x.id === to)!.name}`] : [];
  });
  return { test: b.test ?? b.means ?? base?.test ?? `Does it belong in ${b.name}?`, inc: b.inc ?? (b.means ? "" : base?.inc ?? ""), exc };
}

/** A rule's buckets in the order to ask about them. */
export function askOrder(rule: Rule): Bucket[] {
  const at = (b: Bucket) => (b.role ? ASK.indexOf(b.role) : ASK.length);
  return [...rule.buckets].sort((a, b) => at(a) - at(b));
}

/** Whether you chose a category's bucket (for it or its group), rather than it being guessed from names. */
export function placedByYou(book: Book, rule: Rule, cid: string): boolean {
  const map = book.settings.allocation?.maps?.[rule.id] ?? {};
  const c = book.cats[cid];
  const ok = (v?: string) => !!v && rule.buckets.some((b) => b.id === v);
  return ok(map[`c:${cid}`]) || (!!c && ok(map[`g:${c.group}`]));
}

const NAME_ROLE: [RegExp, Role][] = [
  [/\brent\b|housing|mortgage|\bhouse\b/i, "house"], // whole words: "Parents" isn't rent
  [/family|support|parent|sibling|church|tithe|charit|giv|donat|offering|zakat/i, "give"],
  [/loan|debt|repay|credit card/i, "debt"],
  [/school|fees|course|educat|book|training|learn/i, "learn"],
  [/entertain|\bfun\b|leisure|eat(ing)? out|restaurant|travel|holiday|vacation|gift|shopping|cloth|hobby|subscri|\bplay\b/i, "want"],
  [/sinking|reserve|emergenc/i, "reserve"], // money set aside for known costs: a savings jar where the rule has one
  [/invest|mmf|money market|stock|shares|unit trust|pension|bond/i, "invest"],
];

/** The bucket a role lands in for a rule, falling back to the nearest one it has. */
function bucketFor(rule: Rule, role: Role): string {
  const by = (r: Role) => rule.buckets.find((b) => b.role === r)?.id;
  const fallback: Record<Role, Role[]> = {
    save: ["save", "reserve", "invest"], invest: ["invest", "save", "reserve"], need: ["need", "living"], living: ["living", "need"],
    want: ["want", "living", "need"], give: ["give", "debt" as Role, "need", "living"], house: ["house", "need", "living"],
    debt: ["debt" as Role, "give", "save"], learn: ["learn", "need", "living"], reserve: ["reserve", "need", "living"],
  };
  for (const r of fallback[role]) { const id = by(r); if (id) return id; }
  return rule.buckets[rule.buckets.length - 1].id;
}

/** Where a category goes when nobody has said: by how it counts, then by its name or its group's name. */
export function defaultBucket(book: Book, rule: Rule, cid: string): string | null {
  const effect = book.effectOf(cid);
  if (effect === "in" || effect === "none") return null;
  const c = book.cats[cid], g = c && book.groups[c.group];
  const words = `${c?.name ?? ""} ${g?.name ?? ""}`;
  if (effect === "aside") {
    const invest = NAME_ROLE.find(([re, r]) => r === "invest" && re.test(words));
    return bucketFor(rule, invest ? "invest" : "save");
  }
  // the category's own name first (Entertainment in a "Sinking funds" group is a want), then its group's
  for (const text of [c?.name ?? "", g?.name ?? ""])
    for (const [re, role] of NAME_ROLE) if (re.test(text) && role !== "invest") return bucketFor(rule, role);
  return bucketFor(rule, "need");
}

/** The bucket a category is in: chosen for the category, else for its group, else the default. */
export function bucketOf(book: Book, rule: Rule, cid: string): string | null {
  const map = book.settings.allocation?.maps?.[rule.id] ?? {};
  const c = book.cats[cid];
  const chosen = map[`c:${cid}`] ?? (c ? map[`g:${c.group}`] : undefined);
  if (chosen && rule.buckets.some((b) => b.id === chosen)) return chosen;
  return defaultBucket(book, rule, cid);
}

export type Tone = "good" | "warn" | "bad";
export type BucketResult = { bucket: Bucket; amount: number; share: number; target: number; gap: number; tone: Tone; leftover: number };

/** How a bucket's share compares with its rule: within a couple of points is on target. */
export function judge(kind: BucketKind, share: number, pct: number): Tone {
  const d = share * 100 - pct;
  if (kind === "max") return d <= 2 ? "good" : d <= 8 ? "warn" : "bad";
  if (kind === "min") return d >= -1 ? "good" : d >= -5 ? "warn" : "bad";
  return Math.abs(d) <= 3 ? "good" : Math.abs(d) <= 8 ? "warn" : "bad";
}

/** Split a period's totals into a rule's buckets, as shares of `income`. */
export function allocate(book: Book, rule: Rule, t: Totals, income = t.income) {
  const sums: Record<string, number> = Object.fromEntries(rule.buckets.map((b) => [b.id, 0]));
  for (const [cid, v] of Object.entries(t.byCat)) {
    const b = bucketOf(book, rule, cid);
    if (b) sums[b] += v;
  }
  const out = Object.values(sums).reduce((a, b) => a + b, 0);
  const left = income - out;
  const leftoverOn = book.settings.allocation?.leftover !== false;
  const saveId = (["save", "reserve", "invest"] as Role[]).map((r) => rule.buckets.find((b) => b.role === r)?.id).find(Boolean);
  let leftoverAdded = 0;
  if (leftoverOn && left > 0 && saveId) { sums[saveId] += left; leftoverAdded = left; }
  const rows: BucketResult[] = rule.buckets.map((b) => {
    const share = income > 0 ? sums[b.id] / income : 0;
    return { bucket: b, amount: sums[b.id], share, target: (b.pct / 100) * income, gap: sums[b.id] - (b.pct / 100) * income, tone: judge(b.kind, share, b.pct), leftover: b.id === saveId ? leftoverAdded : 0 };
  });
  return { income, rows, unassigned: leftoverOn ? Math.min(0, left) : left, score: rows.filter((r) => r.tone === "good").length };
}

// Periods ------------------------------------------------------------------------------------------

export type PeriodId = "month" | "next" | "ytd" | "12m";
export const PERIODS: { id: PeriodId; label: string }[] = [
  { id: "month", label: "This month" }, { id: "next", label: "Next month" }, { id: "ytd", label: "This year" }, { id: "12m", label: "Last 12 months" },
];

function add(into: Totals, t: Totals) {
  into.has ||= t.has;
  into.income += t.income; into.saved += t.saved; into.spent += t.spent; into.left += t.left;
  for (const [k, v] of Object.entries(t.byCat)) into.byCat[k] = (into.byCat[k] || 0) + v;
  for (const [k, v] of Object.entries(t.byGroup)) into.byGroup[k] = (into.byGroup[k] || 0) + v;
}
const empty = (): Totals => ({ income: 0, saved: 0, spent: 0, left: 0, byGroup: {}, byCat: {}, has: false, oneOff: { income: 0, saved: 0, spent: 0, any: false, byGroup: {} } });

/** A period's months, what actually happened in them (one-offs left out) and what was budgeted. Budget
 *  shares are of the same income: recorded income for months that happened, expected income for the rest. */
export function period(book: Book, id: PeriodId) {
  const today = book.today;
  const months: YM[] = [];
  if (id === "month") months.push(today);
  else if (id === "next") months.push(nextYM(today));
  else if (id === "ytd") for (let m = 1; m <= today.m; m++) months.push({ y: today.y, m });
  else for (let i = 11; i >= 0; i--) months.push(addMonths(today, -i));
  const actual = empty(), budget = empty();
  const expected = book.expectedIncome().amount;
  for (const p of months) {
    const t = book.regular.monthTotals(p.y, p.m);
    add(actual, t);
    const b = book.planRange(p.y, p.m, p.m);
    if (b.has) { b.income = t.income > 0 ? t.income : expected; b.left = b.income - b.saved - b.spent; add(budget, b); }
  }
  return { months, actual: actual.has ? actual : null, budget: budget.has ? budget : null };
}
