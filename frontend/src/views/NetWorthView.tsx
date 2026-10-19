/** Net worth: what you own minus what you owe, month by month. Record each account's balance at the end of
 *  a month (it carries forward until the next one). Accounts linked to categories split their change into
 *  what you put in and what it earned (interest, returns), or for a debt, what it cost. */

import { useCallback, useMemo, useState } from "react";
import type { Data } from "plotly.js";
import { useApp } from "../context";
import { setBalance } from "../model/edit";
import { money } from "../model/format";
import { addMonths, fmtYM, MONTHS_LONG, nextYM, prevYM } from "../model/ledger";
import type { Account, Ledger, YM } from "../model/types";
import { newId } from "../model/csv";
import { AmountInput, Delta, EmptyState, Kpi, Alt } from "../ui/bits";
import { Landmark } from "lucide-react";
import { baseLayout, chartTheme, Plot, useThemeTick } from "../ui/Plot";
import { Sheet } from "../ui/Sheet";

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

export function NetWorthView() {
  const { book, change } = useApp();
  const [ym, setYm] = useState<YM>(book.today);
  const [editing, setEditing] = useState<string | null>(null);
  const close = useCallback(() => setEditing(null), []);
  const accounts = book.accounts();
  const nw = book.netWorth(ym);
  const prev = book.netWorth(prevYM(ym));
  const yearAgo = book.netWorth(addMonths(ym, -12));
  const earned = accounts.filter((a) => !a.debt).reduce((s, a) => s + (book.growth(ym.y, ym.m, a.id) ?? 0), 0);

  return (
    <>
      <div className="panel-h">
        <div className="monthnav">
          <button className="btn" aria-label="Previous month" onClick={() => setYm(prevYM(ym))}>‹</button>
          <h2>{MONTHS_LONG[ym.m - 1]} {ym.y}</h2>
          <button className="btn" aria-label="Next month" onClick={() => setYm(nextYM(ym))}>›</button>
        </div>
        <span className="muted">What you own minus what you owe, at the end of the month</span>
        <div className="end">
          {(ym.y !== book.today.y || ym.m !== book.today.m) && <button className="btn ghost" onClick={() => setYm(book.today)}>This month</button>}
          <button className="btn primary" onClick={() => setEditing("new")}>Add account</button>
        </div>
      </div>

      {!accounts.length ? (
        <EmptyState icon={Landmark} title="See everything you own and owe in one place" action={<button className="btn primary" onClick={() => setEditing("new")}>Add your first account</button>}>
          Add where your money sits (bank, M-Pesa, money market fund, pension, the car) and anything you owe. Record their balances once a month to watch your net worth grow, and see what your MMF earns.
        </EmptyState>
      ) : (
        <>
          <div className="kpis">
            <Kpi label="Net worth" value={nw?.total ?? 0} lead>
              <Delta cur={nw?.total ?? null} prev={prev?.total ?? null} upGood label={fmtYM(prevYM(ym))} />
              <Delta cur={nw?.total ?? null} prev={yearAgo?.total ?? null} upGood label="a year before" />
              <Alt v={nw?.total ?? 0} />
            </Kpi>
            <Kpi label="Own" value={nw?.assets ?? 0}><span>{plural(accounts.filter((a) => !a.debt).length, "account")}</span></Kpi>
            <Kpi label="Owe" value={nw?.debts ?? 0}><span>{plural(accounts.filter((a) => a.debt).length, "debt")}</span></Kpi>
            <Kpi label="Earned this month" value={earned}><span>Growth beyond what you put in</span></Kpi>
          </div>

          <div className="panel">
            <div className="panel-h"><h3>Balances at the end of {MONTHS_LONG[ym.m - 1]}</h3><span className="muted small">Blank boxes carry the last balance forward (shown faded)</span></div>
            <div className="nw-table">
              <div className="nw-row head lbl"><span>Account</span><span className="r">Balance</span><span className="r">Change</span><span className="r">Put in</span><span className="r">Earned</span><span /></div>
              {(["own", "owe"] as const).map((side) => {
                const list = accounts.filter((a) => (side === "owe") === !!a.debt);
                if (!list.length) return null;
                return [
                  <div key={side} className="nw-row sub lbl"><span>{side === "own" ? "What you own" : "What you owe"}</span></div>,
                  ...list.map((a) => <AccountRow key={a.id} a={a} ym={ym} onEdit={() => setEditing(a.id)} />),
                ];
              })}
            </div>
          </div>

          <div className="panel">
            <div className="panel-h"><h3>Net worth over time</h3><span className="muted small">Each month at its latest balances</span></div>
            <NetWorthChart />
          </div>
        </>
      )}
      {editing && <AccountForm id={editing === "new" ? null : editing} onClose={close} onDelete={(id) => change((l: Ledger) => {
        l.settings.accounts = (l.settings.accounts ?? []).filter((x) => x.id !== id);
        for (const yd of Object.values(l.years)) for (const row of Object.values(yd.balances ?? {})) delete row[id];
        if (l.settings.health?.ef === `a:${id}`) l.settings.health.ef = null;
      }, ["settings", ...Object.keys(book.ledger.years).map((y) => `y:${y}`)])} />}
    </>
  );
}

