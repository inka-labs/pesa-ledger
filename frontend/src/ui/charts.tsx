/** The charts, hand-drawn in SVG (or HTML where bars are simpler): where each month's money went
 *  (stacked outflows, income as a line, budget ticks, one-offs hatched), where the year's income went,
 *  one measure across two years (month by month or as a running total, with the gap underneath), and
 *  which categories moved most. Each has a hover tooltip or labels; the tables carry the same numbers. */

import { useId, useState, type ReactNode } from "react";
import { compact, money, pct } from "../model/format";
import { MONTHS, MONTHS_LONG, type Book } from "../model/ledger";
import type { Metric, Totals } from "../model/types";
import { Delta, Swatch } from "./bits";
import { colorOf } from "../model/theme";

const W = 720, L = 50, R = 8, T = 14, B = 26;
const band = (W - L - R) / 12;
const cx = (i: number) => L + i * band + band / 2;

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

/** Diagonal stripes in the surface colour, laid over the one-off part of a bar. */
function Hatch({ id }: { id: string }) {
  return (
    <defs>
      <pattern id={id} patternUnits="userSpaceOnUse" width={6} height={6} patternTransform="rotate(45)">
        <rect width={2.2} height={6} style={{ fill: "var(--surface)" }} opacity={0.7} />
      </pattern>
    </defs>
  );
}

/** A legend swatch for one-offs: a hatched square. */
export function HatchSwatch() {
  return <span className="sw hatch" aria-hidden />;
}

