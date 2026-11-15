/** "Add expense": an amount, a category and an optional note, added to that category's figure for the
 *  month. What was added this month is listed underneath, and any of it can be taken back out. */

import { useMemo, useState } from "react";
import { useApp } from "../context";
import { addEntry, removeEntry } from "../model/edit";
import { money } from "../model/format";
import { mk, MONTHS_LONG } from "../model/ledger";
import { Sheet } from "./Sheet";
import { Trash2 } from "lucide-react";

export function AddExpense({ cid: startCid, onClose }: { cid?: string | null; onClose: () => void }) {
  const { book, change, view, read, notify } = useApp();
  const { y, m } = view;
  // money out first (the usual case), then money set aside, then money in
  const choices = useMemo(() => {
    const order = { out: 0, aside: 1, in: 2, none: 3 } as const;
    return [...book.settings.groups]
      .sort((a, b) => order[book.effectOfGroup(a)] - order[book.effectOfGroup(b)])
      .map((g) => ({ g, cats: book.catsIn(g.id) }))
      .filter((x) => x.cats.length);
  }, [book]);
  const last = (() => { try { return localStorage.getItem("pesa-ledger.last-cat"); } catch { return null; } })();
  const firstOut = choices[0]?.cats[0]?.id ?? "";
  const [cid, setCid] = useState(startCid && book.cats[startCid] ? startCid : last && book.cats[last] && !book.cats[last].archived ? last : firstOut);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [bad, setBad] = useState("");

  const isNow = y === book.today.y && m === book.today.m;
  // the day it was spent: today in the current month, blank (no day) otherwise; any day of the month can be typed
  const daysInMonth = new Date(y, m, 0).getDate();
  const [dayText, setDayText] = useState(isNow ? String(Math.min(new Date().getDate(), daysInMonth)) : "");
  const entries = book.year(y)?.entries?.[mk(m)] ?? {};
  const list = Object.entries(entries).flatMap(([c, es]) => es.map((e, i) => ({ c, i, e }))).reverse();

  const save = () => {
    const r = read(amount);
    if ("error" in r) { setBad(r.error); return; }
    if (r.value == null || r.value === 0) { setBad("Enter how much it was."); return; }
    if (!book.cats[cid]) { setBad("Choose a category."); return; }
    const d = dayText.trim() ? Number(dayText) : undefined;
    if (d != null && !(Number.isInteger(d) && d >= 1 && d <= daysInMonth)) { setBad(`The day is a number from 1 to ${daysInMonth}.`); return; }
    const day = d;
    const value = r.value;
    change((l) => void addEntry(l, y, m, cid, { amount: value, note: note.trim(), day }), [`y:${y}`]);
    try { localStorage.setItem("pesa-ledger.last-cat", cid); } catch { /* private window */ }
    const total = (book.actual(y, m, cid) ?? 0) + value;
    notify(`Added ${money(value)} to ${book.cats[cid].name}. ${MONTHS_LONG[m - 1]} so far: ${money(total)}.`, true);
    setAmount(""); setNote(""); setBad("");
    (document.getElementById("ae-amount") as HTMLInputElement | null)?.focus();
  };

  return (
    <Sheet title={`Add to ${MONTHS_LONG[m - 1]} ${y}`} onClose={onClose} onSubmit={save}
      footer={<div className="bar"><button className="btn primary">Add</button><button type="button" className="btn ghost" onClick={onClose}>Close</button></div>}>
      <label className="lbl" htmlFor="ae-amount">Amount</label>
      <input id="ae-amount" className={`amt big${bad ? " invalid" : ""}`} inputMode="decimal" autoFocus value={amount}
        placeholder="0" aria-describedby={bad ? "ae-bad" : undefined} aria-invalid={bad ? true : undefined}
        onChange={(e) => { setAmount(e.target.value); setBad(""); }} />
      {bad ? <span id="ae-bad" className="small d-bad">{bad}</span> : <span className="small muted">Another currency works too: USD 20.</span>}

      <label className="lbl" htmlFor="ae-cat">Category</label>
      <select id="ae-cat" value={cid} onChange={(e) => setCid(e.target.value)}>
        {choices.map(({ g, cats }) => (
          <optgroup key={g.id} label={g.name}>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </optgroup>
        ))}
      </select>
      {cid && book.cats[cid] && (
        <span className="small muted">
          {money(book.actual(y, m, cid) ?? 0)} so far in {MONTHS_LONG[m - 1]}
          {book.planMonthly(y, m, cid) ? ` of ${money(book.planMonthly(y, m, cid)!)} budgeted` : ""}
        </span>
      )}

      <div className="ae-pair">
        <span className="field">
          <label className="lbl" htmlFor="ae-note">Note <span className="muted">(optional)</span></label>
          <input id="ae-note" value={note} maxLength={200} placeholder="e.g. Naivas, lunch, matatu" onChange={(e) => setNote(e.target.value)} />
        </span>
        <span className="field">
          <label className="lbl" htmlFor="ae-day">Day <span className="muted">of {MONTHS_LONG[m - 1].slice(0, 3)}</span></label>
          <input id="ae-day" type="number" min={1} max={daysInMonth} inputMode="numeric" value={dayText} placeholder="–"
            onChange={(e) => { setDayText(e.target.value); setBad(""); }} />
        </span>
      </div>

      {list.length > 0 && (
        <div className="ae-list">
          <span className="lbl">Added in {MONTHS_LONG[m - 1]}</span>
          <ul>
            {list.slice(0, 30).map(({ c, i, e }) => (
              <li key={`${c}-${i}`}>
                <span className="ae-what"><b>{book.cats[c]?.name ?? "Removed category"}</b>{e.note ? <span className="muted"> · {e.note}</span> : null}{e.day ? <span className="muted"> · {e.day}{suffix(e.day)}</span> : null}</span>
                <span className="num">{money(e.amount)}</span>
                <button type="button" className="iconbtn" aria-label={`Take ${money(e.amount)} out of ${book.cats[c]?.name ?? "this category"}`}
                  onClick={() => { change((l) => void removeEntry(l, y, m, c, i), [`y:${y}`]); notify(`Took ${money(e.amount)} out of ${book.cats[c]?.name}.`, true); }}>
                  <Trash2 size={14} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Sheet>
  );
}

const suffix = (d: number) => (d % 10 === 1 && d !== 11 ? "st" : d % 10 === 2 && d !== 12 ? "nd" : d % 10 === 3 && d !== 13 ? "rd" : "th");
