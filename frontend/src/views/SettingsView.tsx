import { useEffect, useState } from "react";
import { api, type Backup, type Stored, type Version } from "../api";
import { useApp } from "../context";
import { buildCSV, importSummary } from "../model/csv";
import { parseAmount } from "../model/format";
import { currentMonth, cycleLabel } from "../model/ledger";
import { rateFor } from "../model/money";
import type { OtherCurrency } from "../model/types";
import { CurrencySelect, currencyName } from "../ui/CurrencySelect";
import { downloadCSV } from "../ui/download";
import { TextInput } from "../ui/bits";
import { ImportButton } from "./Welcome";


function when(b: Backup) {
  const d = b.taken ? new Date(b.taken) : null;
  const label = { auto: "Daily", manual: "Saved by you", before: "Before a restore" }[b.kind] ?? b.kind;
  return `${label} · ${d ? d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : b.name}`;
}

function CurrencyPanel() {
  const { book, change, rates, ratesError, refreshRates } = useApp();
  const st = book.settings;
  const [busy, setBusy] = useState(false);
  const [switchTo, setSwitchTo] = useState<string | null>(null);
  const [adding, setAdding] = useState("");
  const settings = (fn: (s: typeof st) => void) => change((l) => { fn(l.settings); l.settings.alt = null; }, ["settings"]);
  const alts = st.alts ?? [];
  const updated = rates?.fetched_at ? new Date(rates.fetched_at * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "";
  const edit = (i: number, patch: Partial<OtherCurrency>) => settings((s) => { const list = [...(s.alts ?? [])]; list[i] = { ...list[i], ...patch }; s.alts = list; });
  const move = (i: number, d: -1 | 1) => settings((s) => { const list = [...(s.alts ?? [])]; [list[i], list[i + d]] = [list[i + d], list[i]]; s.alts = list; });
  return (
    <div className="panel">
      <h3>Currency</h3>
      <div className="field">
        <span className="lbl">Main currency</span>
        <CurrencySelect value={st.currency} label="Main currency" onChange={(c) => c !== st.currency && setSwitchTo(c)} />
        {switchTo && (
          <div className="notice">
            Your figures are kept as you entered them, not converted: switching to <b>{switchTo}</b> relabels every amount as {currencyName(switchTo)}.
            <div className="bar" style={{ marginTop: 8 }}>
              <button className="btn primary" onClick={() => { settings((s) => { s.currency = switchTo; s.alts = (s.alts ?? []).filter((a) => a.code.toUpperCase() !== switchTo); }); setSwitchTo(null); }}>Switch to {switchTo}</button>
              <button className="btn ghost" onClick={() => setSwitchTo(null)}>Keep {st.currency}</button>
            </div>
          </div>
        )}
      </div>

      <div className="field">
        <span className="lbl">Also show amounts in</span>
        {alts.length === 0 && <span className="small muted">Add a currency to see totals in it too, like ≈ USD 2,080 under each figure.</span>}
        <div className="cur-list">
          {alts.map((a, i) => {
            const live = a.auto !== false;
            const liveRate = rates?.rates[a.code.toUpperCase()] ? 1 / rates.rates[a.code.toUpperCase()] : null;
            const rate = rateFor(a, rates);
            return (
              <div key={a.code + i} className="cur-row">
                <span className="cur-name"><b>{a.code.toUpperCase()}</b> <span className="muted small">{currencyName(a.code)}</span>{i === 0 && <span className="chip">First</span>}</span>
                <span className="cur-rate">
                  {live
                    ? rate ? <>1 {a.code.toUpperCase()} = <b className="num">{rate.toFixed(rate < 1 ? 4 : 2)}</b> {st.currency}</> : <span className="muted small">{ratesError ? "No live rate" : "Loading the rate…"}</span>
                    : <>
                        <TextInput value={a.rate ? String(a.rate) : ""} label={`${st.currency} per 1 ${a.code}`} style={{ width: 96 }}
                          onCommit={(v) => { const r = parseAmount(v); if (!r || Number.isNaN(r) || r <= 0) return false; edit(i, { rate: r }); }} />
                        <span className="small muted">{st.currency} per 1{liveRate ? ` · live ${liveRate.toFixed(2)}` : ""}</span>
                      </>}
                </span>
                <label className="small bar"><input type="checkbox" checked={!live}
                  onChange={(e) => edit(i, { auto: !e.target.checked, rate: a.rate ?? (liveRate ? Math.round(liveRate * 100) / 100 : null) })} /> My own rate</label>
                <span className="moves">
                  <button className="iconbtn" aria-label={`Move ${a.code} up`} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                  <button className="iconbtn" aria-label={`Move ${a.code} down`} disabled={i === alts.length - 1} onClick={() => move(i, 1)}>↓</button>
                  <button className="iconbtn" aria-label={`Stop showing ${a.code}`} onClick={() => settings((s) => { s.alts = (s.alts ?? []).filter((_, j) => j !== i); })}>✕</button>
                </span>
              </div>
            );
          })}
        </div>
        {alts.length < 6 && (
          <div className="bar">
            <CurrencySelect value={adding} label="Add a currency" placeholder="Add a currency…" exclude={[st.currency, ...alts.map((a) => a.code)]}
              onChange={(c) => { settings((s) => { s.alts = [...(s.alts ?? []), { code: c, auto: true }]; }); setAdding(""); }} />
          </div>
        )}
      </div>

      <div className="bar">
        <button className="btn ghost" disabled={busy} onClick={() => { setBusy(true); refreshRates().finally(() => setBusy(false)); }}>{busy ? "Checking…" : "Check rates now"}</button>
        {rates?.source && <span className="small muted">Live rates from <a href={rates.source_url || "#"} target="_blank" rel="noreferrer">{rates.source}</a>{rates.date && `, published ${rates.date}`}. Checked {updated}.</span>}
      </div>
      {ratesError && <span className="small d-bad">{ratesError}</span>}
      <p className="small muted">
        Figures show in the first three under each total; hover to see the rest. In any amount box you can type another currency, like
        {" "}<code>USD 415</code>, <code>€200</code> or <code>415 eur</code>, and it's converted to {st.currency} at the live rate. Only currency
        codes are sent to the rate service, never your figures.
      </p>
    </div>
  );
}

/** Whether pay arrives at the end of a month and pays for the next one. Nothing is moved: it changes
 *  how months are labelled, which month is "now", and when a fund's bill is paid from. */
function PayPanel() {
  const { book, change, notify } = useApp();
  const pc = book.settings.paycycle;
  const set = (v: { payday: number } | null) => change((l) => { l.settings.paycycle = v; }, ["settings"]);
  const now = currentMonth(book.settings), example = cycleLabel({ paycycle: pc ?? { payday: 28 } }, now);
  return (
    <div className="panel">
      <h3>When you're paid</h3>
      <label className="bar small">
        <input type="checkbox" checked={!!pc} onChange={(e) => { set(e.target.checked ? { payday: 28 } : null); notify(e.target.checked ? "Months now read as pay cycles." : "Months now read as calendar months.", true); }} />
        My pay arrives at the end of the month and pays for the next one
      </label>
      {pc && (
        <label className="field">
          <span className="lbl">Payday</span>
          <span className="bar small">
            <select value={pc.payday} aria-label="Payday" onChange={(e) => set({ payday: Number(e.target.value) })}>
              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d === 31 ? "Last day" : `The ${ordinal(d)}`}</option>)}
            </select>
            <span className="muted">of each month</span>
          </span>
        </label>
      )}
      <p className="small muted">
        {pc
          ? <>Each month holds that month's pay and the spending it paid for in the next: <b>{example}</b>. Until payday the app opens on last month's pay. A fund's bill is paid from the month before it's due. Your figures stay where they are.</>
          : <>Turn this on if, say, September's salary is what you live on in October and you record October's spending under September. Your figures stay where they are; only how months are read changes.</>}
      </p>
    </div>
  );
}

