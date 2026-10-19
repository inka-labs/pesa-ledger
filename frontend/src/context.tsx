import { createContext, useContext } from "react";
import type { Book } from "./model/ledger";
import type { Ledger, Metric } from "./model/types";

export type Tab = "month" | "budget" | "year" | "compare" | "goals" | "categories" | "settings";
export const TABS: { id: Tab; label: string }[] = [
  { id: "month", label: "Month" },
  { id: "budget", label: "Budget" },
  { id: "year", label: "Year" },
  { id: "compare", label: "Compare" },
  { id: "goals", label: "Goals" },
  { id: "categories", label: "Categories" },
  { id: "settings", label: "Settings" },
];

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
};

export type Ctx = {
  book: Book;
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
