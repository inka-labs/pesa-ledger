import { createContext, useContext } from "react";
import type { Book } from "./model/ledger";
import type { Rates, Read } from "./model/money";
import type { Ledger, Metric } from "./model/types";

export type Tab = "overview" | "more" | "health" | "month" | "year" | "compare" | "networth" | "budget" | "goals" | "funds" | "allocation" | "settings" | "categories" | "appearance";
export type Section = { id: string; label: string; tabs: { id: Tab; label: string }[] };

/** Three everyday pages in the order a month runs (how it's going, the plan, what was spent), everything else one click
 *  away under More, and how the ledger is set up under Settings. */
export const SECTIONS: Section[] = [
  { id: "main", label: "", tabs: [{ id: "overview", label: "Home" }, { id: "budget", label: "Budget" }, { id: "month", label: "Spending" }, { id: "more", label: "More" }] },
  { id: "more", label: "More", tabs: [{ id: "year", label: "Year" }, { id: "compare", label: "Compare" }, { id: "health", label: "Health" }, { id: "networth", label: "Net worth" }, { id: "goals", label: "Goals" }, { id: "funds", label: "Sinking funds" }, { id: "allocation", label: "Allocation" }] },
  { id: "setup", label: "Settings", tabs: [{ id: "settings", label: "General" }, { id: "categories", label: "Categories" }, { id: "appearance", label: "Appearance" }] },
];
/** What each page under More is for, in a line (the More page and search show it). */
export const ABOUT: Partial<Record<Tab, string>> = {
  year: "Month by month for a whole year, against budget",
  compare: "Two years side by side: what changed",
  health: "Your money against common rules of thumb",
  networth: "What you own minus what you owe, month by month",
  goals: "Save towards a target by a date",
  funds: "Put money aside for bills you know are coming",
  allocation: "How your income splits: 50/30/20 and other rules",
};
export const TABS = SECTIONS.flatMap((s) => s.tabs);
export const sectionOf = (tab: Tab) => SECTIONS.find((s) => s.tabs.some((t) => t.id === tab))!;

export type View = {
  y: number;
  m: number;
  yearView: number;
  cmpA: number;
  cmpB: number;
  cmpMetric: Metric;
  cmpSame: boolean;
  planYear: number;
  /** the month the Budget page shows (its own, so planning December doesn't move Spending) */
  planMonth: number;
  catHint: boolean;
  /** leave one-offs out of the Year and Compare pages */
  regular: boolean;
  /** a category to bring into view and focus on the Spending page (set when jumping to it) */
  focusCat?: string | null;
};

export type Ctx = {
  book: Book;
  /** live exchange rates for the main currency, or null until they load (or when offline with nothing cached) */
  rates: Rates | null;
  ratesError: string;
  refreshRates: () => Promise<void>;
  /** units of the main currency per 1 of the second currency */
  altRate: number | null;
  /** every other currency to show amounts in, in order, with main-currency units per 1 */
  altRates: { code: string; rate: number }[];
  /** read an amount box, converting other currencies to the main one */
  read: (text: string) => Read;
  /** a short message at the bottom of the screen; `undoable` adds an Undo button to it */
  notify: (text: string, undoable?: boolean) => void;
  /** put back the ledger as it was before the last change */
  undo: () => void;
  canUndo: boolean;
  /** open search-and-jump (⌘K) */
  openSearch: () => void;
  /** open "Add expense" for the month on screen, with a category chosen if given */
  addExpense: (cid?: string | null) => void;
  theme: "system" | "light" | "dark";
  setTheme: (t: "system" | "light" | "dark") => void;
  /** change a copy of the ledger; `touches` says what to save ("settings", "y:2026") */
  change: (mutate: (draft: Ledger) => void, touches: string[]) => void;
  replace: (next: Ledger) => void;
  view: View;
  setView: (patch: Partial<View>) => void;
  go: (tab: Tab, patch?: Partial<View>) => void;
};

export const AppContext = createContext<Ctx | null>(null);

export function useApp(): Ctx {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp outside AppContext");
  return ctx;
}
