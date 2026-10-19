import { useEffect, useRef, useState } from "react";
import { useApp } from "../context";
import { setActual, setBudget, setNote, setOneOff } from "../model/edit";
import { amountText, money } from "../model/format";
import { before, mk, MONTHS, MONTHS_LONG, nextYM, prevYM } from "../model/ledger";
import { newId } from "../model/csv";
import type { Category, Group } from "../model/types";
import { Alt, AmountInput, Delta, Kpi, Swatch, TextInput } from "../ui/bits";

export function MonthView() {
  const { book, change, view, setView, go } = useApp();
  const { y, m } = view;
  const t = book.monthTotals(y, m);
  const p = prevYM({ y, m });
  const tp = book.monthTotals(p.y, p.m);
  const ly = book.monthTotals(y - 1, m);
  const pl = book.planRange(y, m, m);
  const pLabel = MONTHS[p.m - 1] + (p.y !== y ? ` ${p.y}` : "");
  const future = before(book.today, { y, m });
  const prevRow = book.year(p.y)?.actual?.[mk(p.m)];
  const val = (tt: typeof t, k: "income" | "saved" | "spent" | "left") => (tt.has ? tt[k] : null);

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

  const tiles = (["income", "saved", "spent", "left"] as const).map((k, i) => (
    <Kpi key={k} label={{ income: "Income", saved: "Saved", spent: "Spent", left: "Left over" }[k]} value={t[k]} lead={i === 3}>
      {pl.has && (k === "saved" || k === "spent") && <span>Budget {money(pl[k])}</span>}
      <Delta cur={val(t, k)} prev={val(tp, k)} upGood={k !== "spent"} label={pLabel} />
      {ly.has && <Delta cur={val(t, k)} prev={ly[k]} upGood={k !== "spent"} label={`${MONTHS[m - 1]} ${y - 1}`} />}
      {k === "saved" && t.income > 0 && <span>{Math.round((t.saved / t.income) * 100)}% of income</span>}
      {k !== "left" && t.oneOff[k] !== 0 && <span className="oneoff-sub">incl. {money(t.oneOff[k])} one-off</span>}
      {k === "left" && t.oneOff.any && <span className="oneoff-sub">{money(t.left + t.oneOff.saved + t.oneOff.spent - t.oneOff.income)} without one-offs</span>}
      <Alt v={t[k]} />
    </Kpi>
  ));

  return (
    <>
      <div className="panel-h">
        <div className="monthnav">
          <button className="btn" aria-label="Previous month" title="Previous month (←)" onClick={() => setView(prevYM({ y, m }))}>‹</button>
          <MonthPicker />
          <button className="btn" aria-label="Next month" title="Next month (→)" onClick={() => setView(nextYM({ y, m }))}>›</button>
        </div>
        <div className="end">
          {(y !== book.today.y || m !== book.today.m) && <button className="btn ghost" onClick={() => setView(book.today)}>This month</button>}
          <button className="btn" disabled={!prevRow} onClick={copyPrev} title={`Fill empty boxes with ${pLabel}'s amounts`}>Copy {pLabel} into empty boxes</button>
          <button className="btn" disabled={!pl.has} onClick={fillBudget} title="Fill empty actual boxes with this month's budget">Fill empty from budget</button>
        </div>
      </div>
      {future && (
        <div className="notice">
          This month is still ahead. Set its budget in the Budget column, or plan the whole year on the{" "}
          <button className="link" onClick={() => go("budget", { planYear: y })}>Budget</button> tab.
        </div>
      )}
      <div className="kpis">{tiles}</div>
      <div className="groups">
        {book.settings.groups.map((g) => <GroupSection key={g.id} g={g} gAct={t.byGroup[g.id] || 0} gPlan={pl.byGroup[g.id] || 0} />)}
        {!book.settings.groups.length && <div className="panel">Add groups and categories on the <button className="link" onClick={() => go("categories")}>Categories</button> tab to start.</div>}
      </div>
      <div className="panel">
        <label className="lbl" htmlFor="mnote">Notes for {MONTHS_LONG[m - 1]}</label>
        <TextInput key={`${y}-${m}`} id="mnote" multiline label={`Notes for ${MONTHS_LONG[m - 1]}`}
          value={book.year(y)?.notes?.[mk(m)] ?? ""}
          placeholder="Anything worth remembering: a late payment, a one-off cost, a decision for next month."
          onCommit={(text) => change((l) => void setNote(l, y, m, text), [`y:${y}`])} />
      </div>
    </>
  );
}

/** Groups folded away on the Month page, remembered in this browser. */
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
                  onClick={() => { setView({ y: year, m: i + 1 }); setOpen(false); }} title={has ? "Has figures" : "No figures yet"}>
                  {mn}{has && <i className="has" aria-label="has figures" />}
                </button>
              );
            })}
          </div>
          <button className="btn ghost" onClick={() => { setView(book.today); setOpen(false); }}>This month</button>
        </div>
      )}
    </div>
  );
}