const ordinal = (d: number) => d + (d % 10 === 1 && d !== 11 ? "st" : d % 10 === 2 && d !== 12 ? "nd" : d % 10 === 3 && d !== 13 ? "rd" : "th");

export function SettingsView({ version, onRestored }: { version: Version | null; onRestored: (s: Stored) => void }) {
  const { book, change, replace, notify } = useApp();
  const st = book.settings;
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);
  const [backups, setBackups] = useState<Backup[] | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [autostart, setAutostart] = useState(version?.autostart.enabled ?? false);
  const [stopped, setStopped] = useState(false);

  const loadBackups = () => api.backups().then((r) => setBackups(r.backups)).catch(() => setBackups([]));
  useEffect(() => { loadBackups(); }, []);
  const fail = (e: unknown) => setMsg({ err: true, text: (e as Error).message });

  if (stopped) return <div className="center"><h2>Pesa Ledger has stopped</h2><p className="muted">Start it again with <code>pixi run open</code>.</p></div>;

  return (
    <>
      <div className="panel-h"><h2>Settings</h2><span className="muted">Currency, your data and the app</span></div>
      {msg && <div className={`notice${msg.err ? " err" : ""}`} role={msg.err ? "alert" : undefined}>{msg.text}</div>}
      <div className="cols">
        <div className="stack">
          <CurrencyPanel />
          <PayPanel />

          <div className="panel">
            <h3>Import and export</h3>
            <p className="small muted">
              CSV columns: <code>year, month, group, category, amount, note</code>. For actual figures, put a month number or name in
              the month column. For budgets, put <code>plan</code> for a yearly figure or <code>plan-3</code> for one month's budget.
              A row with no category adds its note to that month.
            </p>
            <div className="bar">
              <ImportButton className="btn" current={book.ledger} onDone={(r) => { replace(r.ledger); setMsg({ text: importSummary(r) }); }} onError={(text) => setMsg({ err: true, text })}>
                Import CSV
              </ImportButton>
              <button className="btn" onClick={() => downloadCSV(buildCSV(book.ledger))}>Export CSV</button>
            </div>
          </div>

          <div className="panel">
            <h3>Start over</h3>
            {st.example && (
              <div className="bar"><span className="small">You're using example figures.</span>
                <button className="btn" onClick={() => { change((l) => { l.years = {}; l.settings.goals = []; l.settings.example = false; }, ["settings", ...Object.keys(book.ledger.years).map((y) => `y:${y}`)]); notify("Example figures cleared.", true); }}>Clear example figures</button></div>
            )}
            <div className="bar">
              {confirm === "wipe" ? (
                <>
                  <span className="small">Delete every figure, budget and note? Categories and goals stay. Today's backup still has them.</span>
                  <button className="btn danger" onClick={() => { replace({ ...book.ledger, years: {} }); setConfirm(null); notify("Every figure, budget and note was deleted.", true); }}>Delete all figures</button>
                  <button className="btn ghost" onClick={() => setConfirm(null)}>Keep them</button>
                </>
              ) : <button className="btn ghost danger" onClick={() => setConfirm("wipe")}>Delete all figures…</button>}
            </div>
          </div>
        </div>

        <div className="stack">
          <div className="panel">
            <div className="panel-h"><h3>Backups</h3>
              <div className="end"><button className="btn" onClick={() => api.backupNow().then(() => { setMsg({ text: "Backup saved." }); loadBackups(); }).catch(fail)}>Back up now</button></div></div>
            <p className="small muted">Before the first change each day, the whole ledger is copied to a backup. The last 60 days are kept.</p>
            <div className="blist">
              {backups === null ? <span className="muted small">Loading…</span>
                : !backups.length ? <span className="muted small">No backups yet. The first one is made with tomorrow's first change, or now with Back up now.</span>
                : backups.map((b) => (
                  <div className="bline" key={b.name}>
                    <span className="when">{when(b)}<br /><span className="muted small">{b.years.length ? b.years.join(", ") : "No figures"}</span></span>
                    {confirm === b.name ? (
                      <>
                        <button className="btn danger" onClick={() => api.restore(b.name).then((s) => { onRestored(s); setConfirm(null); setMsg({ text: "Restored. What it replaced was backed up first." }); loadBackups(); }).catch(fail)}>Restore this</button>
                        <button className="btn ghost" onClick={() => setConfirm(null)}>Cancel</button>
                      </>
                    ) : <button className="btn ghost" onClick={() => setConfirm(b.name)}>Restore…</button>}
                  </div>
                ))}
            </div>
          </div>

          <div className="panel">
            <h3>This computer</h3>
            <p className="small muted">Your figures stay on this computer, in <code>{version?.home ?? "~/.pesa-ledger"}</code>. Nothing is sent anywhere.</p>
            <div className="bar">
              <button className="btn" onClick={() => api.reveal().catch(fail)}>Show data folder</button>
              {version?.autostart.supported && (
                <label className="bar small">
                  <input type="checkbox" checked={autostart} onChange={(e) => {
                    const on = e.target.checked;
                    api.setAutostart(on).then((r) => { setAutostart(r.enabled); setMsg({ text: r.message }); }).catch(fail);
                  }} /> Start Pesa Ledger when I log in
                </label>
              )}
            </div>
            <div className="bar">
              <button className="btn ghost" onClick={() => api.quit().then(() => setStopped(true)).catch(fail)}>Quit Pesa Ledger</button>
              {version && <span className="small muted">Version {version.version}</span>}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