function AccountRow({ a, ym, onEdit }: { a: Account; ym: YM; onEdit: () => void }) {
  const { book, change } = useApp();
  const own = book.balance(ym.y, ym.m, a.id);
  const carried = own == null ? book.balanceAsOf(ym, a.id) : null;
  const p = prevYM(ym);
  const before = book.balanceAsOf(p, a.id)?.value ?? null;
  const now = own ?? carried?.value ?? null;
  const put = a.cats.length ? a.cats.reduce((s, cid) => s + (book.actual(ym.y, ym.m, cid) ?? 0), 0) : null;
  const growth = book.growth(ym.y, ym.m, a.id);
  return (
    <div className="nw-row">
      <span className="nw-name">{a.name}{a.cats.length > 0 && <small className="muted">Linked to {a.cats.map((c) => book.cats[c]?.name).filter(Boolean).join(", ")}</small>}</span>
      <AmountInput value={own} placeholder={carried ? money(carried.value) : "–"} label={`${a.name} balance at the end of ${MONTHS_LONG[ym.m - 1]}`}
        title={carried ? `Carried from ${fmtYM(carried.ym)}` : "Balance at the end of the month"}
        onCommit={(v) => change((l) => void setBalance(l, ym.y, ym.m, a.id, v), [`y:${ym.y}`])} />
      <span className="r small" data-l="Change">{now != null && before != null ? <Delta cur={now} prev={before} upGood={!a.debt} label="last month" /> : <span className="muted">–</span>}</span>
      <span className="r num small" data-l="Put in">{put == null ? <span className="muted" title="Link categories to this account to split contributions from growth">–</span> : money(a.debt ? -put : put)}</span>
      <span data-l="Earned" className={`r num small ${growth == null ? "" : (growth > 0) !== !!a.debt ? "d-good" : growth !== 0 ? "d-bad" : ""}`}>
        {growth == null ? <span className="muted" title="Needs this month's and last month's balance">–</span> : `${growth > 0 ? "+" : growth < 0 ? "−" : ""}${money(Math.abs(growth))}`}
      </span>
      <button className="btn ghost" onClick={onEdit}>Edit</button>
    </div>
  );
}

