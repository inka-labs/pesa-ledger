import { useEffect, useRef, useState } from "react";
import { useApp } from "../context";
import { removeEntry, setActual, setNote, setOneOff } from "../model/edit";
import { amountText, money } from "../model/format";
import { before, cycleLabel, mk, MONTHS, MONTHS_LONG, nextYM, prevYM } from "../model/ledger";
import type { Category, Group } from "../model/types";
import { AmountInput, Swatch, TextInput } from "../ui/bits";
import { Ellipsis, Plus, Trash2 } from "lucide-react";

export function MonthView() {
  const { book, change, view, setView, go, addExpense } = useApp();
  const { y, m } = view;
  const t = book.monthTotals(y, m);
  const p = prevYM({ y, m });
  const pl = book.planRange(y, m, m);
  const pLabel = MONTHS[p.m - 1] + (p.y !== y ? ` ${p.y}` : "");
  const future = before(book.today, { y, m });
  const cycle = cycleLabel(book.settings, { y, m });
  const prevRow = book.year(p.y)?.actual?.[mk(p.m)];

  // ← and → move between months when you're not typing in a box
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || el?.matches?.("input, textarea, select") || document.querySelector(".cmdk, .mpick-pop")) return;
      if (e.key === "ArrowLeft") setView(prevYM({ y, m }));
      if (e.key === "ArrowRight") setView(nextYM({ y, m }));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [y, m, setView]);

  // arriving from search or the overview with a category: show it and put the cursor in its figure
  useEffect(() => {
    if (!view.focusCat) return;
    const id = view.focusCat;
    const c = book.cats[id];
    if (c && collapsedGroups().has(c.group)) setCollapsed(c.group, false);
    requestAnimationFrame(() => {
      const row = document.getElementById(`row-${id}`);
      row?.scrollIntoView({ block: "center", behavior: "smooth" });
      row?.classList.add("flash");
      setTimeout(() => row?.classList.remove("flash"), 1600);
      (document.getElementById(`actual-${id}`) as HTMLInputElement | null)?.focus({ preventScroll: true });
    });
    setView({ focusCat: null });
  }, [view.focusCat, book, setView]);

  const copyPrev = () =>
    change((l) => {
      for (const [cid, v] of Object.entries(prevRow ?? {}))
        if (book.actual(y, m, cid) == null && book.cats[cid] && !book.cats[cid].archived) setActual(l, y, m, cid, v);
    }, [`y:${y}`]);
  const fillBudget = () =>
    change((l) => {
      for (const c of book.settings.cats) {
        const b = book.planMonthly(y, m, c.id);
        if (b && !c.archived && book.actual(y, m, c.id) == null) setActual(l, y, m, c.id, Math.round(b));
      }
    }, [`y:${y}`]);

  const sv = book.spendingVsBudget(y, m);
  // which rows to show: all, the ones over budget, or the ones with nothing recorded yet; and a search
  const [filter, setFilter] = useState<RowFilter>("all");
  const [q, setQ] = useState("");
  const isOver = (c: Category) => { const b = book.planMonthly(y, m, c.id); const a = book.actual(y, m, c.id); return book.effectOf(c.id) === "out" && !!b && a != null && a > b; };
  const isEmpty = (c: Category) => book.actual(y, m, c.id) == null && !c.archived && book.effectOf(c.id) !== "none";
  const counts = { over: book.settings.cats.filter(isOver).length, empty: book.settings.cats.filter(isEmpty).length };
  const show = (c: Category) =>
    (filter === "all" || (filter === "over" ? isOver(c) : isEmpty(c))) && (!q.trim() || c.name.toLowerCase().includes(q.trim().toLowerCase()));
  const spentBudget = sv.budget;
  const leftToSpend = spentBudget - sv.spent;

  return (
    <>
      <div className="panel-h">
        <div className="monthnav">
          <button className="btn" aria-label="Previous month" title="Previous month (←)" onClick={() => setView(prevYM({ y, m }))}>‹</button>
          <MonthPicker />
          <button className="btn" aria-label="Next month" title="Next month (→)" onClick={() => setView(nextYM({ y, m }))}>›</button>
        </div>
        <div className="end">
          {(y !== book.today.y || m !== book.today.m) && <button className="btn ghost" onClick={() => setView(book.today)}>{book.settings.paycycle ? "Current pay" : "This month"}</button>}
          <button className="btn primary wide-only" onClick={() => addExpense()}><Plus size={16} aria-hidden /> Add expense</button>
          <details className="menu">
            <summary className="btn ghost" aria-label="More ways to fill in the month" title="Fill in the month"><Ellipsis size={16} aria-hidden /></summary>
            <div className="menu-pop" role="menu">
              <button role="menuitem" disabled={!prevRow} onClick={copyPrev}>Copy {pLabel}'s amounts into empty rows</button>
              <button role="menuitem" disabled={!pl.has} onClick={fillBudget}>Fill empty rows from the budget</button>
              <button role="menuitem" onClick={() => go("categories")}>Add or change categories</button>
            </div>
          </details>
        </div>
      </div>
      {cycle && <p className="cycle-note"><b>{cycle}</b>: the pay that landed in {MONTHS_LONG[m - 1]} and what it paid for.</p>}

      <div className="sumline">
        <div><span className="lbl">Spent</span><span className="num big">{money(sv.spent)}</span>{(spentBudget > 0 || sv.oneOff !== 0) && <span className="muted small">{spentBudget > 0 ? `of ${money(spentBudget)}` : ""}{sv.oneOff ? `${spentBudget > 0 ? " · " : ""}plus ${money(sv.oneOff)} one-off` : ""}</span>}</div>
        {spentBudget > 0 && <div><span className="lbl">{leftToSpend >= 0 ? "Left to spend" : "Over budget"}</span><span className={`num big${sv.spent > spentBudget * 1.1 ? " d-bad" : leftToSpend < 0 ? " warn-ink" : ""}`}>{money(Math.abs(leftToSpend))}</span></div>}
        <div><span className="lbl">Came in</span><span className="num">{money(t.income)}</span></div>
        <div><span className="lbl">Saved</span><span className="num">{money(t.saved)}</span></div>
        <div><span className="lbl">Left over</span><span className={`num${t.left < 0 ? " d-bad" : ""}`}>{money(t.left)}</span></div>
      </div>
      {future && <p className="small muted">{MONTHS_LONG[m - 1]} hasn't happened yet. <button className="link" onClick={() => go("budget", { planYear: y, planMonth: m })}>Set its budget</button>.</p>}
      {!future && <Unpaid />}
      <div className="filters">
        <div className="seg" role="group" aria-label="Show">
          {([["all", "All"], ["over", `Over budget${counts.over ? ` (${counts.over})` : ""}`], ["empty", `Not recorded${counts.empty ? ` (${counts.empty})` : ""}`]] as [RowFilter, string][]).map(([id, label]) => (
            <button key={id} aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>
          ))}
        </div>
        <input type="search" className="find" placeholder="Find a category" aria-label="Find a category" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="groups">
        {[...book.settings.groups].sort((a, b) => order(book.effectOfGroup(a)) - order(book.effectOfGroup(b))).map((g) => <GroupSection key={g.id} g={g} gAct={t.byGroup[g.id] || 0} gPlan={pl.byGroup[g.id] || 0} show={show} />)}
        {(filter !== "all" || q) && !book.settings.cats.some(show) && <p className="muted">{q ? `No category matches “${q}”.` : filter === "over" ? "Nothing is over budget this month." : "Everything has a figure this month."}</p>}
        {!book.settings.groups.length && <div className="panel">Add groups and categories on the <button className="link" onClick={() => go("categories")}>Categories</button> page to start.</div>}
      </div>
      <details className="panel notes" open={!!book.year(y)?.notes?.[mk(m)]}>
        <summary className="lbl">Notes for {MONTHS_LONG[m - 1]}</summary>
        <TextInput key={`${y}-${m}`} id="mnote" multiline label={`Notes for ${MONTHS_LONG[m - 1]}`}
          value={book.year(y)?.notes?.[mk(m)] ?? ""}
          placeholder="Anything worth remembering: a late payment, a one-off cost, a decision for next month."
          onCommit={(text) => change((l) => void setNote(l, y, m, text), [`y:${y}`])} />
      </details>
    </>
  );
}

