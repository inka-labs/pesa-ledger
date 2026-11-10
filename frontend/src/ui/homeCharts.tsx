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
    const accent = cssColor("var(--accent)"), spent = cssColor("var(--s2)"), saved = cssColor("var(--s1)");
    const line = (name: string, y: (number | null)[], c: string, fill: boolean): Data => ({
      type: "scatter", mode: "lines+markers", name, x, y, connectgaps: false,
      line: { color: c, width: 2.4, shape: "spline", smoothing: 0.6 }, marker: { size: 5, color: c },
      fill: fill ? "tozeroy" : "none", fillcolor: alpha(c, 0.1),
      hovertemplate: `${name}: %{y:,.0f}<extra></extra>`,
    });
    const data: Data[] = [line("Came in", val("income"), accent, true), line("Spent", val("spent"), spent, true), line("Saved", val("saved"), saved, false)];
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
      annotations: [{ text: `<b>${money(total)}</b><br><span style="font-size:11px">this month</span>`, showarrow: false, font: { size: 17, color: th.ink, family: th.body }, x: 0.5, y: 0.5 }],
    };
    return { data, layout };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(parts.map((x) => [x.g.id, x.v])), tick]);
  if (!parts.length) return <p className="muted small">Nothing spent or saved this month yet.</p>;
  return (
    <div className="donut">
      <Plot data={data} layout={layout} label={`Where this month's ${money(total)} went`} filename="pesa-where-it-went" />
      <ul className="donut-key">
        {parts.map(({ g, v }) => (
          <li key={g.id}><i style={{ background: colorOf(g) }} /><span>{g.name}</span><span className="num">{Math.round((v / total) * 100)}%</span></li>
        ))}
      </ul>
    </div>
  );
}