function GroupSection({ g, gAct, gPlan }: { g: Group; gAct: number; gPlan: number }) {
  const { book, change, view } = useApp();
  const [folded, toggle] = useCollapsed(g.id);
  const { y, m } = view;
  const [name, setName] = useState("");
  const cats = book.catsIn(g.id, true).filter((c) => !c.archived || book.actual(y, m, c.id) != null);
  const effect = book.effectOfGroup(g);
  const budgeted = effect === "aside" || effect === "out";
  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    change((l) => void l.settings.cats.push({ id: newId("c"), name: name.trim(), group: g.id }), ["settings"]);
    setName("");
  };
  return (
    <section className="grp">
      <div className="grp-h">
        <button className="fold" aria-expanded={!folded} aria-label={`${folded ? "Show" : "Hide"} ${g.name}`} onClick={toggle}>
          <span className={`chev${folded ? "" : " open"}`} aria-hidden>▸</span>
          <Swatch g={g} />
          <h3>{g.name}</h3>
          {folded && <span className="muted small">{cats.length} {cats.length === 1 ? "category" : "categories"}</span>}
        </button>
        <span className="tot">
          <span className="num">{money(gAct)}</span>{" "}
          <span className="muted">{effect === "in" ? "received" : effect === "none" ? "tracked, not in the totals" : `of ${money(gPlan)} budgeted`}</span>
        </span>
      </div>
      {!folded && <>
      <div>
        {cats.length > 0 && (
          <div className="row head lbl">
            <span>Category</span><span className="r">{budgeted ? "Budget" : ""}</span><span className="r">Actual</span>
            <span>{budgeted ? "Progress" : ""}</span><span className="r">Month on month</span>
          </div>
        )}
        {cats.map((c) => <CategoryRow key={c.id} c={c} g={g} />)}
      </div>
      <form className="addrow" onSubmit={add}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={`Add a category to ${g.name}`} aria-label={`New category in ${g.name}`} />
        <button className="btn">Add</button>
      </form>
      </>}
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
  if (actual == null && !o) return null;
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
  const { book, change, view } = useApp();
  const { y, m } = view;
  const a = book.actual(y, m, c.id);
  const budget = book.planMonthly(y, m, c.id);
  const own = book.budgetOverride(y, m, c.id);
  const annual = book.planAnnual(y, c.id);
  const p = prevYM({ y, m });
  const prev = book.actual(p.y, p.m, c.id);
  const effect = book.effectOfGroup(g);
  const spending = effect === "out";
  const income = effect === "in" || effect === "none"; // not budgeted

  let progress = income ? null : <span className="muted small">No budget</span>;
  if (budget) {
    const ratio = (a || 0) / budget;
    const over = spending && ratio > 1.0001;
    const chip = a == null ? null
      : over ? <span className="chip over">▲ Over by {money(a - budget)}</span>
      : !spending && ratio >= 0.9999 ? <span className="chip ok">✓ On budget</span>
      : !spending ? <span className="chip">{Math.round(ratio * 100)}% of budget</span>
      : <span className="chip">{money(budget - a)} left</span>;
    progress = (
      <div className="mcell">
        <div className={`meter${over ? " over" : ""}`} style={{ width: "100%" }}><i style={{ width: `${Math.min(100, ratio * 100)}%` }} /></div>
        {chip}
      </div>
    );
  }
  return (
    <div className="row" id={`row-${c.id}`}>
      <div className="name">{c.name}{c.archived && <small>Archived</small>}{effect !== "none" && <OneOffControl c={c} actual={a} />}</div>
      {income ? <div className="c-plan none" /> : (
        <div className="c-plan">
          <AmountInput value={own} placeholder={annual != null ? money(annual / 12) : "–"}
            title={annual != null ? "Leave blank to use the yearly budget ÷ 12" : "Budget for this month"}
            label={`${c.name} budget for ${MONTHS[m - 1]}`}
            onCommit={(v) => change((l) => void setBudget(l, y, m, c.id, v), [`y:${y}`])} />
        </div>
      )}
      <div>
        <AmountInput id={`actual-${c.id}`} value={a} label={`${c.name} actual for ${MONTHS[m - 1]}`}
          onCommit={(v) => change((l) => void setActual(l, y, m, c.id, v), [`y:${y}`])} />
      </div>
      <div className="c-meter">{progress}</div>
      <div className="r small c-delta">{(a != null || prev != null) && <Delta cur={a} prev={prev} upGood={!spending} label={MONTHS[p.m - 1]} />}</div>
    </div>
  );
}
