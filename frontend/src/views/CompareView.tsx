import type { ReactNode } from "react";
import { useApp } from "../context";
import { money, pct } from "../model/format";
import { MONTHS } from "../model/ledger";
import { Alt, Delta, Kpi, OneOffNote, OneOffToggle, Swatch, YearSelect } from "../ui/bits";
import { CompareChart } from "../ui/charts";

export function CompareView() {
  const app = useApp();
  const { view, setView } = app;
  const book = view.regular ? app.book.regular : app.book;
  const { cmpA: a, cmpB: b, cmpMetric: metric, cmpSame } = view;
  const lastA = book.lastDataMonth(a), lastB = book.lastDataMonth(b);
  const upto = cmpSame ? Math.max(1, Math.min(lastA || 12, lastB || 12)) : 12;
  const ta = book.rangeTotals(a, 1, upto), tb = book.rangeTotals(b, 1, upto);
  const span = upto === 12 ? "full year" : `Jan–${MONTHS[upto - 1]}`;
  const va = book.metric(a, 1, metric, upto), vb = book.metric(b, 1, metric, upto);
  const label = book.metricLabel(metric);

  const row = (key: string, name: ReactNode, x: number, y: number, up: boolean, cls = "") => {
    const d = x - y, p = y ? d / Math.abs(y) : null;
    const tone = d === 0 ? "" : d > 0 === up ? "d-good" : "d-bad";
    return (
      <tr className={cls} key={key}>
        <td>{name}</td>
        <td>{money(x)}</td>
        <td>{money(y)}</td>
        <td className={tone}>{d > 0 ? "+" : d < 0 ? "−" : ""}{money(Math.abs(d))}</td>
        <td className={tone}>{p == null ? "–" : `${d > 0 ? "▲ " : d < 0 ? "▼ " : ""}${pct(p)}`}</td>
      </tr>
    );
  };

  return (
    <>
      <div className="panel-h">
        <h2>Year on year</h2>
        <span className="muted">{span}</span>
        <div className="end">
          <label className="bar small">Compare <YearSelect id="ca" label="First year" value={a} onChange={(cmpA) => setView({ cmpA })} /> with <YearSelect id="cb" label="Second year" value={b} onChange={(cmpB) => setView({ cmpB })} /></label>
          <label className="bar small"><input type="checkbox" checked={cmpSame} onChange={(e) => setView({ cmpSame: e.target.checked })} /> Same months only</label>
          <OneOffToggle />
        </div>
      </div>
      <OneOffNote t={ta} what={String(a)} />
      <OneOffNote t={tb} what={String(b)} />
      <div className="kpis">
        <Kpi label={`${label} · ${a}`} value={va || 0} lead>
          <Delta cur={va} prev={vb} upGood={book.upIsGood(metric)} label={String(b)} />
          <Alt v={va || 0} />
        </Kpi>
        <Kpi label={`${label} · ${b}`} value={vb || 0}><Alt v={vb || 0} /></Kpi>
        <Kpi label={`Monthly average · ${a}`} value={(va || 0) / Math.max(1, Math.min(upto, lastA || 1))}>
          <span>{b}: {money((vb || 0) / Math.max(1, Math.min(upto, lastB || 1)))}</span>
        </Kpi>
      </div>
      <div className="panel">
        <div className="panel-h">
          <h3>{label}, month by month</h3>
          <div className="end">
            <label className="bar small" htmlFor="cmet">Show</label>
            <select id="cmet" value={metric} onChange={(e) => setView({ cmpMetric: e.target.value })}>
              <optgroup label="Totals">
                <option value="income">Income</option><option value="saved">Saved</option><option value="spent">Spent</option><option value="left">Left over</option>
              </optgroup>
              {book.settings.groups.map((g) => (
                <optgroup key={g.id} label={g.name}>
                  <option value={`g:${g.id}`}>All {g.name}</option>
                  {book.catsIn(g.id, true).map((c) => <option key={c.id} value={`c:${c.id}`}>{c.name}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
        </div>
        <div className="legend">
          <span><span className="ln" style={{ background: "var(--cmp-a)" }} />{a}</span>
          <span><span className="ln" style={{ background: "var(--cmp-b)" }} />{b}</span>
        </div>
        <CompareChart book={book} a={a} b={b} metric={metric} />
      </div>
      <div className="panel">
        <div className="panel-h"><h3>Every category, {span}</h3></div>
        <div className="scroll">
          <table className="t">
            <thead><tr><th>Category</th><th>{a}</th><th>{b}</th><th>Change</th><th>Change %</th></tr></thead>
            <tbody>
              {row("income", "Income", ta.income, tb.income, true, "sum")}
              {row("saved", "Saved", ta.saved, tb.saved, true, "sum")}
              {row("spent", "Spent", ta.spent, tb.spent, false, "sum")}
              {row("left", "Left over", ta.left, tb.left, true, "sum")}
              {book.settings.groups.flatMap((g) => {
                const up = book.effectOfGroup(g) !== "out";
                return [
                  row(g.id, <><Swatch g={g} /> {g.name}</>, ta.byGroup[g.id] || 0, tb.byGroup[g.id] || 0, up, "gh"),
                  ...book.catsIn(g.id, true)
                    .filter((c) => ta.byCat[c.id] || tb.byCat[c.id] || !c.archived)
                    .map((c) => row(c.id, c.name, ta.byCat[c.id] || 0, tb.byCat[c.id] || 0, up, "cat")),
                ];
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
