/** Home's two charts: money in and out over the last 12 months, and where this month's money went. */

import { useMemo } from "react";
import type { Data, Layout } from "plotly.js";
import type { Book } from "../model/ledger";
import { addMonths, MONTHS } from "../model/ledger";
import { money } from "../model/format";
import { colorOf } from "../model/theme";
import type { Totals, YM } from "../model/types";
import { baseLayout, chartTheme, cssColor, Plot, useThemeTick } from "./Plot";

const alpha = (hex: string, a: number) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

/** Came in, spent and saved for each of the last 12 months, as soft filled lines. */
export function InOutChart({ book, onMonth }: { book: Book; onMonth: (ym: YM) => void }) {
  const tick = useThemeTick();
  const { data, layout, months } = useMemo(() => {
    const t = chartTheme();
    const months: YM[] = [];
    for (let i = 11; i >= 0; i--) months.push(addMonths(book.today, -i));
    const x = months.map((p) => `${MONTHS[p.m - 1]}${p.m === 1 || p === months[0] ? ` ${String(p.y).slice(2)}` : ""}`);
    const tot = months.map((p) => book.monthTotals(p.y, p.m));
    const val = (k: "income" | "spent" | "saved") => tot.map((x) => (x.has ? x[k] : null));
    // the same three colours as the Came in / Spent / Saved cards
    const income = cssColor("var(--m-in)"), spent = cssColor("var(--m-spent)"), saved = cssColor("var(--m-saved)");
    const line = (name: string, y: (number | null)[], c: string, fill: boolean): Data => ({
      type: "scatter", mode: "lines+markers", name, x, y, connectgaps: false,
      line: { color: c, width: 2.4, shape: "spline", smoothing: 0.6 }, marker: { size: 5, color: c },
      fill: fill ? "tozeroy" : "none", fillcolor: alpha(c, 0.1),
      hovertemplate: `${name}: %{y:,.0f}<extra></extra>`,
    });
    const data: Data[] = [line("Came in", val("income"), income, true), line("Spent", val("spent"), spent, true), line("Saved", val("saved"), saved, false)];
    const layout: Partial<Layout> = { ...baseLayout(t, 280), margin: { l: 48, r: 8, t: 30, b: 28 }, dragmode: false };
    return { data, layout, months };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book, tick]);
  return <Plot data={data} layout={layout} label="Money in, spent and saved over the last 12 months" filename="pesa-in-and-out"
    onClick={(e) => { const i = e.points?.[0]?.pointIndex; if (typeof i === "number" && months[i]) onMonth(months[i]); }} />;
}

/** This month's spending and saving by group, as a ring with the total in the middle. */
export function GroupDonut({ book, t }: { book: Book; t: Totals }) {
  const tick = useThemeTick();
  const parts = book.settings.groups
    .filter((g) => { const e = book.effectOfGroup(g); return e === "out" || e === "aside"; })
    .map((g) => ({ g, v: t.byGroup[g.id] || 0 }))
    .filter((x) => x.v > 0);
  const total = parts.reduce((s, x) => s + x.v, 0);
  const { data, layout } = useMemo(() => {
    const th = chartTheme();
    const data: Data[] = [{
      type: "pie", hole: 0.66, sort: false, direction: "clockwise",
      labels: parts.map((x) => x.g.name), values: parts.map((x) => x.v),
      marker: { colors: parts.map((x) => cssColor(colorOf(x.g))), line: { color: th.surface, width: 2 } },
      textinfo: "none", hovertemplate: "%{label}: %{value:,.0f} (%{percent})<extra></extra>",
    }];
    const layout: Partial<Layout> = {
      height: 220, margin: { l: 0, r: 0, t: 0, b: 0 }, showlegend: false, paper_bgcolor: "rgba(0,0,0,0)",
      font: { family: th.body, color: th.ink2 },
      hoverlabel: { bgcolor: th.surface, bordercolor: th.line, font: { family: th.body, color: th.ink } },
      annotations: [{ text: `<b>${money(total)}</b><br><span style="font-size:12px">spent + saved</span>`, showarrow: false, font: { size: 17, color: th.ink, family: th.body }, x: 0.5, y: 0.5 }],
    };
    return { data, layout };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(parts.map((x) => [x.g.id, x.v])), tick]);
  if (!parts.length) return <p className="muted small">Nothing spent or saved this month yet.</p>;
  return (
    <div className="donut">
      <Plot data={data} layout={layout} label={`Where this month's ${money(total)} spent and saved went, by group`} filename="pesa-where-it-went" />
      <ul className="donut-key">
        {parts.map(({ g, v }) => (
          <li key={g.id}><i style={{ background: colorOf(g) }} /><span>{g.name}</span><span className="num">{Math.round((v / total) * 100)}%</span></li>
        ))}
      </ul>
    </div>
  );
}