function Frame({ H, sc, ys, children, tips, label, defs }: { H: number; sc: ReturnType<typeof scale>; ys: (v: number) => number; children: ReactNode; tips: ReactNode[]; label: string; defs?: ReactNode }) {
  const [hover, setHover] = useState<number | null>(null);
  const ph = H - T - B;
  return (
    <div className="chart-wrap" onMouseLeave={() => setHover(null)}>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        {defs}
        {sc.ticks.map((v) => (
          <g key={v}>
            <line className={v === 0 ? "base" : "grid"} x1={L} x2={W - R} y1={ys(v)} y2={ys(v)} />
            <text x={L - 8} y={ys(v) + 4} textAnchor="end">{compact(v)}</text>
          </g>
        ))}
        {MONTHS.map((mn, i) => <text key={mn} x={cx(i)} y={H - 8} textAnchor="middle">{mn}</text>)}
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

const Row = ({ k, v, sw }: { k: ReactNode; v: ReactNode; sw?: ReactNode }) => (
  <div className="tr"><span>{sw}{k}</span><span className="num">{v}</span></div>
);

export function YearChart({ book, y }: { book: Book; y: number }) {
  const hatch = useId().replace(/:/g, "");
  const H = 270, ph = H - T - B, bw = Math.min(34, band * 0.56);
  const groups = book.outGroups();
  const data = MONTHS.map((_, i) => book.monthTotals(y, i + 1));
  const plans = MONTHS.map((_, i) => book.planRange(y, i + 1, i + 1));
  // one-offs are hatched only when they're in the figures (a book that leaves them out has none to show)
  const showOneOffs = !book.regularOnly;
  const sc = scale(0, Math.max(1, ...data.map((t) => Math.max(t.income, t.saved + t.spent)), ...plans.map((p) => (p.has ? p.saved + p.spent : 0))));
  const ys = (v: number) => T + ph - ((v - sc.lo) / (sc.hi - sc.lo)) * ph;
  const bars: ReactNode[] = [];
  data.forEach((t, i) => {
    const x = L + i * band + (band - bw) / 2;
    let acc = 0;
    const segs = groups.map((g) => ({ g, v: t.byGroup[g.id] || 0, o: showOneOffs ? t.oneOff.byGroup[g.id] || 0 : 0 })).filter((d) => d.v > 0);
    segs.forEach((d, k) => {
      const y1 = ys(acc + d.v), y0 = ys(acc);
      acc += d.v;
      const h = Math.max(0, y0 - y1 - (k > 0 ? 2 : 0)); // 2px gap between stacked segments
      if (h <= 0) return;
      const top = k === segs.length - 1;
      const shape = (fill: string, key: string) => top
        ? <path key={key} d={topRounded(x, y1, bw, h, 4)} fill={fill} />
        : <rect key={key} x={x} y={y1} width={bw} height={h} fill={fill} />;
      bars.push(shape(colorOf(d.g), `${i}-${k}`));
      if (d.o > 0) {
        // the one-off part sits at the top of its segment
        const oh = Math.min(h, (Math.min(d.o, d.v) / d.v) * h);
        bars.push(
          <g key={`${i}-${k}-o`}>
            <clipPath id={`${hatch}-c${i}-${k}`}><rect x={x} y={y1} width={bw} height={oh} /></clipPath>
            <g clipPath={`url(#${hatch}-c${i}-${k})`}>{shape(`url(#${hatch})`, "p")}</g>
          </g>,
        );
      }
    });
    const p = plans[i];
    if (p.has && p.saved + p.spent > 0) {
      const py = ys(p.saved + p.spent);
      bars.push(<line key={`b${i}`} className="budget-tick" x1={x - 5} x2={x + bw + 5} y1={py} y2={py} />);
    }
  });
  const pts = data.map((t, i) => (t.has ? ([cx(i), ys(t.income)] as const) : null));
  const d = pts.map((p, i) => (p ? `${i && pts[i - 1] ? "L" : "M"}${p[0]},${p[1]}` : "")).join("");
  const tips = data.map((t, i) => (
    <>
      <b>{MONTHS_LONG[i]} {y}</b>
      {t.has ? (
        <>
          <Row sw={<span className="ln" style={{ display: "inline-block", width: 12, height: 2, background: "var(--s0)" }} />} k="Income" v={money(t.income)} />
          {[...groups].reverse().map((g) => <Row key={g.id} sw={<Swatch g={g} />} k={g.name} v={money(t.byGroup[g.id] || 0)} />)}
          {plans[i].has && <Row k="Budget (saved + spent)" v={money(plans[i].saved + plans[i].spent)} />}
          {showOneOffs && t.oneOff.any && <Row sw={<HatchSwatch />} k="of which one-off" v={money(t.oneOff.saved + t.oneOff.spent)} />}
          <div className="tr total"><span>Left over</span><span className="num">{money(t.left)}</span></div>
        </>
      ) : plans[i].has ? <Row k="Budget (saved + spent)" v={money(plans[i].saved + plans[i].spent)} /> : <span className="muted">No figures yet</span>}
    </>
  ));
  return (
    <Frame H={H} sc={sc} ys={ys} tips={tips} label={`Monthly income and outflows for ${y}`} defs={<Hatch id={hatch} />}>
      {bars}
      <path d={d} fill="none" stroke="var(--s0)" strokeWidth={2} strokeLinejoin="round" />
      {pts.map((p, i) => p && <circle key={i} cx={p[0]} cy={p[1]} r={4} fill="var(--s0)" stroke="var(--surface)" strokeWidth={2} />)}
    </Frame>
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

export function CompareChart({ book, a, b, metric, mode = "month" }: { book: Book; a: number; b: number; metric: Metric; mode?: "month" | "running" }) {
  const H = 250, ph = H - T - B;
  const rawA = MONTHS.map((_, i) => book.metric(a, i + 1, metric));
  const rawB = MONTHS.map((_, i) => book.metric(b, i + 1, metric));
  const va = mode === "running" ? running(rawA) : rawA;
  const vb = mode === "running" ? running(rawB) : rawB;
  const ooA = book.regularOnly ? [] : MONTHS.map((_, i) => book.metricOneOff(a, i + 1, metric));
  const ooB = book.regularOnly ? [] : MONTHS.map((_, i) => book.metricOneOff(b, i + 1, metric));
  const all = [...va, ...vb].filter((v): v is number => v != null);
  const sc = scale(Math.min(0, ...all), Math.max(1, ...all));
  const ys = (v: number) => T + ph - ((v - sc.lo) / (sc.hi - sc.lo)) * ph;
  const lastOf = (vals: (number | null)[]) => { for (let i = 11; i >= 0; i--) if (vals[i] != null) return i; return -1; };
  // each line is named above its last point; when both end in the same month, the higher name moves up clear of the other
  const la = lastOf(va), lb = lastOf(vb);
  const labelY = { a: la >= 0 ? ys(va[la]!) - 12 : 0, b: lb >= 0 ? ys(vb[lb]!) - 12 : 0 };
  if (la === lb && la >= 0 && Math.abs(labelY.a - labelY.b) < 16) {
    if (labelY.a <= labelY.b) labelY.a = labelY.b - 16; else labelY.b = labelY.a - 16;
  }
  const line = (vals: (number | null)[], oo: number[], col: string, key: "a" | "b", name: string) => {
    const d = vals.map((v, i) => (v == null ? "" : `${i && vals[i - 1] != null ? "L" : "M"}${cx(i)},${ys(v)}`)).join("");
    const li = key === "a" ? la : lb;
    return (
      <g key={key}>
        <path d={d} fill="none" stroke={col} strokeWidth={2} strokeLinejoin="round" />
        {vals.map((v, i) => v != null && (
          <g key={i}>
            {oo[i] ? <circle cx={cx(i)} cy={ys(v)} r={8} fill="none" stroke={col} strokeWidth={1.5} strokeDasharray="2 2" /> : null}
            <circle cx={cx(i)} cy={ys(v)} r={4} fill={col} stroke="var(--surface)" strokeWidth={2} />
          </g>
        ))}
        {li >= 0 && <text className="endlabel" x={cx(li)} y={labelY[key]} textAnchor={li > 10 ? "end" : "middle"}>{name}</text>}
      </g>
    );
  };
  const label = book.metricLabel(metric);
  const tips = MONTHS.map((_, i) => (
    <>
      <b>{MONTHS_LONG[i]} · {label}{mode === "running" ? " so far" : ""}</b>
      <Row sw={<span className="sw" style={{ background: "var(--cmp-a)" }} />} k={a} v={money(va[i])} />
      {ooA[i] ? <Row k={<span className="muted">incl. one-off</span>} v={money(ooA[i])} /> : null}
      <Row sw={<span className="sw" style={{ background: "var(--cmp-b)" }} />} k={b} v={money(vb[i])} />
      {ooB[i] ? <Row k={<span className="muted">incl. one-off</span>} v={money(ooB[i])} /> : null}
      <div className="tr total"><Delta cur={va[i]} prev={vb[i]} upGood={book.upIsGood(metric)} label={String(b)} /></div>
    </>
  ));
  return (
    <>
      <Frame H={H} sc={sc} ys={ys} tips={tips} label={`${label}${mode === "running" ? ", running total," : ""} ${a} against ${b}`}>
        {line(vb, ooB, "var(--cmp-b)", "b", String(b))}
        {line(va, ooA, "var(--cmp-a)", "a", String(a))}
      </Frame>
      <GapStrip book={book} a={a} b={b} metric={metric} va={va} vb={vb} />
    </>
  );
}

/** The gap between the two years for each month, as bars from zero: green when it's good news. */
function GapStrip({ book, a, b, metric, va, vb }: { book: Book; a: number; b: number; metric: Metric; va: (number | null)[]; vb: (number | null)[] }) {
  const gaps = MONTHS.map((_, i) => (va[i] != null && vb[i] != null ? va[i]! - vb[i]! : null));
  const vals = gaps.filter((g): g is number => g != null);
  if (!vals.length) return null;
  const H = 86, top = 8, bot = 8, ph = H - top - bot;
  const max = Math.max(1, ...vals.map(Math.abs));
  const zero = top + ph / 2;
  const up = book.upIsGood(metric);
  const bw = Math.min(26, band * 0.5);
  return (
    <div className="gap-strip">
      <span className="lbl">{a} minus {b}</span>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Difference between ${a} and ${b} each month`}>
        <line className="base" x1={L} x2={W - R} y1={zero} y2={zero} />
        <text x={L - 8} y={top + 8} textAnchor="end">+{compact(max)}</text>
        <text x={L - 8} y={H - bot} textAnchor="end">−{compact(max)}</text>
        {gaps.map((g, i) => {
          if (g == null || g === 0) return null;
          const h = (Math.abs(g) / max) * (ph / 2);
          const good = g > 0 === up;
          const x = cx(i) - bw / 2;
          return (
            <g key={i}>
              <title>{`${MONTHS_LONG[i]}: ${g > 0 ? "+" : "−"}${money(Math.abs(g))}`}</title>
              <rect x={x} y={g > 0 ? zero - h : zero} width={bw} height={Math.max(1, h)} rx={2} className={good ? "gap-good" : "gap-bad"} />
            </g>
          );
        })}
      </svg>
    </div>
  );
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
