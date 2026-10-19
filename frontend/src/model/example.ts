/** Starter categories and the example ledger someone can explore before entering their own. */

import { mk } from "./ledger";
import type { Ledger, Settings, YearDoc, YM } from "./types";

export function starterSettings(): Settings {
  const groups: Settings["groups"] = [
    { id: "inc", name: "Income", kind: "income", slot: 0 },
    { id: "sav", name: "Savings & investments", kind: "saving", slot: 1 },
    { id: "fam", name: "Family support", kind: "expense", slot: 2 },
    { id: "ess", name: "Essentials", kind: "expense", slot: 3 },
    { id: "snk", name: "Sinking funds", kind: "expense", slot: 4 },
  ];
  const names: Record<string, string[]> = {
    inc: ["Salary", "Side income"],
    sav: ["Money market fund", "Emergency fund", "Pension"],
    fam: ["Parents", "Siblings"],
    ess: ["Rent", "Electricity", "Water", "Internet", "Food & groceries", "Transport", "Subscriptions"],
    snk: ["Car service & insurance", "Medical", "Entertainment", "Gifts & occasions"],
  };
  const cats = groups.flatMap((g) => names[g.id].map((name, i) => ({ id: `${g.id}_${i}`, name, group: g.id })));
  return { v: 1, currency: "KES", alt: { code: "USD", rate: 129 }, groups, cats, goals: [], example: false };
}

export function emptyGroupsSettings(): Settings {
  return { ...starterSettings(), cats: [] };
}

const BASE: Record<string, number> = {
  inc_0: 250000, inc_1: 30000, sav_0: 60000, sav_1: 15000, sav_2: 10000, fam_0: 12000, fam_1: 5000,
  ess_0: 35000, ess_1: 3000, ess_2: 1200, ess_3: 3500, ess_4: 22000, ess_5: 9000, ess_6: 2400,
  snk_0: 8000, snk_1: 4000, snk_2: 10000, snk_3: 3000,
};

/** Last year in full and this year up to this month, made up but plausible. Marked as an example. */
export function exampleLedger(today: YM): Ledger {
  const settings = starterSettings();
  settings.example = true;
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const years: Record<string, YearDoc> = {};
  [today.y - 1, today.y].forEach((y, yi) => {
    const grow = yi ? 1.08 : 1;
    const yd: YearDoc = { actual: {}, budget: {}, plan: {}, notes: {} };
    for (const [cid, v] of Object.entries(BASE)) if (cid !== "snk_0") yd.plan[cid] = Math.round((v * 12 * grow) / 1000) * 1000;
    // the car is serviced every four months: a lumpy budget, set month by month
    for (let m = 1; m <= 12; m++) yd.budget[mk(m)] = { snk_0: m % 4 === 0 ? Math.round((BASE.snk_0 * 4 * grow) / 1000) * 1000 : 0 };
    const last = y === today.y ? today.m : 12;
    for (let m = 1; m <= last; m++) {
      const row: Record<string, number> = {};
      for (const [cid, v] of Object.entries(BASE)) {
        if (cid === "inc_1" && rnd() < 0.6) continue;
        if (cid === "snk_0" && m % 4 !== 0) continue;
        let a = v * grow * (0.82 + rnd() * 0.36);
        if (cid === "snk_0") a *= 4;
        if (cid === "inc_0" || cid === "ess_0") a = v * grow;
        row[cid] = Math.round(a / 100) * 100;
      }
      yd.actual[mk(m)] = row;
    }
    yd.notes[mk(Math.min(last, 4))] = "Example note: car service done this month.";
    years[String(y)] = yd;
  });
  settings.goals = [
    { id: "g1", name: "Emergency fund: six months of essentials", target: 600000, deadline: `${today.y}-12`, start: 300000, from: `${today.y - 1}-01`, cats: ["sav_1"] },
    { id: "g2", name: "Money market fund to 2M", target: 2000000, deadline: `${today.y + 1}-06`, start: 400000, from: `${today.y - 1}-01`, cats: ["sav_0"] },
  ];
  return { settings, years };
}
