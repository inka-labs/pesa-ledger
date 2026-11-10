/** CSV in and out, so figures can come from (and go back to) a spreadsheet.
 *
 *  Columns: year, month, group, category, amount, note
 *    month 1–12 or a month name   an actual figure
 *    plan                          a yearly budget (spread evenly)
 *    plan-3 / plan-Mar             one month's budget on its own
 *  A row with no category adds its note to that month. */

import { DEFAULT_KINDS, emptyYear, kindsOf, MONTHS, mk } from "./ledger";
import { parseAmount } from "./format";
import { starterSettings } from "./example";
import type { Effect, Group, Ledger, Settings } from "./types";

export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

function monthOf(s: string): number | null {
  const n = parseInt(s, 10);
  if (n >= 1 && n <= 12) return n;
  const k = MONTHS.findIndex((x) => s.startsWith(x.toLowerCase()));
  return k >= 0 ? k + 1 : null;
}

let counter = 0;
export const newId = (prefix: string) => prefix + Date.now().toString(36).slice(-4) + (counter++).toString(36) + Math.random().toString(36).slice(2, 5);

/** Whether a group already shows the text colour (palette place 0): only one may. */
export const textSlotTaken = (groups: Group[]) => groups.some((g) => !g.color && g.slot === 0);

export function nextSlot(groups: Group[]): number {
  const used = new Set(groups.map((g) => g.slot));
  let slot = 1;
  while (used.has(slot) && slot < 20) slot++;
  return slot;
}

export type ImportResult = { ledger: Ledger; count: number; skipped: number; incomeBudgets: number; years: string[] };

/** Read a CSV into a copy of `current`. A brand-new or example ledger is replaced: the starter groups
 *  are kept only where the file uses them. Never mutates `current`. */
export function importCSV(text: string, current: Ledger | null): ImportResult {
  const rows = parseCSV(text.replace(/^﻿/, ""));
  if (!rows.length) throw new Error("The file is empty.");
  const head = rows[0].map((x) => x.trim().toLowerCase());
  const col = (n: string) => head.indexOf(n);
  const [iy, im, ig, ic, ia, ino] = ["year", "month", "group", "category", "amount", "note"].map(col);
  if (iy < 0 || im < 0 || ic < 0 || ia < 0)
    throw new Error("The first row must name the columns year, month, category and amount (group and note are optional).");

  const fresh = !current || current.settings.example;
  const ledger: Ledger = fresh ? { settings: starterSettings(), years: {} } : structuredClone(current);
  const st: Settings = ledger.settings;
  const usedCats = new Set<string>();
  const touched = new Set<string>();
  let count = 0, skipped = 0, incomeBudgets = 0;

  const year = (y: number) => (ledger.years[String(y)] ??= emptyYear());
  const groupNamed = (raw: string) => {
    const name = (raw || "Spending").trim();
    let g = st.groups.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (!g) {
      const effect: Effect = /income|salary|earn/i.test(name) ? "in" : /sav|invest|pension/i.test(name) ? "aside" : "out";
      // the first type with that effect; add the default one if the ledger has none
      let kind = kindsOf(st).find((k) => k.effect === effect);
      if (!kind) {
        kind = DEFAULT_KINDS.find((k) => k.effect === effect)!;
        st.kinds = [...kindsOf(st), kind];
      }
      g = { id: newId("g"), name, kind: kind.id, slot: effect === "in" && !textSlotTaken(st.groups) ? 0 : nextSlot(st.groups) };
      st.groups.push(g);
    }
    return g;
  };
  const addNote = (y: number, m: number, note: string) => {
    const yd = year(y), k = mk(m);
    // importing an export back in must not repeat every note: only lines the month doesn't have are added
    const have = new Set((yd.notes[k] ?? "").split("\n"));
    const add = note.split("\n").filter((line) => !have.has(line));
    if (add.length) yd.notes[k] = [yd.notes[k], ...add].filter(Boolean).join("\n");
  };

  for (const r of rows.slice(1)) {
    const y = parseInt(r[iy], 10);
    if (!(y > 1900 && y < 3000)) { skipped++; continue; }
    // "2026-03" in the month column means March
    const ms = String(r[im] ?? "").trim().toLowerCase().replace(/^\d{4}-(\d{1,2})$/, "$1");
    const isPlan = /plan|annual|target|budget/.test(ms);
    const m = isPlan ? monthOf(ms.replace(/plan|annual|target|budget/g, "").replace(/[^a-z0-9]/g, "")) : monthOf(ms);
    const catName = String(r[ic] ?? "").trim();
    const note = ino >= 0 ? String(r[ino] ?? "").trim() : "";
    if (!catName) {
      if (note && m) { addNote(y, m, note); touched.add(String(y)); }
      continue;
    }
    if (!isPlan && !m) { skipped++; continue; }
    const amount = parseAmount(r[ia]);
    if (amount == null || Number.isNaN(amount)) { skipped++; continue; }
    // no group given: a category of that name the ledger already has (if there's just one), else Spending
    const groupName = ig >= 0 ? String(r[ig] ?? "").trim() : "";
    const known = groupName ? [] : st.cats.filter((x) => x.name.toLowerCase() === catName.toLowerCase());
    const g = known.length === 1 ? st.groups.find((x) => x.id === known[0].group)! : groupNamed(groupName);
    const effect = kindsOf(st).find((k) => k.id === g.kind)?.effect ?? "out";
    if (isPlan && (effect === "in" || effect === "none")) { incomeBudgets++; continue; } // only savings and spending are budgeted
    let c = st.cats.find((x) => x.group === g.id && x.name.toLowerCase() === catName.toLowerCase());
    if (!c) { c = { id: newId("c"), name: catName, group: g.id }; st.cats.push(c); }
    usedCats.add(c.id);
    const yd = year(y);
    if (isPlan && m) (yd.budget[mk(m)] ??= {})[c.id] = amount;
    else if (isPlan) yd.plan[c.id] = amount;
    else {
      (yd.actual[mk(m!)] ??= {})[c.id] = amount;
      if (note) addNote(y, m!, `${catName}: ${note}`);
    }
    touched.add(String(y));
    count++;
  }
  if (!count) throw new Error('No rows could be read. Check that amounts are numbers and months are 1–12, a month name, or "plan".');
  if (fresh) {
    st.cats = st.cats.filter((c) => usedCats.has(c.id));
    st.groups = st.groups.filter((g) => st.cats.some((c) => c.group === g.id));
    st.example = false;
    st.goals = [];
  }
  return { ledger, count, skipped, incomeBudgets, years: [...touched].sort() };
}