type RowFilter = "all" | "over" | "empty";

// spending first (what this page is mostly for), then saving, then money in
const order = (e: string) => ({ out: 0, aside: 1, in: 2, none: 3 } as Record<string, number>)[e] ?? 0;

/** Repeating amounts not yet recorded this month, each one click from recorded. */
function Unpaid() {
  const { book, change, view, notify } = useApp();
  const { y, m } = view;
  const list = book.unpaid(y, m);
  if (!list.length) return null;
  const record = (ids: string[]) => {
    change((l) => { for (const id of ids) setActual(l, y, m, id, book.cats[id].repeat!); }, [`y:${y}`]);
    notify(ids.length === 1 ? `Recorded ${book.cats[ids[0]].name}.` : `Recorded ${ids.length} repeating amounts.`, true);
  };
  return (
    <div className="panel unpaid">
      <div className="panel-h">
        <h3>Repeating, not recorded yet</h3><span className="muted small">Click one when it's paid or received</span>
        {list.length > 1 && <div className="end"><button className="btn" onClick={() => record(list.map((c) => c.id))}>Record all {list.length}</button></div>}
      </div>
      <div className="pick-chips">
        {list.map((c) => {
          const g = book.groups[c.group];
          return (
            <button key={c.id} className="pick" onClick={() => record([c.id])} title={`Record ${money(c.repeat!)} for ${c.name} in ${MONTHS_LONG[m - 1]}`}>
              {g && <Swatch g={g} />} {c.name} <b className="num">{money(c.repeat!)}</b> <span aria-hidden>＋</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Groups folded away on the Spending page, remembered in this browser. */
const COLLAPSE_KEY = "pesa-ledger.collapsed";
function collapsedGroups(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(COLLAPSE_KEY) || "[]")); } catch { return new Set(); }
}
function setCollapsed(gid: string, folded: boolean) {
  const s = collapsedGroups();
  if (folded) s.add(gid); else s.delete(gid);
  try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...s])); } catch { /* private window */ }
  window.dispatchEvent(new Event("pesa-collapse"));
}
function useCollapsed(gid: string): [boolean, () => void] {
  const [folded, setFolded] = useState(() => collapsedGroups().has(gid));
  useEffect(() => {
    const sync = () => setFolded(collapsedGroups().has(gid));
    window.addEventListener("pesa-collapse", sync);
    return () => window.removeEventListener("pesa-collapse", sync);
  }, [gid]);
  return [folded, () => setCollapsed(gid, !folded)];
}

