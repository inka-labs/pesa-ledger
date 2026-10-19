/** Two charts, hand-drawn in SVG on one shared scale each: where each month's money went (stacked
 *  outflows with income as a line), and one measure across two years. Both have a hover tooltip per
 *  month; the tables beside them carry the same numbers for anyone who can't use the hover. */

import { useState, type ReactNode } from "react";
import { compact, money } from "../model/format";
import { MONTHS, MONTHS_LONG, type Book } from "../model/ledger";
import type { Metric } from "../model/types";
import { Delta, Swatch } from "./bits";
import { colorOf } from "../model/theme";

const W = 720, L = 50, R = 8, T = 14, B = 26;

function scale(lo: number, hi: number) {
  lo = Math.min(0, lo);
  hi = Math.max(0, hi);
  if (hi === lo) hi = lo + 1;
  const raw = (hi - lo) / 4, p = Math.pow(10, Math.floor(Math.log10(raw))), n = raw / p;
  const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(v);
  return { lo, hi, ticks };
}

function topRounded(x: number, y: number, w: number, h: number, r: number) {
  r = Math.min(r, h, w / 2);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

function Frame({ H, sc, ys, children, tips, label }: { H: number; sc: ReturnType<typeof scale>; ys: (v: number) => number; children: ReactNode; tips: ReactNode[]; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const ph = H - T - B, band = (W - L - R) / 12;
  return (
    <div className="chart-wrap" onMouseLeave={() => setHover(null)}>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        {sc.ticks.map((v) => (
          <g key={v}>
            <line className={v === 0 ? "base" : "grid"} x1={L} x2={W - R} y1={ys(v)} y2={ys(v)} />
            <text x={L - 8} y={ys(v) + 4} textAnchor="end">{compact(v)}</text>
          </g>
        ))}
        {MONTHS.map((mn, i) => <text key={mn} x={L + i * band + band / 2} y={H - 8} textAnchor="middle">{mn}</text>)}
        {MONTHS.map((_, i) => (
          <rect key={`h${i}`} className={`hit${hover === i ? " on" : ""}`} x={L + i * band} y={T} width={band} height={ph} onMouseEnter={() => setHover(i)} />
        ))}
        <g pointerEvents="none">{children}</g>
      </svg>
      {hover != null && (
        <div className="tip" style={{ left: `${((L + (hover + (hover < 7 ? 1 : 0)) * band) / W) * 100}%`, top: 8, transform: hover < 7 ? "translateX(8px)" : "translateX(calc(-100% - 8px))" }}>
          {tips[hover]}
        </div>
      )}
    </div>
  );
}

export function YearChart({ book, y }: { book: Book; y: number }) {
  const H = 270, ph = H - T - B, band = (W - L - R) / 12, bw = Math.min(34, band * 0.56);
  const groups = book.outGroups();
  const data = MONTHS.map((_, i) => book.monthTotals(y, i + 1));
  const sc = scale(0, Math.max(1, ...data.map((t) => Math.max(t.income, t.saved + t.spent))));
  const ys = (v: number) => T + ph - ((v - sc.lo) / (sc.hi - sc.lo)) * ph;
  const bars: ReactNode[] = [];
  data.forEach((t, i) => {
    const x = L + i * band + (band - bw) / 2;
    let acc = 0;
    const segs = groups.map((g) => ({ g, v: t.byGroup[g.id] || 0 })).filter((d) => d.v > 0);
    segs.forEach((d, k) => {
      const y1 = ys(acc + d.v), y0 = ys(acc);
      acc += d.v;
      const h = Math.max(0, y0 - y1 - (k > 0 ? 2 : 0)); // 2px gap between stacked segments
      if (h <= 0) return;
      const fill = colorOf(d.g);
      bars.push(k === segs.length - 1
        ? <path key={`${i}${k}`} d={topRounded(x, y1, bw, h, 4)} fill={fill} />
        : <rect key={`${i}${k}`} x={x} y={y1} width={bw} height={h} fill={fill} />);
    });
  });
  const pts = data.map((t, i) => (t.has ? ([L + i * band + band / 2, ys(t.income)] as const) : null));
  const d = pts.map((p, i) => (p ? `${i && pts[i - 1] ? "L" : "M"}${p[0]},${p[1]}` : "")).join("");
  const tips = data.map((t, i) => (
    <>
      <b>{MONTHS_LONG[i]} {y}</b>
      {t.has ? (
        <>
          <div className="tr"><span><span className="ln" style={{ display: "inline-block", width: 12, height: 2, background: "var(--s0)" }} />Income</span><span className="num">{money(t.income)}</span></div>
          {[...groups].reverse().map((g) => (
            <div className="tr" key={g.id}><span><Swatch g={g} />{g.name}</span><span className="num">{money(t.byGroup[g.id] || 0)}</span></div>
          ))}
          <div className="tr total"><span>Left over</span><span className="num">{money(t.left)}</span></div>
        </>
      ) : <span className="muted">No figures yet</span>}
    </>
  ));
  return (
    <Frame H={H} sc={sc} ys={ys} tips={tips} label={`Monthly income and outflows for ${y}`}>
      {bars}
      <path d={d} fill="none" stroke="var(--s0)" strokeWidth={2} strokeLinejoin="round" />
      {pts.map((p, i) => p && <circle key={i} cx={p[0]} cy={p[1]} r={4} fill="var(--s0)" stroke="var(--surface)" strokeWidth={2} />)}
    </Frame>
  );
}

export function CompareChart({ book, a, b, metric }: { book: Book; a: number; b: number; metric: Metric }) {
  const H = 250, ph = H - T - B, band = (W - L - R) / 12;
  const va = MONTHS.map((_, i) => book.metric(a, i + 1, metric));
  const vb = MONTHS.map((_, i) => book.metric(b, i + 1, metric));
  const all = [...va, ...vb].filter((v): v is number => v != null);
  const sc = scale(Math.min(0, ...all), Math.max(1, ...all));
  const ys = (v: number) => T + ph - ((v - sc.lo) / (sc.hi - sc.lo)) * ph;
  const cx = (i: number) => L + i * band + band / 2;
  const line = (vals: (number | null)[], col: string, key: string) => {
    const d = vals.map((v, i) => (v == null ? "" : `${i && vals[i - 1] != null ? "L" : "M"}${cx(i)},${ys(v)}`)).join("");
    return (
      <g key={key}>
        <path d={d} fill="none" stroke={col} strokeWidth={2} strokeLinejoin="round" />
        {vals.map((v, i) => v != null && <circle key={i} cx={cx(i)} cy={ys(v)} r={4} fill={col} stroke="var(--surface)" strokeWidth={2} />)}
      </g>
    );
  };
  const label = book.metricLabel(metric);
  const tips = MONTHS.map((_, i) => (
    <>
      <b>{MONTHS_LONG[i]} · {label}</b>
      <div className="tr"><span><span className="sw" style={{ background: "var(--cmp-a)" }} />{a}</span><span className="num">{money(va[i])}</span></div>
      <div className="tr"><span><span className="sw" style={{ background: "var(--cmp-b)" }} />{b}</span><span className="num">{money(vb[i])}</span></div>
      <div className="tr total"><Delta cur={va[i]} prev={vb[i]} upGood={book.upIsGood(metric)} label={String(b)} /></div>
    </>
  ));
  return (
    <Frame H={H} sc={sc} ys={ys} tips={tips} label={`${label}, ${a} against ${b}`}>
      {line(vb, "var(--cmp-b)", "b")}
      {line(va, "var(--cmp-a)", "a")}
    </Frame>
  );
}
