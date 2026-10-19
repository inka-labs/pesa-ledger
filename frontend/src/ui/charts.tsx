/** The charts. The two over time (where each month's money went; one measure across two years) are
 *  Plotly, for zoom, legend toggles and saving as PNG. The two that are single bars per row (where the
 *  income went; what changed most) are plain HTML. The tables beside them carry the same numbers. */

import { useMemo } from "react";
import type { Annotations, Data, Layout, Shape } from "plotly.js";
import { money, pct } from "../model/format";
import { MONTHS, type Book } from "../model/ledger";
import type { Metric, Totals } from "../model/types";
import { Swatch } from "./bits";
import { colorOf } from "../model/theme";
import { baseLayout, chartTheme, cssColor, Plot, useThemeTick } from "./Plot";

const esc = (s: string) => s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]!);
const mk = (m: number) => String(m).padStart(2, "0");

/** A colour with transparency, for Plotly (which can't mix colours itself): "#2a78d6" or "rgb(…)" at `a`. */
function alpha(c: string, a: number): string {
  const h = /^#([0-9a-f]{6})$/i.exec(c.trim());
  if (h) { const n = parseInt(h[1], 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }
  const r = /^rgba?\(([^)]+)\)$/.exec(c.trim());
  if (r) { const [x, y, z] = r[1].split(/[ ,/]+/); return `rgba(${x},${y},${z},${a})`; }
  return c;
}

/** Each month's savings and spending stacked by group (one-offs hatched on top of their group), income as a
 *  line, and the month's budget as a tick. Click a month to open it. */
