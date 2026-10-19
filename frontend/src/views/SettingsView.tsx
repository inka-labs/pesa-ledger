import { useEffect, useState } from "react";
import { api, type Backup, type Stored, type Version } from "../api";
import { useApp } from "../context";
import { buildCSV, importSummary } from "../model/csv";
import { parseAmount } from "../model/format";
import { thisMonth, mk } from "../model/ledger";
import { TextInput } from "../ui/bits";
import { ImportButton } from "./Welcome";

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function when(b: Backup) {
  const d = b.taken ? new Date(b.taken) : null;
  const label = { auto: "Daily", manual: "Saved by you", before: "Before a restore" }[b.kind] ?? b.kind;
  return `${label} · ${d ? d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : b.name}`;
}

function CurrencyPanel() {
  const { book, change, rates, ratesError, refreshRates } = useApp();
  const st = book.settings;
  const [busy, setBusy] = useState(false);
  const settings = (fn: (s: typeof st) => void) => change((l) => fn(l.settings), ["settings"]);
  const code = st.alt?.code ?? "";
  const live = st.alt?.auto !== false;
  const liveRate = code && rates?.rates[code.toUpperCase()] ? 1 / rates.rates[code.toUpperCase()] : null;
  const updated = rates?.fetched_at ? new Date(rates.fetched_at * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "";
  return (
    <div className="panel">
      <h3>Currency</h3>
      <div className="form-grid">
        <label className="field"><span className="lbl">Main currency</span>
          <TextInput value={st.currency} label="Main currency"
            onCommit={(v) => /^[A-Za-z]{3}$/.test(v.trim()) && settings((s) => void (s.currency = v.trim().toUpperCase()))} /></label>
        <label className="field"><span className="lbl">Also show totals in</span>
          <TextInput value={code} label="Second currency" placeholder="USD"
            onCommit={(v) => settings((s) => void (s.alt = { ...(s.alt ?? {}), code: v.trim().toUpperCase().slice(0, 3) }))} /></label>
      </div>
      {code && (
        <div className="rate">
          <span className="lbl">Exchange rate</span>
          {live ? (
            liveRate ? (
              <>
                <span className="big">1 {code} = {liveRate.toFixed(2)} {st.currency}</span>
                <span className="small muted">
                  Live rate from{" "}
                  <a href={rates?.source_url || "#"} target="_blank" rel="noreferrer">{rates?.source}</a>
                  {rates?.date && `, published ${rates.date}`}. Checked {updated}.
                </span>
              </>
            ) : <span className="small muted">{ratesError || "Loading the live rate…"}</span>
          ) : (
            <div className="bar">
              <span className="small">{st.currency} per 1 {code}</span>
              <TextInput value={st.alt?.rate ? String(st.alt.rate) : ""} label="Exchange rate" style={{ width: 120 }}
                onCommit={(v) => { const r = parseAmount(v); if (r && !Number.isNaN(r) && r > 0) settings((s) => void (s.alt = { ...(s.alt ?? { code }), rate: r })); }} />
              {liveRate && <span className="small muted">Live rate today: {liveRate.toFixed(2)}</span>}
            </div>
          )}
          {ratesError && liveRate && <span className="small d-bad">{ratesError} Showing the last rates fetched.</span>}
        </div>
      )}
      <div className="bar">
        <label className="bar small">
          <input type="checkbox" checked={!live} onChange={(e) => settings((s) => void (s.alt = { ...(s.alt ?? { code }), auto: !e.target.checked, rate: s.alt?.rate ?? (liveRate ? Math.round(liveRate * 100) / 100 : null) }))} />
          Set the rate myself
        </label>
        <button className="btn ghost" disabled={busy} onClick={() => { setBusy(true); refreshRates().finally(() => setBusy(false)); }}>{busy ? "Checking…" : "Check rates now"}</button>
      </div>
      <p className="small muted">
        In any amount box you can type another currency, like <code>USD 415</code> or <code>$415</code>. It's converted to {st.currency} at
        the live rate. Only the currency code is sent to the rate service, never your figures.
      </p>
    </div>
  );
}

export function SettingsView({ version, onRestored }: { version: Version | null; onRestored: (s: Stored) => void }) {
  const { book, change, replace } = useApp();
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
              <button className="btn" onClick={() => { const t = thisMonth(); download(`pesa-ledger-${t.y}-${mk(t.m)}.csv`, buildCSV(book.ledger)); }}>Export CSV</button>
            </div>
          </div>

          <div className="panel">
            <h3>Start over</h3>
            {st.example && (
              <div className="bar"><span className="small">You're using example figures.</span>
                <button className="btn" onClick={() => change((l) => { l.years = {}; l.settings.goals = []; l.settings.example = false; }, ["settings", ...Object.keys(book.ledger.years).map((y) => `y:${y}`)])}>Clear example figures</button></div>
            )}
            <div className="bar">
              {confirm === "wipe" ? (
                <>
                  <span className="small">Delete every figure, budget and note? Categories and goals stay. Today's backup still has them.</span>
                  <button className="btn danger" onClick={() => { replace({ ...book.ledger, years: {} }); setConfirm(null); }}>Delete all figures</button>
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