/** Click the month's name to jump to any month: pick a year, then a month. Months with figures are marked. */
function MonthPicker() {
  const { book, view, setView } = useApp();
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(view.y);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (open) setYear(view.y); }, [open, view.y]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <div className="mpick" ref={ref}>
      <button className="mtitle" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((o) => !o)} title="Choose a month">
        <h2>{MONTHS_LONG[view.m - 1]} {view.y}</h2><span className="caret" aria-hidden>▾</span>
      </button>
      {open && (
        <div className="mpick-pop" role="dialog" aria-label="Choose a month">
          <div className="bar yr">
            <button className="iconbtn" aria-label="Previous year" onClick={() => setYear(year - 1)}>‹</button>
            <b>{year}</b>
            <button className="iconbtn" aria-label="Next year" onClick={() => setYear(year + 1)}>›</button>
          </div>
          <div className="mgrid">
            {MONTHS.map((mn, i) => {
              const has = book.monthTotals(year, i + 1).has;
              const isNow = year === book.today.y && i + 1 === book.today.m;
              return (
                <button key={mn} className={`mcell2${year === view.y && i + 1 === view.m ? " on" : ""}${isNow ? " now" : ""}`}
                  onClick={() => { setView({ y: year, m: i + 1 }); setOpen(false); }} title={[cycleLabel(book.settings, { y: year, m: i + 1 }), has ? "Has figures" : "No figures yet"].filter(Boolean).join(" · ")}>
                  {mn}{has && <i className="has" aria-label="has figures" />}
                </button>
              );
            })}
          </div>
          <button className="btn ghost" onClick={() => { setView(book.today); setOpen(false); }}>{book.settings.paycycle ? "Current pay" : "This month"}</button>
        </div>
      )}
    </div>
  );
}

