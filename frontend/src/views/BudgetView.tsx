import { useApp } from "../context";
import { setBudget, setPlan, yearOf } from "../model/edit";
import { money } from "../model/format";
import { fmtYM, isNum, mk, MONTHS } from "../model/ledger";
import { Alt, AmountInput, Delta, Kpi, Swatch, YearSelect } from "../ui/bits";

export function BudgetView() {
  const { book, change, view, setView, go, notify } = useApp();
  const y = view.planYear;
  const fc = book.forecastYear(y);
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
      <div className="panel-h">
        <h2>Budget</h2>
        <span className="muted">Plan the months ahead</span>
        <div className="end"><YearSelect id="pyear" label="Budget year" value={y} onChange={(planYear) => setView({ planYear })} /></div>
      </div>

      <div className="kpis">
        {(["income", "saved", "spent", "left"] as const).map((k, i) => (
          <Kpi key={k} label={`${{ income: "Income", saved: "Saved", spent: "Spent", left: "Left over" }[k]} · ${y} forecast`} value={fc[k]} lead={i === 3}>
            {k === "income" && <span>{expected.months ? `Expected ${money(expected.amount)} a month` : "No income recorded yet"}</span>}
            {(k === "saved" || k === "spent") && <span>{bud.has ? `Budget ${money(bud[k])}` : "No budget yet"}</span>}
            {(k === "saved" || k === "spent") && bud.has && fc.has && <Delta cur={fc[k]} prev={bud[k]} upGood={k !== "spent"} label="budget" />}
            {k === "left" && <span>If every budget is kept</span>}
            <Alt v={fc[k]} />
          </Kpi>
        ))}
      </div>

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
                            <AmountInput value={book.budgetOverride(y, i + 1, c.id)} placeholder={annual != null ? money(annual / 12) : ""}
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
