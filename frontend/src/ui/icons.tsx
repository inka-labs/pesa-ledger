/** One icon per page, from Lucide (an open-source set drawn on one grid, so they sit together). */

import {
  CalendarDays, ChartColumn, GitCompareArrows, HeartPulse, Landmark, LayoutDashboard, Palette, PiggyBank, Settings, Tags, Target, Wallet,
  type LucideIcon,
} from "lucide-react";
import type { Tab } from "../context";

export const TAB_ICON: Record<Tab, LucideIcon> = {
  overview: LayoutDashboard,
  month: CalendarDays,
  year: ChartColumn,
  compare: GitCompareArrows,
  health: HeartPulse,
  networth: Landmark,
  budget: Wallet,
  funds: PiggyBank,
  goals: Target,
  settings: Settings,
  categories: Tags,
  appearance: Palette,
};
