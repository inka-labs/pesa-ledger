/** Plotly, the app's way: loaded only when a chart is on screen (it's a megabyte), coloured from the
 *  palette and theme (it can't read CSS variables, so they're resolved here and the chart is redrawn
 *  when either changes), and sized to its card. Zoom, pan, legend toggles and "save as PNG" are Plotly's. */

import { useEffect, useRef, useState } from "react";
import type { Config, Data, Layout, PlotMouseEvent } from "plotly.js";

type PlotlyLib = typeof import("plotly.js");
let lib: Promise<PlotlyLib> | null = null;
const loadPlotly = () => (lib ??= import("plotly.js-basic-dist-min").then((m) => (m.default ?? m) as unknown as PlotlyLib));

/** A CSS colour as Plotly needs it: `var(--s3)` becomes the colour it stands for right now. */
export function cssColor(c: string): string {
  const m = /^var\((--[\w-]+)\)$/.exec(c.trim());
  if (!m) return c;
  return getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim() || "#888";
}

/** Changes whenever the theme or the palette does, so charts redraw in the new colours. */
export function useThemeTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    const mo = new MutationObserver(bump);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "style"] });
    const pal = document.getElementById("palette");
    if (pal) mo.observe(pal, { childList: true, characterData: true, subtree: true });
    const mq = matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", bump);
    return () => { mo.disconnect(); mq.removeEventListener("change", bump); };
  }, []);
  return tick;
}

/** The colours and fonts every chart shares, read from the page. */
export function chartTheme() {
  const v = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  return {
    ink: v("--ink"), ink2: v("--ink-2"), muted: v("--muted"), line: v("--line"), surface: v("--surface"), sunk: v("--sunk"),
    good: v("--good"), bad: v("--bad"), a: v("--cmp-a"), b: v("--cmp-b"),
    body: v("--f-body") || "system-ui", num: v("--f-num") || "monospace",
  };
}

/** The layout every chart starts from: transparent, recessive grid, legend on top, one tooltip per month. */
export function baseLayout(t: ReturnType<typeof chartTheme>, height: number): Partial<Layout> {
  return {
    height,
    margin: { l: 56, r: 12, t: 8, b: 32 },
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: { family: t.body, size: 12, color: t.ink2 },
    hovermode: "x unified",
    hoverlabel: { bgcolor: t.surface, bordercolor: t.line, font: { family: t.body, size: 12, color: t.ink } },
    legend: { orientation: "h", x: 0, y: 1.02, yanchor: "bottom", font: { size: 12, color: t.ink2 }, itemclick: "toggle", itemdoubleclick: "toggleothers" },
    xaxis: { fixedrange: false, showgrid: false, linecolor: t.line, tickfont: { color: t.muted }, ticks: "" },
    yaxis: { gridcolor: t.line, zerolinecolor: t.muted, zerolinewidth: 1, tickformat: "~s", tickfont: { color: t.muted, family: t.body }, separatethousands: true },
    bargap: 0.38,
    modebar: { bgcolor: "rgba(0,0,0,0)", color: t.muted, activecolor: t.ink, orientation: "h" },
    dragmode: "zoom",
  };
}

export function Plot({ data, layout, label, filename, onClick }: {
  data: Data[];
  layout: Partial<Layout>;
  label: string;
  filename: string;
  onClick?: (e: PlotMouseEvent) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const click = useRef(onClick);
  click.current = onClick;

  useEffect(() => {
    let alive = true;
    const el = ref.current;
    loadPlotly().then((Plotly) => {
      if (!alive || !el) return;
      const config: Partial<Config> = {
        responsive: true,
        displaylogo: false,
        modeBarButtonsToRemove: ["select2d", "lasso2d", "autoScale2d"],
        toImageButtonOptions: { filename, format: "png", scale: 2 },
      };
      Plotly.react(el, data, layout, config).then(() => {
        const node = el as unknown as { removeAllListeners?: (e: string) => void; on?: (e: string, f: (ev: PlotMouseEvent) => void) => void };
        node.removeAllListeners?.("plotly_click");
        node.on?.("plotly_click", (ev) => click.current?.(ev));
      });
    }).catch(() => alive && setFailed(true));
    return () => { alive = false; };
  }, [data, layout, filename]);

  useEffect(() => {
    const el = ref.current;
    return () => { if (el) loadPlotly().then((P) => P.purge(el)).catch(() => undefined); };
  }, []);

  if (failed) return <p className="muted small">The chart couldn't load. The table below has the same figures.</p>;
  return <div className="plot" ref={ref} role="img" aria-label={label} style={{ minHeight: layout.height }} />;
}