export function YearChart({ book, y, onMonth }: { book: Book; y: number; onMonth?: (m: number) => void }) {
  const tick = useThemeTick();
  const { data, layout } = useMemo(() => {
    const t = chartTheme();
    const x = MONTHS.map((_, i) => `${y}-${mk(i + 1)}-01`);
    const totals = MONTHS.map((_, i) => book.monthTotals(y, i + 1));
    const plans = MONTHS.map((_, i) => book.planRange(y, i + 1, i + 1));
    const showOneOffs = !book.regularOnly;
    const data: Data[] = [];
    let firstOneOff = true;
    for (const g of book.outGroups()) {
      const col = cssColor(colorOf(g));
      const oo = totals.map((tt) => (showOneOffs ? Math.min(tt.oneOff.byGroup[g.id] || 0, Math.max(0, tt.byGroup[g.id] || 0)) : 0));
      data.push({
        type: "bar", name: g.name, x, y: totals.map((tt, i) => (tt.has ? (tt.byGroup[g.id] || 0) - oo[i] : null)),
        marker: { color: col }, legendgroup: g.id, legendrank: 100,
        hovertemplate: `${esc(g.name)}: %{y:,.0f}<extra></extra>`,
      });
      if (oo.some((v) => v > 0)) {
        data.push({
          type: "bar", name: "One-off", x, y: oo.map((v) => v || null), legendgroup: "oneoff", showlegend: firstOneOff,
          marker: { color: col, pattern: { shape: "/", fillmode: "overlay", fgcolor: t.surface, fgopacity: 0.8, size: 7, solidity: 0.35 } }, legendrank: 900,
          hovertemplate: `${esc(g.name)}, one-off: %{y:,.0f}<extra></extra>`,
        });
        firstOneOff = false;
      }
    }
    data.push({
      type: "scatter", mode: "lines+markers", name: "Income", x, y: totals.map((tt) => (tt.has ? tt.income : null)),
      line: { color: t.ink, width: 2 }, marker: { size: 7, color: t.ink, line: { color: t.surface, width: 2 } }, legendrank: 1,
      hovertemplate: "Income: %{y:,.0f}<extra></extra>",
    });
    if (plans.some((p) => p.has)) data.push({
      type: "scatter", mode: "markers", name: "Budget", x, y: plans.map((p) => (p.has && p.saved + p.spent > 0 ? p.saved + p.spent : null)),
      marker: { symbol: "line-ew", size: window.innerWidth < 700 ? 14 : 30, color: t.muted, line: { width: 2.5, color: t.muted } }, legendrank: 1000,
      hovertemplate: "Budget: %{y:,.0f}<extra></extra>",
    });
    // what's left over, for the tooltip only
    data.push({
      type: "scatter", mode: "markers", name: "Left over", x, y: totals.map((tt) => (tt.has ? 0 : null)),
      customdata: totals.map((tt) => tt.left), marker: { size: 1, opacity: 0 }, showlegend: false,
      hovertemplate: "<b>Left over: %{customdata:,.0f}</b><extra></extra>",
    });
    const base = baseLayout(t, 360);
    const layout: Partial<Layout> = {
      ...base,
      barmode: "relative",
      xaxis: { ...base.xaxis, type: "date", tickformat: "%b", dtick: "M1", hoverformat: "%B %Y", range: [`${y - 1}-12-16`, `${y}-12-16`] },
    };
    return { data, layout };
  }, [book, y, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Plot data={data} layout={layout} label={`Monthly income and outflows for ${y}`} filename={`pesa-ledger-${y}`}
      onClick={(e) => { const p = e.points[0]; if (p && onMonth) onMonth(Number(String(p.x).slice(5, 7))); }} />
  );
}

/** Where a period's income went: one bar split by group, plus what's left, each as a share of income. */
export function ShareBar({ book, t }: { book: Book; t: Totals }) {
  if (!t.has || t.income <= 0) return <p className="muted small">No income recorded for these months yet.</p>;
  const parts = book.outGroups().map((g) => ({ g, v: t.byGroup[g.id] || 0 })).filter((p) => p.v > 0);
  const out = parts.reduce((s, p) => s + p.v, 0);
  const left = t.income - out;
  const base = Math.max(t.income, out);
  return (
    <div className="share">
      <div className="share-bar" role="img" aria-label="Share of income by group">
        {parts.map(({ g, v }) => <i key={g.id} style={{ width: `${(v / base) * 100}%`, background: colorOf(g) }} title={`${g.name}: ${pct(v / t.income)} of income`} />)}
        {left > 0 && <i className="left" style={{ width: `${(left / base) * 100}%` }} title={`Left over: ${pct(left / t.income)} of income`} />}
      </div>
      <ul className="share-list">
        {parts.map(({ g, v }) => (
          <li key={g.id}><Swatch g={g} /><span>{g.name}</span><b className="num">{pct(v / t.income)}</b><span className="num muted">{money(v)}</span></li>
        ))}
        <li><span className="sw left" /><span>Left over</span><b className={`num${left < 0 ? " d-bad" : ""}`}>{left < 0 ? "−" : ""}{pct(left / t.income)}</b><span className="num muted">{money(left)}</span></li>
      </ul>
      {left < 0 && <p className="small d-bad">More went out than came in: {money(-left)} came from savings or credit.</p>}
    </div>
  );
}

/** Running totals: each month's figure added to the months before it (gaps stay gaps). */
function running(vals: (number | null)[]): (number | null)[] {
  let s = 0;
  return vals.map((v) => (v == null ? null : (s += v)));
}

/** One measure across two years, month by month or as a running total, with the gap between them underneath.
 *  Months whose figure includes a one-off get a ring. */
export function CompareChart({ book, a, b, metric, mode = "month" }: { book: Book; a: number; b: number; metric: Metric; mode?: "month" | "running" }) {
  const tick = useThemeTick();
  const label = book.metricLabel(metric);
  const { data, layout } = useMemo(() => {
    const t = chartTheme();
    const rawA = MONTHS.map((_, i) => book.metric(a, i + 1, metric));
    const rawB = MONTHS.map((_, i) => book.metric(b, i + 1, metric));
    const va = mode === "running" ? running(rawA) : rawA;
    const vb = mode === "running" ? running(rawB) : rawB;
    const up = book.upIsGood(metric);
    const data: Data[] = [];
    // this year: a bolder line over a soft area; the year it's compared with: a lighter line on top of nothing
    const lineFor = (yr: number, vals: (number | null)[], col: string, main: boolean) => data.push({
      type: "scatter", mode: "lines+markers", name: String(yr), x: MONTHS, y: vals, legendrank: main ? 1 : 2,
      line: { color: col, width: main ? 3 : 2, shape: "spline", smoothing: 0.35 }, // gentle: more would overshoot between equal months
      marker: { size: main ? 8 : 6, color: col, line: { color: t.surface, width: 2 } },
      opacity: main ? 1 : 0.85,
      // an area under this year's line that fades towards the bottom (Plotly has fillgradient; its types don't yet)
      ...(main ? { fill: "tozeroy" as const, fillcolor: alpha(col, 0.1), ...({ fillgradient: { type: "vertical", colorscale: [[0, alpha(col, 0)], [1, alpha(col, 0.22)]] } } as object) } : {}),
      hovertemplate: `${yr}: %{y:,.0f}<extra></extra>`,
    });
    lineFor(b, vb, t.b, false);
    lineFor(a, va, t.a, true);
    if (!book.regularOnly) {
      let first = true;
      for (const [yr, vals, col] of [[a, va, t.a], [b, vb, t.b]] as const) {
        const rings = MONTHS.map((_, i) => (vals[i] != null && book.metricOneOff(yr, i + 1, metric) ? vals[i] : null));
        if (!rings.some((v) => v != null)) continue;
        data.push({
          type: "scatter", mode: "markers", name: "Includes a one-off", x: MONTHS, y: rings, legendgroup: "oneoff", showlegend: first,
          marker: { symbol: "circle-open", size: 20, color: col, line: { width: 1.5, color: col } }, hoverinfo: "skip",
        });
        first = false;
      }
    }
    const gaps = MONTHS.map((_, i) => (va[i] != null && vb[i] != null ? va[i]! - vb[i]! : null));
    data.push({
      type: "bar", name: `${a} − ${b}`, x: MONTHS, y: gaps, yaxis: "y2", showlegend: false,
      marker: { color: gaps.map((g) => (g == null ? t.muted : g > 0 === up ? t.good : t.bad)), opacity: 0.85 },
      hovertemplate: `Difference: %{y:+,.0f}<extra></extra>`,
    });

    // each year's monthly average as a dashed line, labelled at the right (month by month only)
    const avg = (vals: (number | null)[]) => { const n = vals.filter((v): v is number => v != null); return n.length ? n.reduce((x, y) => x + y, 0) / n.length : null; };
    const shapes: Partial<Shape>[] = [], notes: Partial<Annotations>[] = [];
    if (mode === "month") {
      const avA = avg(va), avB = avg(vb);
      const pair = [[a, avA, t.a], [b, avB, t.b]] as const;
      pair.forEach(([yr, v, col], i) => {
        if (v == null) return;
        shapes.push({ type: "line", xref: "paper", x0: 0, x1: 1, yref: "y", y0: v, y1: v, line: { color: col, width: 1.2, dash: "dash" }, opacity: 0.7 });
        // the higher average's label sits above its line, the lower one's below, so they never overlap
        const other = pair[1 - i][1];
        const above = other == null || v >= other;
        notes.push({ xref: "paper", x: 1, xanchor: "right", yref: "y", y: v, yanchor: above ? "bottom" : "top", yshift: above ? 2 : -2,
          showarrow: false, text: `${yr} average ${money(v)}`, font: { size: 11.5, color: col }, bgcolor: alpha(t.surface, 0.85) });
      });
    }

    // the axis fits the figures with room around them, rather than starting at zero, so month-to-month
    // movement is visible; it only reaches zero (or below) when the figures do
    const all = [...va, ...vb].filter((v): v is number => v != null);
    const dmin = all.length ? Math.min(...all) : 0, dmax = all.length ? Math.max(...all) : 1;
    const pad = Math.max((dmax - dmin) * 0.35, Math.abs(dmax) * 0.04, 1);
    const lo = dmin >= 0 ? Math.max(0, dmin - pad) : dmin - pad, hi = dmax + pad;
    const phone = window.innerWidth < 700;
    const base = baseLayout(t, phone ? 440 : 540);
    const layout: Partial<Layout> = {
      ...base,
      margin: { l: 56, r: 12, t: 8, b: 30 },
      // rounded bar ends (Plotly has this; its type definitions don't yet)
      ...({ barcornerradius: 4 } as Partial<Layout>),
      xaxis: { ...base.xaxis, anchor: "y2", spikecolor: t.muted, spikethickness: 1, spikedash: "dot" },
      yaxis: { ...base.yaxis, domain: [0.3, 1], range: [lo, hi], nticks: 6 },
      yaxis2: { ...base.yaxis, domain: [0, 0.19], zerolinecolor: t.muted, nticks: 3 },
      shapes,
      annotations: [
        ...notes,
        { xref: "paper", yref: "paper", x: 0, y: 0.205, xanchor: "left", yanchor: "bottom", showarrow: false, text: `${a} minus ${b}, each month`, font: { size: 11.5, color: t.muted } },
      ],
    };
    return { data, layout };
  }, [book, a, b, metric, mode, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  return <Plot data={data} layout={layout} label={`${label}${mode === "running" ? ", running total," : ""} ${a} against ${b}`} filename={`pesa-ledger-${a}-vs-${b}`} />;
}

/** The categories behind a change between two periods, biggest first: click one to chart it. */
export function Movers({ book, ta, tb, a, b, upto, onPick, limit = 8 }: { book: Book; ta: Totals; tb: Totals; a: number; b: number; upto: number; onPick: (metric: Metric) => void; limit?: number }) {
  const oneOff = (cid: string) => !book.regularOnly && (book.metricOneOff(a, 1, `c:${cid}`, upto) || book.metricOneOff(b, 1, `c:${cid}`, upto));
  const rows = book.settings.cats
    .filter((c) => book.effectOf(c.id) !== "none")
    .map((c) => ({ c, d: (ta.byCat[c.id] || 0) - (tb.byCat[c.id] || 0), x: ta.byCat[c.id] || 0, y: tb.byCat[c.id] || 0 }))
    .filter((r) => Math.round(r.d) !== 0)
    .sort((p, q) => Math.abs(q.d) - Math.abs(p.d))
    .slice(0, limit);
  if (!rows.length) return <p className="muted small">No category changed between {b} and {a} for these months.</p>;
  const max = Math.max(...rows.map((r) => Math.abs(r.d)));
  return (
    <ul className="movers">
      {rows.map(({ c, d, x, y }) => {
        const g = book.groups[c.group];
        const good = d > 0 === book.upIsGood(`c:${c.id}`);
        const w = `${(Math.abs(d) / max) * 50}%`;
        return (
          <li key={c.id}>
            <button className="mover" onClick={() => onPick(`c:${c.id}`)} title={`${c.name}: ${money(y)} in ${b} → ${money(x)} in ${a}. Click to chart it.`}>
              <span className="mname">{g && <Swatch g={g} />}{c.name}{oneOff(c.id) ? <span className="chip" title="Includes a one-off">1×</span> : null}</span>
              <span className="mtrack">
                <span className="mzero" />
                <i className={good ? "gap-good" : "gap-bad"} style={d > 0 ? { left: "50%", width: w } : { right: "50%", width: w }} />
              </span>
              <span className={`num mval ${good ? "d-good" : "d-bad"}`}>{d > 0 ? "+" : "−"}{money(Math.abs(d))}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
