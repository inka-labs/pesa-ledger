import { useApp } from "../context";
import { money, pct } from "../model/format";
import { MONTHS } from "../model/ledger";
import type { Totals } from "../model/types";
import { Alt, CycleNote, Delta, FoldAll, GroupToggle, Kpi, OneOffNote, OneOffToggle, YearSelect } from "../ui/bits";
import { useFolded } from "../ui/fold";
import { ShareBar, YearChart } from "../ui/charts";

export function YearView() {
  const app = useApp();
  const { view, setView, go } = app;
  const book = view.regular ? app.book.regular : app.book;
  const y = view.yearView;
  const last = book.lastDataMonth(y) || 12;
  const t = book.rangeTotals(y, 1, last);
  const pl = book.planRange(y, 1, last);
  const lastYear = book.rangeTotals(y - 1, 1, last);
  const months = MONTHS.map((_, i) => book.monthTotals(y, i + 1));
  const yearT = book.rangeTotals(y, 1, 12);
  const planY = book.planRange(y, 1, 12);
  const { folded, toggle, setAll } = useFolded("year");
  const groupIds = book.settings.groups.map((g) => g.id);

  const cell = (v: number | undefined, key: number) => (v ? <td key={key}>{money(v)}</td> : <td key={key} className="empty">–</td>);
  const ofBudget = (a: number, p: number | null | undefined) => (p ? <td>{Math.round((a / p) * 100)}%</td> : <td className="empty">–</td>);
  const sumRow = (label: string, k: keyof Pick<Totals, "saved" | "spent" | "left">) => (
    <tr className="sum" key={k}>
      <td>{label}</td>
      {months.map((mt, i) => (mt.has ? <td key={i}>{money(mt[k])}</td> : <td key={i} className="empty">–</td>))}
      <td>{money(yearT[k])}</td>
      <td>{planY.has && k !== "left" ? money(planY[k]) : "–"}</td>
      {ofBudget(yearT[k], k === "left" ? null : planY[k])}
    </tr>
  );

  return (
    <>
      <div className="panel-h">
        <h2>{y} at a glance</h2>
        <span className="muted">{last === 12 ? "Full year" : `Jan–${MONTHS[last - 1]}, the months with figures`}</span>
        <div className="end"><OneOffToggle /><YearSelect id="ysel" label="Year" value={y} onChange={(yearView) => setView({ yearView })} /></div>
      </div>
      <CycleNote />
      <OneOffNote t={yearT} what={String(y)} />
      <div className="kpis">
        {(["income", "saved", "spent", "left"] as const).map((k, i) => (
          <Kpi key={k} label={{ income: "Income", saved: "Saved", spent: "Spent", left: "Left over" }[k]} value={t[k]} lead={i === 3}>
            {pl.has && (k === "saved" || k === "spent") && <span>Budget {money(pl[k])}</span>}
            {lastYear.has && <Delta cur={t[k]} prev={lastYear[k]} upGood={k !== "spent"} label={`same months ${y - 1}`} />}
            {k === "saved" && t.income > 0 && <span>{Math.round((t.saved / t.income) * 100)}% of income</span>}
            <Alt v={t[k]} />
          </Kpi>
        ))}
      </div>
      <div className="panel">
        <div className="panel-h"><h3>Where each month's money went</h3><span className="muted small">Bars stack savings and spending; the line is income. Click a legend item to hide it, drag to zoom, click a month to open it.</span></div>
        <YearChart book={book} y={y} onMonth={(m) => go("month", { y, m })} />
      </div>
      <div className="panel">
        <div className="panel-h"><h3>Where the income went</h3><span className="muted small">{last === 12 ? `All of ${y}` : `Jan–${MONTHS[last - 1]} ${y}`}, as a share of income</span></div>
        <ShareBar book={book} t={t} />
      </div>
      <div className="panel">
        <div className="panel-h">
          <h3>Month by month</h3><span className="muted small">Click a group to fold it. Budget is set on the Budget tab</span>
          <FoldAll ids={groupIds} folded={folded} setAll={setAll} />
        </div>
        <div className="scroll">
          <table className="t">
            <thead><tr><th>Category</th>{MONTHS.map((mn) => <th key={mn}>{mn}</th>)}<th>Total</th><th>Budget</th><th>% of budget</th></tr></thead>
            <tbody>
              {book.settings.groups.flatMap((g) => [
                <tr className="gh" key={g.id}>
                  <td><GroupToggle g={g} folded={folded.has(g.id)} onToggle={() => toggle(g.id)} count={book.catsIn(g.id, true).filter((c) => !c.archived || yearT.byCat[c.id]).length} /></td>
                  {months.map((mt, i) => cell(mt.byGroup[g.id], i))}
                  <td>{money(yearT.byGroup[g.id] || 0)}</td>
                  <td>{planY.byGroup[g.id] ? money(planY.byGroup[g.id]) : "–"}</td>
                  {ofBudget(yearT.byGroup[g.id] || 0, planY.byGroup[g.id])}
                </tr>,
                ...(folded.has(g.id) ? [] : book.catsIn(g.id, true)).filter((c) => !c.archived || yearT.byCat[c.id]).map((c) => {
                  const py = book.planYear(y, c.id);
                  return (
                    <tr className="cat" key={c.id}>
                      <td>{c.name}</td>
                      {months.map((mt, i) => cell(mt.byCat[c.id], i))}
                      <td>{money(yearT.byCat[c.id] || 0)}</td>
                      <td>{py ? money(py) : "–"}</td>
                      {ofBudget(yearT.byCat[c.id] || 0, py)}
                    </tr>
                  );
                }),
              ])}
              {sumRow("Total saved", "saved")}
              {sumRow("Total spent", "spent")}
              {sumRow("Left over", "left")}
              <tr>
                <td>Spending vs previous month</td>
                {months.map((mt, i) => {
                  const pv = i ? months[i - 1] : book.monthTotals(y - 1, 12);
                  if (!mt.has || !pv.has || !pv.spent) return <td key={i} className="empty">–</td>;
                  const p = (mt.spent - pv.spent) / pv.spent;
                  return <td key={i} className={p > 0.005 ? "d-bad" : p < -0.005 ? "d-good" : ""}>{p > 0 ? "▲" : p < 0 ? "▼" : ""}{pct(p)}</td>;
                })}
                <td /><td /><td />
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
