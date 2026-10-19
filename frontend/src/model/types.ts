/** The ledger's shape, as the API stores it (backend/pesa_ledger/ledger.py validates the same). */

/** How a type of group counts: money in, set aside (saved or invested), money out, or tracked only. */
export type Effect = "in" | "aside" | "out" | "none";
/** A type of group the user defines: "Income", "Business", "Debt repayment"... */
export type Kind = { id: string; name: string; effect: Effect };

export type Group = {
  id: string;
  name: string;
  /** a Kind id */
  kind: string;
  /** position in the palette (0 = the text colour), unless `color` is set */
  slot: number;
  color?: string | null;
};
export type Category = {
  id: string;
  name: string;
  group: string;
  archived?: boolean;
  /** the amount that comes in or goes out every month: offered on the Month page, and the budget when none is set */
  repeat?: number | null;
  /** a sinking fund kept in this category */
  fund?: Fund | null;
};

/** Money set aside in a category (from `from`, plus `start` already there) towards a bill of `target` due by
 *  `due`. When it's paid, the next cycle starts `every` months later (0: a one-time fund). */
export type Fund = { target: number; due: string; start: number; from: string; every: number };

/** Somewhere money sits or is owed. `cats` are the categories whose amounts are contributions to it. */
export type Account = { id: string; name: string; debt?: boolean; cats: string[]; archived?: boolean };

/** What the Health page needs: the emergency fund ("a:<account>" | "g:<goal>"), essential groups, rent. */
export type HealthSettings = { ef?: string | null; essential?: string[] | null; rent?: string | null };
export type Goal = {
  id: string;
  name: string;
  target: number;
  /** "YYYY-MM" */
  deadline: string;
  /** already put aside before `from` */
  start: number;
  /** "YYYY-MM": contributions count from this month */
  from: string;
  cats: string[];
};

export type Settings = {
  v: number;
  currency: string;
  /** a second currency to show totals in; `auto` (the default) uses the live rate, otherwise `rate` */
  alt?: { code: string; rate?: number | null; auto?: boolean } | null;
  /** group types; older ledgers have none saved and use DEFAULT_KINDS */
  kinds?: Kind[];
  /** "pesa" or a Matplotlib colormap name */
  palette?: string;
  groups: Group[];
  cats: Category[];
  goals: Goal[];
  accounts?: Account[];
  health?: HealthSettings | null;
  example?: boolean;
};

/** month key "01".."12" -> category id -> amount */
export type MonthMap = Record<string, Record<string, number>>;

export type YearDoc = {
  actual: MonthMap;
  /** a budget set for one month on its own; overrides the yearly plan's even share */
  budget: MonthMap;
  /** yearly budget per category, spread evenly over months without a budget of their own */
  plan: Record<string, number>;
  notes: Record<string, string>;
  /** month key -> category id -> the part of that month's figure that won't repeat (a car, a renovation) */
  oneoff?: Record<string, Record<string, OneOff>>;
  /** month key -> account id -> its balance at the end of the month */
  balances?: MonthMap;
};

/** Part of an actual figure, not added to it. Comparisons and forecasts can leave it out. */
export type OneOff = { amount: number; note?: string };

export type Ledger = { settings: Settings; years: Record<string, YearDoc> };

export type Totals = {
  income: number;
  saved: number;
  spent: number;
  /** income − saved − spent */
  left: number;
  byGroup: Record<string, number>;
  byCat: Record<string, number>;
  has: boolean;
  /** one-off parts of the figures: included above, or (in a Book that leaves them out) what was left out */
  oneOff: { income: number; saved: number; spent: number; any: boolean; byGroup: Record<string, number> };
};

export type YM = { y: number; m: number };

/** "income" | "saved" | "spent" | "left" | "g:<group id>" | "c:<category id>" */
export type Metric = string;