/** "Imported 313 figures for 2026. Skipped 2 rows that couldn't be read. Left out 1 income budget: income isn't budgeted." */
export function importSummary(r: ImportResult): string {
  const parts = [`Imported ${r.count} figures for ${r.years.join(", ")}.`];
  if (r.skipped) parts.push(`Skipped ${r.skipped} row${r.skipped === 1 ? "" : "s"} that couldn't be read.`);
  if (r.incomeBudgets) parts.push(`Left out ${r.incomeBudgets} income budget${r.incomeBudgets === 1 ? "" : "s"}: income isn't budgeted.`);
  return parts.join(" ");
}

export function buildCSV(ledger: Ledger): string {
  const q = (s: string | number) => (/[",\n]/.test(String(s)) ? `"${String(s).replace(/"/g, '""')}"` : String(s));
  const cats = Object.fromEntries(ledger.settings.cats.map((c) => [c.id, c]));
  const groups = Object.fromEntries(ledger.settings.groups.map((g) => [g.id, g]));
  const line = (y: string, month: string | number, cid: string, v: number) => {
    const c = cats[cid];
    return c ? [y, month, q(groups[c.group]?.name ?? ""), q(c.name), v, ""].join(",") : null;
  };
  const out = ["year,month,group,category,amount,note"];
  for (const y of Object.keys(ledger.years).sort()) {
    const yd = ledger.years[y];
    for (const [cid, v] of Object.entries(yd.plan || {})) { const l = line(y, "plan", cid, v); if (l) out.push(l); }
    for (let m = 1; m <= 12; m++) {
      for (const [cid, v] of Object.entries(yd.budget?.[mk(m)] || {})) { const l = line(y, `plan-${m}`, cid, v); if (l) out.push(l); }
      for (const [cid, v] of Object.entries(yd.actual?.[mk(m)] || {})) { const l = line(y, m, cid, v); if (l) out.push(l); }
      const n = yd.notes?.[mk(m)];
      if (n) out.push([y, m, "", "", "", q(n)].join(","));
    }
  }
  return out.join("\n") + "\n";
}