/** This month's spending by category against each one's budget: the categories you'd act on, biggest first. */
export function BudgetVsSpent({ book, onCat }: { book: Book; onCat: (cid: string) => void }) {
  const tick = useThemeTick();
  const ym = book.today;
  const rows = book.settings.cats
    .filter((c) => !c.archived && !c.oneoff && book.effectOf(c.id) === "out")
    .map((c) => ({ c, a: book.actual(ym.y, ym.m, c.id) ?? 0, b: book.planMonthly(ym.y, ym.m, c.id) ?? 0 }))
    .filter((x) => x.a > 0 || x.b > 0)
    .sort((x, y) => Math.max(y.a, y.b) - Math.max(x.a, x.b))
    .slice(0, 8)
    .reverse(); // Plotly draws the first row at the bottom
  const key = JSON.stringify(rows.map((x) => [x.c.id, x.a, x.b]));
  const { data, layout } = useMemo(() => {
    const t = chartTheme();
    const names = rows.map((x) => x.c.name);
    const col = (x: (typeof rows)[number]) => cssColor(x.b && x.a > x.b * 1.1 ? "var(--bad)" : x.b && x.a > x.b ? "var(--warn)" : "var(--accent)");
    const data: Data[] = [
      { type: "bar", orientation: "h", name: "Budget", y: names, x: rows.map((x) => x.b || null), marker: { color: alpha(cssColor("var(--muted)"), 0.22) },
        hovertemplate: "Budget %{x:,.0f}<extra></extra>", width: 0.72 },
      { type: "bar", orientation: "h", name: "Spent", y: names, x: rows.map((x) => x.a), marker: { color: rows.map(col) },
        customdata: rows.map((x) => x.c.id) as unknown as string[], width: 0.38,
        hovertemplate: "Spent %{x:,.0f}<extra>%{y}</extra>" },
    ];
    const layout: Partial<Layout> = {
      ...baseLayout(t, Math.max(200, rows.length * 36 + 36)), barmode: "overlay", dragmode: false, hovermode: "y unified", showlegend: false,
      margin: { l: 130, r: 12, t: 6, b: 28 },
      yaxis: { automargin: true, tickfont: { color: t.ink2, size: 12.5 }, showgrid: false, fixedrange: true },
      xaxis: { gridcolor: t.line, tickformat: "~s", tickfont: { color: t.muted }, fixedrange: true, zeroline: false },
    };
    return { data, layout };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick]);
  if (!rows.length) return <p className="muted small">Nothing spent or budgeted this month yet.</p>;
  return (
    <>
      <div className="bvs-key small">
        <span><i className="k-budget" /> Budget</span>
        <span><i className="k-in" /> Spent, within budget</span>
        <span><i className="k-over" /> Over</span>
        <span><i className="k-way" /> More than 10% over</span>
      </div>
      <Plot data={data} layout={layout} label="This month's spending against budget, by category" filename="pesa-budget-vs-spent"
        onClick={(e) => { const cid = (e.points?.[0] as { customdata?: string } | undefined)?.customdata; if (cid) onCat(cid); }} />
    </>
  );
}
