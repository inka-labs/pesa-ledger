import { createContext, useContext } from "react";
import type { Book } from "./model/ledger";
import type { Rates, Read } from "./model/money";
import type { Ledger, Metric } from "./model/types";

export type Tab = "overview" | "health" | "month" | "year" | "compare" | "networth" | "budget" | "goals" | "funds" | "settings" | "categories" | "appearance";
export type Section = { id: string; label: string; tabs: { id: Tab; label: string }[] };

/** Three places: what happened (Track), what's ahead (Plan), and how the ledger is set up (Settings). */
export const SECTIONS: Section[] = [
  { id: "track", label: "Track", tabs: [{ id: "overview", label: "Overview" }, { id: "month", label: "Month" }, { id: "year", label: "Year" }, { id: "compare", label: "Compare" }, { id: "health", label: "Health" }, { id: "networth", label: "Net worth" }] },
  { id: "plan", label: "Plan", tabs: [{ id: "budget", label: "Budget" }, { id: "funds", label: "Sinking funds" }, { id: "goals", label: "Goals" }] },
  { id: "setup", label: "Settings", tabs: [{ id: "settings", label: "General" }, { id: "categories", label: "Categories" }, { id: "appearance", label: "Appearance" }] },
];
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
  catHint: boolean;
  /** leave one-offs out of the Year and Compare pages */
  regular: boolean;
  /** a category to bring into view and focus on the Month page (set when jumping to it) */
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
  /** read an amount box, converting other currencies to the main one */
  read: (text: string) => Read;
  /** a short message at the bottom of the screen; `undoable` adds an Undo button to it */
  notify: (text: string, undoable?: boolean) => void;
  /** put back the ledger as it was before the last change */
  undo: () => void;
  canUndo: boolean;
  /** open search-and-jump (⌘K) */
  openSearch: () => void;
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
