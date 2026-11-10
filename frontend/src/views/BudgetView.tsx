import { useState } from "react";
import { useApp } from "../context";
import { setBudget, setMonthOnly, setPlan, setUsualBudget, yearOf } from "../model/edit";
import { money } from "../model/format";
import { fmtYM, isNum, mk, MONTHS, MONTHS_LONG, nextYM, prevYM } from "../model/ledger";
import type { Category } from "../model/types";
import { AmountInput, Swatch, YearSelect } from "../ui/bits";

const MODE_KEY = "pesa-ledger.budget-mode";

/** The budget, one month at a time: one amount per category. An amount is the usual one (every month
 *  without its own) unless it's ticked as this month only. "Whole year" shows the 12-month grid. */
export function BudgetView() {
  const { book, change, view, setView } = useApp();
  const [mode, setModeState] = useState<"month" | "year">(() => { try { return localStorage.getItem(MODE_KEY) === "year" ? "year" : "month"; } catch { return "month"; } });
  const setMode = (v: "month" | "year") => { setModeState(v); try { localStorage.setItem(MODE_KEY, v); } catch { /* private window */ } };
  const y = view.planYear, m = view.planMonth;
  const go = (ym: { y: number; m: number }) => setView({ planYear: ym.y, planMonth: ym.m });

  const head = (
    <div className="panel-h">
      <h2>Budget</h2>
      {mode === "month" && (
        <div className="monthnav">
          <button className="btn" aria-label="Previous month" onClick={() => go(prevYM({ y, m }))}>‹</button>
          <h2 className="mname">{MONTHS_LONG[m - 1]} {y}</h2>
          <button className="btn" aria-label="Next month" onClick={() => go(nextYM({ y, m }))}>›</button>
        </div>
      )}
      <div className="end">
        <div className="seg" role="group" aria-label="Show">
          <button aria-pressed={mode === "month"} onClick={() => setMode("month")}>Month</button>
          <button aria-pressed={mode === "year"} onClick={() => setMode("year")}>Whole year</button>
        </div>
      </div>
    </div>
  );
  if (mode === "year") return <>{head}<BudgetYear /></>;

  const pl = book.planRange(y, m, m);
  const t = book.monthTotals(y, m);
  const expected = book.expectedIncome();
  const income = t.income > 0 ? t.income : expected.amount;
  const unassigned = income - pl.spent - pl.saved;
  const prev = prevYM({ y, m });
  const prevPlan = book.planRange(prev.y, prev.m, prev.m);
  const groups = book.outGroups().filter((g) => book.catsIn(g.id).length);
  const copyPrev = () =>
    change((l) => {
      for (const c of book.settings.cats) {
        if (c.archived || !book.budgeted(c.id) || book.planMonthly(y, m, c.id) != null) continue;
        const v = book.planMonthly(prev.y, prev.m, c.id);
        if (v != null) setUsualBudget(l, y, c.id, v);
      }
    }, [`y:${y}`]);

  return (
    <>
      {head}
      <div className="sumline">
        <div><span className="lbl">To spend</span><span className="num big">{money(pl.spent)}</span></div>
        <div><span className="lbl">To save</span><span className="num big">{money(pl.saved)}</span></div>
        <div>
          <span className="lbl">{t.income > 0 ? "Came in" : "Expected in"}</span><span className="num">{money(income)}</span>
          {t.income === 0 && expected.months > 0 && <span className="muted small">your recent average</span>}
        </div>
        {income > 0 && (
          <div>
            <span className="lbl">{unassigned >= 0 ? "Not budgeted" : "Budgeted beyond income"}</span>
            <span className={`num${unassigned < 0 ? " d-bad" : ""}`}>{money(Math.abs(unassigned))}</span>
          </div>
        )}
      </div>

      {!pl.has && (
        <div className="notice">
          Nothing budgeted for {MONTHS_LONG[m - 1]} yet. Type an amount next to each category, or
          {prevPlan.has ? <> <button className="btn" onClick={copyPrev}>Use {MONTHS[prev.m - 1]}'s budget</button></> : " start with the ones you know (rent, food, transport)."}
        </div>
      )}

      <div className="groups">
        {groups.map((g) => {
          const cats = book.catsIn(g.id);
          return (
            <section className="grp" key={g.id}>
              <div className="grp-h">
                <span className="fold static"><Swatch g={g} /><h3>{g.name}</h3></span>
                <span className="tot num">{money(pl.byGroup[g.id] || 0)}</span>
              </div>
              <div>{cats.map((c) => <BudgetRow key={c.id} c={c} y={y} m={m} />)}</div>
            </section>
          );
        })}
        {!groups.length && <div className="panel">Add spending or saving categories on the <a href="#categories">Categories</a> page first.</div>}
      </div>
      <p className="small muted">An amount is the usual one for every month unless you tick <b>Only {MONTHS[m - 1]}</b>: school fees in January, insurance in November.</p>
    </>
  );
}

function BudgetRow({ c, y, m }: { c: Category; y: number; m: number }) {
  const { book, change } = useApp();
  const value = book.planMonthly(y, m, c.id);
  const only = book.budgetOverride(y, m, c.id) != null;
  // what the other months get, for the hint beside a month-only amount
  const usual = (() => {
    for (let i = 1; i <= 12; i++) if (i !== m && book.budgetOverride(y, i, c.id) == null) return book.planMonthly(y, i, c.id);
    return null;
  })();
  const spent = book.actual(y, m, c.id);
  return (
    <div className="brow">
      <span className="nname">{c.name}{spent != null && <span className="muted small"> · {money(spent)} so far</span>}</span>
      <label className={`only small${only ? " on" : ""}`} title={`Use this amount for ${MONTHS_LONG[m - 1]} only; the other months keep theirs`}>
        <input type="checkbox" checked={only} aria-label={`${c.name}: ${MONTHS_LONG[m - 1]} only`}
          onChange={(e) => change((l) => void setMonthOnly(l, y, m, c.id, e.target.checked ? (value ?? 0) : null), [`y:${y}`])} />
        Only {MONTHS[m - 1]}
        {only && usual != null && <span className="muted"> (usually {money(usual)})</span>}
      </label>
      <AmountInput value={value} label={`${c.name} budget for ${MONTHS_LONG[m - 1]}`} placeholder="–"
        onCommit={(v) => change((l) => void (only ? setMonthOnly(l, y, m, c.id, v) : setUsualBudget(l, y, c.id, v)), [`y:${y}`])} />
    </div>
  );
}

/** The whole year at once: every category by month, with a yearly figure to spread evenly. */
function BudgetYear() {
  const { book, change, view, setView, go, notify } = useApp();
  const y = view.planYear;
  const expected = book.expectedIncome();
  const bud = book.planRange(y, 1, 12);
  const isNow = y === book.today.y;
  const past = (m: number) => (isNow && m < book.today.m ? "past" : "");
  const totals = MONTHS.map((_, i) => book.planRange(y, i + 1, i + 1));
  const prevActual = book.rangeTotals(y - 1, 1, 12).has;

  // both replace the whole year's budget, so say so with an Undo when there was one to replace
  const replaced = (what: string) => notify(book.hasAnyBudget(y) ? `${y} budget replaced with ${what}.` : `${y} budget set from ${what}.`, book.hasAnyBudget(y));
  const copyPrev = () => {
    replaced(`the ${y - 1} budget`);
    change((l) => {
      const src = l.years[String(y - 1)];
      const yd = yearOf(l, y);
      yd.plan = structuredClone(src?.plan ?? {});
      yd.budget = structuredClone(src?.budget ?? {});
    }, [`y:${y}`]);
  };
  const fromActuals = () => {
    replaced(`${y - 1} actuals`);
    change((l) => {
      const yd = yearOf(l, y);
      yd.plan = {};
      yd.budget = {};
      for (let m = 1; m <= 12; m++)
        for (const [cid, v] of Object.entries(l.years[String(y - 1)]?.actual?.[mk(m)] ?? {}))
          if (book.budgeted(cid) && !book.cats[cid].archived && isNum(v)) (yd.budget[mk(m)] ??= {})[cid] = Math.round(v / 100) * 100;
    }, [`y:${y}`]);
  };

  return (
    <>
      <div className="bar"><YearSelect id="pyear" label="Budget year" value={y} onChange={(planYear) => setView({ planYear })} /></div>
      <div className="panel">
        <div className="panel-h"><h3>The next 12 months</h3><span className="muted small">Actual figures where you have them, budget for the rest</span></div>
        <p className="small muted">
          {expected.months
            ? <>Income isn't budgeted. For months ahead it's expected at {book.settings.currency} {money(expected.amount)}, your average over the last {expected.months === 1 ? "month" : `${expected.months} months`} with income.</>
            : <>Income isn't budgeted. Once you record some, months ahead expect your recent average.</>}
        </p>
        <div className="scroll">
          <table className="t">
            <thead><tr><th>Month</th><th>Income</th><th>Saved</th><th>Spent</th><th>Left over</th><th>Running total</th></tr></thead>
            <tbody>
              {book.ahead(12).map(({ ym, f, running }) => (
                <tr key={`${ym.y}-${ym.m}`}>
                  <td>
                    <button className="link" onClick={() => go("month", { y: ym.y, m: ym.m })}>{fmtYM(ym)}</button>{" "}
                    {f.src === "actual" && <span className="chip">Actual</span>}
                    {f.src === "none" && <button className="chip over" style={{ border: 0, cursor: "pointer" }} onClick={() => setView({ planYear: ym.y })}>▲ No budget</button>}
                  </td>
                  <td>{f.has ? money(f.income) : "–"}{f.src === "budget" && <span className="muted small"> expected</span>}</td>
                  <td>{f.has ? money(f.saved) : "–"}</td>
                  <td>{f.has ? money(f.spent) : "–"}</td>
                  <td className={f.left < 0 ? "d-bad" : ""}>{f.has ? money(f.left) : "–"}{f.has && f.left < 0 && <> <span className="chip over">▼ Short</span></>}</td>
                  <td className={running < 0 ? "d-bad" : ""}>{money(running)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <div className="panel-h">
          <h3>{y} budget by month</h3>
          <div className="end">
            <button className="btn" disabled={!book.hasAnyBudget(y - 1)} onClick={copyPrev}>Copy {y - 1} budget</button>
            <button className="btn" disabled={!prevActual} onClick={fromActuals}>Use {y - 1} actuals, month by month</button>
          </div>
        </div>
        <div className="key">
          <span>Type a yearly figure in the <b>Year</b> column to spread it evenly.</span>
          <span>Type in a month to set that month on its own (school fees in January, insurance in November).</span>
          <span>Grey figures like <span className="ex">{money(18000)}</span> come from the yearly figure. Clear a month to go back to it.</span>
        </div>
        <div className="scroll">
          <table className="t bg">
            <thead>
              <tr>
                <th>Category</th>
                {MONTHS.map((mn, i) => <th key={mn} className={`${past(i + 1)} ${isNow && i + 1 === book.today.m ? "now" : ""}`}>{mn}</th>)}
                <th>Year</th>
              </tr>
            </thead>
            <tbody>
              {book.outGroups().map((g) => {
                const cats = book.catsIn(g.id);
                if (!cats.length) return null;
                const gm = totals.map((t) => t.byGroup[g.id] || 0);
                return [
                  <tr className="gh" key={g.id}>
                    <td><Swatch g={g} /> {g.name}</td>
                    {gm.map((v, i) => <td key={i} className={past(i + 1)}>{v ? money(v) : "–"}</td>)}
                    <td>{money(gm.reduce((a, b) => a + b, 0))}</td>
                  </tr>,
                  ...cats.map((c) => {
                    const annual = book.planAnnual(y, c.id);
                    return (
                      <tr className="cat" key={c.id}>
                        <td>{c.name}</td>
                        {MONTHS.map((mn, i) => (
                          <td key={mn} className={past(i + 1)}>
                            <AmountInput value={book.budgetOverride(y, i + 1, c.id)} placeholder={annual != null ? money(book.planMonthly(y, i + 1, c.id) ?? 0) : ""}
                              label={`${c.name} budget for ${mn}`}
                              onCommit={(v) => change((l) => void setBudget(l, y, i + 1, c.id, v), [`y:${y}`])} />
                          </td>
                        ))}
                        <td>
                          <AmountInput className="yr" value={book.planYear(y, c.id)} label={`${c.name} budget for the year`}
                            title="Typing here spreads the amount evenly over the 12 months"
                            onCommit={(v) => change((l) => void setPlan(l, y, c.id, v), [`y:${y}`])} />
                        </td>
                      </tr>
                    );
                  }),
                ];
              })}
              {([["saved", "Saved"], ["spent", "Spent"], ["out", "Total budgeted"]] as const).map(([k, label]) => {
                const v = (t: typeof bud) => (k === "out" ? t.saved + t.spent : t[k]);
                return (
                  <tr className="sum" key={k}>
                    <td>{label}</td>
                    {totals.map((t, i) => <td key={i} className={past(i + 1)}>{t.has ? money(v(t)) : "–"}</td>)}
                    <td>{bud.has ? money(v(bud)) : "–"}</td>
                  </tr>
                );
              })}
              {!book.settings.cats.some((c) => book.budgeted(c.id)) && (
                <tr><td colSpan={14}>Add savings or spending categories on the <button className="link" onClick={() => go("categories")}>Categories</button> tab first.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