function NetWorthChart() {
  const { book } = useApp();
  const tick = useThemeTick();
  const { data, layout, has } = useMemo(() => {
    const t = chartTheme();
    // from the first month with any balance (at most five years back) to this month
    let start: YM | null = null;
    for (let i = 60; i >= 0 && !start; i--) { const p = addMonths(book.today, -i); if (book.accounts(true).some((a) => book.balance(p.y, p.m, a.id) != null)) start = p; }
    if (!start) return { data: [], layout: {}, has: false };
    const xs: string[] = [], total: number[] = [], assets: number[] = [], debts: number[] = [];
    for (let p = start; !(p.y > book.today.y || (p.y === book.today.y && p.m > book.today.m)); p = nextYM(p)) {
      const n = book.netWorth(p);
      xs.push(`${p.y}-${String(p.m).padStart(2, "0")}-01`);
      total.push(n?.total ?? 0); assets.push(n?.assets ?? 0); debts.push(-(n?.debts ?? 0));
    }
    const data: Data[] = [
      { type: "bar", name: "Own", x: xs, y: assets, marker: { color: t.good, opacity: 0.35 }, hovertemplate: "Own: %{y:,.0f}<extra></extra>" },
      { type: "bar", name: "Owe", x: xs, y: debts, marker: { color: t.bad, opacity: 0.35 }, hovertemplate: "Owe: %{y:,.0f}<extra></extra>" },
      { type: "scatter", mode: "lines+markers", name: "Net worth", x: xs, y: total, line: { color: t.ink, width: 2.5 }, marker: { size: 6, color: t.ink, line: { color: t.surface, width: 2 } }, hovertemplate: "<b>Net worth: %{y:,.0f}</b><extra></extra>" },
    ];
    const base = baseLayout(t, 320);
    return { data, has: true, layout: { ...base, barmode: "relative" as const, xaxis: { ...base.xaxis, type: "date" as const, tickformat: "%b %Y", hoverformat: "%B %Y" } } };
  }, [book, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!has) return <p className="muted small">Record a balance to start the chart.</p>;
  return <Plot data={data} layout={layout} label="Net worth over time" filename="pesa-ledger-net-worth" />;
}

function AccountForm({ id, onClose, onDelete }: { id: string | null; onClose: () => void; onDelete: (id: string) => void }) {
  const { book, change, notify } = useApp();
  const a = id ? book.accounts(true).find((x) => x.id === id) : null;
  const [name, setName] = useState(a?.name ?? "");
  const [debt, setDebt] = useState(!!a?.debt);
  const [cats, setCats] = useState<string[]>(a?.cats ?? []);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState("");
  const save = () => {
    if (!name.trim()) return setError("Give the account a name.");
    change((l: Ledger) => {
      const list = (l.settings.accounts ??= []);
      const next: Account = { id: a?.id ?? newId("a"), name: name.trim(), debt, cats };
      const i = list.findIndex((x) => x.id === next.id);
      if (i >= 0) list[i] = { ...list[i], ...next }; else list.push(next);
    }, ["settings"]);
    onClose();
  };
  const toggle = (cid: string) => setCats((x) => (x.includes(cid) ? x.filter((c) => c !== cid) : [...x, cid]));
  const groups = book.settings.groups.filter((g) => book.effectOfGroup(g) !== "none" && book.catsIn(g.id).length);
  return (
    <Sheet title={a ? `Edit ${a.name}` : "Add an account"} onClose={onClose} onSubmit={save}
      footer={<>
        {error && <div className="notice err" role="alert">{error}</div>}
        <div className="bar">
          <button className="btn primary">{a ? "Save" : "Add account"}</button>
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          {a && (confirm
            ? <button type="button" className="btn danger" style={{ marginLeft: "auto" }} onClick={() => { onDelete(a.id); notify(`Removed ${a.name} and its balances.`, true); onClose(); }}>Remove it and its balances</button>
            : <button type="button" className="btn ghost danger" style={{ marginLeft: "auto" }} onClick={() => setConfirm(true)}>Remove…</button>)}
        </div>
      </>}>
      <label className="field"><span className="lbl">Name</span><input value={name} autoFocus onChange={(e) => setName(e.target.value)} placeholder="e.g. Etica MMF, Equity account, Car loan" /></label>
      <div className="field">
        <span className="lbl">It's something you</span>
        <div className="seg" role="group" aria-label="Own or owe">
          <button type="button" className={!debt ? "on" : ""} aria-pressed={!debt} onClick={() => setDebt(false)}>Own</button>
          <button type="button" className={debt ? "on" : ""} aria-pressed={debt} onClick={() => setDebt(true)}>Owe</button>
        </div>
      </div>
      <div className="field">
        <span className="lbl">{debt ? "Repayments are recorded in" : "Money put in is recorded in"} · optional</span>
        {groups.map((g) => (
          <div key={g.id} className="pick-group">
            <span className="lbl">{g.name}</span>
            <div className="pick-chips">
              {book.catsIn(g.id).map((c) => {
                const on = cats.includes(c.id);
                return <button type="button" key={c.id} className={`pick${on ? " on" : ""}`} aria-pressed={on} onClick={() => toggle(c.id)}>{on && <span aria-hidden>✓ </span>}{c.name}</button>;
              })}
            </div>
          </div>
        ))}
        <span className="small muted">Linking lets the app tell what you put in apart from what the account earned, like MMF interest.</span>
      </div>
    </Sheet>
  );
}