function GroupSection({ g, gAct, gPlan, show }: { g: Group; gAct: number; gPlan: number; show: (c: Category) => boolean }) {
  const { book, view } = useApp();
  const [stored, toggle] = useCollapsed(g.id);
  const { y, m } = view;
  const all = book.catsIn(g.id, true).filter((c) => !c.archived || book.actual(y, m, c.id) != null);
  const cats = all.filter(show);
  const effect = book.effectOfGroup(g);
  if (!cats.length) return null;
  const folded = stored && cats.length === all.length; // a filter or search always shows what it found
  const r = gPlan > 0 ? gAct / gPlan : 0;
  const over = effect === "out" && r > 1.0001;
  return (
    <section className="grp">
      <div className="grp-h">
        <button className="fold" aria-expanded={!folded} aria-label={`${folded ? "Show" : "Hide"} ${g.name}`} onClick={toggle}>
          <span className={`chev${folded ? "" : " open"}`} aria-hidden>▸</span>
          <Swatch g={g} />
          <h3>{g.name}</h3>
        </button>
        <span className="tot">
          <span className="num">{money(gAct)}</span>
          {(effect === "out" || effect === "aside") && gPlan > 0 && <span className="muted"> / {money(gPlan)}</span>}
        </span>
        {(effect === "out" || effect === "aside") && gPlan > 0 && (
          <div className={`meter thin grp-meter${over ? (r > 1.1 ? " way" : " over") : ""}`}><i style={{ width: `${Math.min(100, r * 100)}%` }} /></div>
        )}
      </div>
      {!folded && <div>{cats.map((c) => <CategoryRow key={c.id} c={c} g={g} />)}</div>}
    </section>
  );
}

/** Mark how much of this month's figure won't repeat (the car, a renovation, a bonus). It stays in the
 *  month's totals; Year and Compare can leave it out, and forecasts never count on it again. */
