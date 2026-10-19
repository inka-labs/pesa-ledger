/** The ledger's shape, as the API stores it (backend/pesa_ledger/ledger.py validates the same). */

export type Kind = "income" | "saving" | "expense";

export type Group = { id: string; name: string; kind: Kind; slot: number };
export type Category = { id: string; name: string; group: string; archived?: boolean };
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
  groups: Group[];
  cats: Category[];
  goals: Goal[];
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
};

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
};

export type YM = { y: number; m: number };

/** "income" | "saved" | "spent" | "left" | "g:<group id>" | "c:<category id>" */
export type Metric = string;