function OneOffControl({ c, actual }: { c: Category; actual: number | null }) {
  const { book, change, view, read, notify } = useApp();
  const { y, m } = view;
  const o = book.oneOff(y, m, c.id);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [bad, setBad] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    setAmount(amountText(o?.amount ?? actual)); setNote(o?.note ?? ""); setBad("");
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  // one-offs are a category of their own now; a part marked on an ordinary category before still shows
  if (!o) return null;
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const r = read(amount);
    if ("error" in r) { setBad(r.error); return; }
    if (r.value == null || r.value === 0) { setBad("Enter the one-off part of the figure."); return; }
    if (actual != null && Math.abs(r.value) > Math.abs(actual)) { setBad(`It's part of the figure, so at most ${money(actual)}.`); return; }
    change((l) => void setOneOff(l, y, m, c.id, { amount: r.value!, note }), [`y:${y}`]);
    setOpen(false);
  };
  const clear = () => {
    change((l) => void setOneOff(l, y, m, c.id, null), [`y:${y}`]);
    notify(`${c.name} in ${MONTHS[m - 1]} counts as regular again.`, true);
    setOpen(false);
  };
  return (
    <div className="oneoff" ref={ref}>
      {o ? (
        <button className="oneoff-tag" onClick={() => setOpen((x) => !x)} title="Part of this figure won't repeat. Click to change.">
          One-off {money(o.amount)}{o.note ? ` · ${o.note}` : ""}
        </button>
      ) : (
        <button className="oneoff-add" onClick={() => setOpen((x) => !x)} title="Mark all or part of this figure as a one-off">One-off?</button>
      )}
      {open && (
        <form className="oneoff-pop" role="dialog" aria-label={`One-off in ${c.name}`} onSubmit={save}>
          <p className="small muted">How much of {MONTHS_LONG[m - 1]}'s {money(actual ?? 0)} won't repeat? It stays in this month's totals, and Year and Compare can leave it out.</p>
          <label className="lbl" htmlFor={`oo-a-${c.id}`}>One-off amount</label>
          <input id={`oo-a-${c.id}`} className={`amt${bad ? " invalid" : ""}`} inputMode="decimal" value={amount} autoFocus
            onFocus={(e) => e.currentTarget.select()} onChange={(e) => { setAmount(e.target.value); setBad(""); }} />
          {bad && <span className="small d-bad">{bad}</span>}
          <label className="lbl" htmlFor={`oo-n-${c.id}`}>What was it?</label>
          <input id={`oo-n-${c.id}`} value={note} maxLength={200} placeholder="e.g. Car purchase, house renovation" onChange={(e) => setNote(e.target.value)} />
          <div className="bar">
            <button className="btn primary">Save</button>
            {o && <button type="button" className="btn ghost danger" onClick={clear}>Not a one-off</button>}
            <button type="button" className="btn ghost" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}

function CategoryRow({ c, g }: { c: Category; g: Group }) {
  const { book, change, view, addExpense, notify } = useApp();
  const { y, m } = view;
  const [open, setOpen] = useState(false);
  const a = book.actual(y, m, c.id);
  const budget = book.planMonthly(y, m, c.id);
  const effect = book.effectOfGroup(g);
  const spending = effect === "out";
  const entries = book.year(y)?.entries?.[mk(m)]?.[c.id] ?? [];
  const p = prevYM({ y, m });
  const last = book.actual(p.y, p.m, c.id);

  // a thin bar under the name, with what's left (or over) beside it; amber for a small overspend, red past 10%
  let status = null, bar = null;
  if (budget) {
    const ratio = (a || 0) / budget;
    const over = spending && ratio > 1.0001;
    const way = over && ratio > 1.1;
    status = a == null ? <span className="muted">{money(budget)} budgeted</span>
      : over ? <span className={way ? "d-bad" : "warn-ink"}>{money(a - budget)} over</span>
      : !spending ? <span className="muted">of {money(budget)}</span>
      : <span className="muted">{money(budget - a)} left</span>;
    bar = <div className={`meter thin${over ? (way ? " way" : " over") : ""}`}><i style={{ width: `${Math.min(100, ratio * 100)}%` }} /></div>;
  }
  return (
    <div className={`srow${open ? " open" : ""}`} id={`row-${c.id}`}>
      <div className="name">
        <button className="nname-btn" aria-expanded={open} onClick={() => setOpen((x) => !x)} title="Show details">
          <span className="nname">{c.name}{c.archived && <small>Archived</small>}</span>
          {c.oneoff && <span className="oneoff-cat">One-off</span>}
        </button>
        {bar}
        <span className="nstat small">
          {status}
          {entries.length > 0 && <span className="muted">{status ? " · " : ""}{entries.length} added</span>}
          {!c.oneoff && effect !== "none" && <OneOffControl c={c} actual={a} />}
        </span>
      </div>
      <button className="iconbtn quick" aria-label={`Add an expense to ${c.name}`} title={`Add to ${c.name}`} onClick={() => addExpense(c.id)}><Plus size={15} aria-hidden /></button>
      <AmountInput id={`actual-${c.id}`} value={a} label={`${c.name} for ${MONTHS[m - 1]}`}
        placeholder={c.repeat ? money(c.repeat) : "0"} title={c.repeat ? `Repeats at ${money(c.repeat)} a month` : "The month's total. Type it, or use + to add one expense at a time"}
        onCommit={(v) => change((l) => void setActual(l, y, m, c.id, v), [`y:${y}`])} />
      {open && (
        <div className="sdetail small">
          <span>{budget ? <>Budget <b className="num">{money(budget)}</b></> : "No budget"} · {MONTHS[p.m - 1]}: <b className="num">{last == null ? "–" : money(last)}</b>{c.repeat ? <> · repeats at <b className="num">{money(c.repeat)}</b></> : null}</span>
          {entries.length > 0 ? (
            <ul className="sentries">
              {entries.map((e, i) => (
                <li key={i}>
                  <span>{e.note || "Expense"}{e.day ? <span className="muted"> · {e.day} {MONTHS[m - 1]}</span> : null}</span>
                  <span className="num">{money(e.amount)}</span>
                  <button className="iconbtn" aria-label={`Take ${money(e.amount)} out of ${c.name}`}
                    onClick={() => { change((l) => void removeEntry(l, y, m, c.id, i), [`y:${y}`]); notify(`Took ${money(e.amount)} out of ${c.name}.`, true); }}><Trash2 size={13} aria-hidden /></button>
                </li>
              ))}
            </ul>
          ) : <span className="muted">Nothing added one at a time. Use + to keep a list of what made up the total.</span>}
        </div>
      )}
    </div>
  );
}
