import { useCallback, useEffect, useMemo, useState } from "react";
import { SEARCH_KEY, UNDO_KEY } from "./ui/keys";
import { api, type Version } from "./api";
import { NAME } from "./brand";
import { AppContext, SECTIONS, sectionOf, TABS, type Ctx, type Tab, type View } from "./context";
import { applyPalette } from "./model/theme";
import { AppearanceView } from "./views/AppearanceView";
import { OverviewView } from "./views/OverviewView";
import { CommandPalette, type Command } from "./ui/CommandPalette";
import { buildCSV } from "./model/csv";
import { downloadCSV } from "./ui/download";
import { Book, thisMonth } from "./model/ledger";
import { altRate, readMoney, type Rates } from "./model/money";
import { useLedger } from "./store";
import { BudgetView } from "./views/BudgetView";
import { CategoriesView } from "./views/CategoriesView";
import { CompareView } from "./views/CompareView";
import { GoalsView } from "./views/GoalsView";
import { MonthView } from "./views/MonthView";
import { SettingsView } from "./views/SettingsView";
import { Welcome } from "./views/Welcome";
import { YearView } from "./views/YearView";

const REGULAR_KEY = "pesa-ledger.leave-out-one-offs";

const tabFromHash = (): Tab => {
  const h = location.hash.slice(1) as Tab;
  return TABS.some((t) => t.id === h) ? h : "overview";
};

export type Theme = "system" | "light" | "dark";
function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    try { return (localStorage.getItem("pesa-ledger.theme") as Theme) || "system"; } catch { return "system"; }
  });
  useEffect(() => {
    if (theme === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
    try { localStorage.setItem("pesa-ledger.theme", theme); } catch { /* private window */ }
  }, [theme]);
  const next: Record<Theme, Theme> = { system: "light", light: "dark", dark: "system" };
  return { theme, setTheme, cycle: () => setTheme(next[theme]) };
}

export default function App() {
  const { load, ledger, save, change, replace, restored, undo, canUndo, retry } = useLedger();
  const [tab, setTab] = useState<Tab>(tabFromHash);
  const today = thisMonth();
  const [view, setViewState] = useState<View>({
    y: today.y, m: today.m, yearView: today.y, cmpA: today.y, cmpB: today.y - 1, cmpMetric: "spent", cmpSame: true, planYear: today.y, catHint: false,
    regular: (() => { try { return localStorage.getItem(REGULAR_KEY) === "1"; } catch { return false; } })(),
  });
  const [version, setVersion] = useState<Version | null>(null);
  const { theme, setTheme, cycle } = useTheme();
  // the last tab used in each section, so switching sections returns to it
  const [lastInSection, setLastInSection] = useState<Record<string, Tab>>({});
  useEffect(() => setLastInSection((s) => ({ ...s, [sectionOf(tab).id]: tab })), [tab]);
  // the palette recolours groups, charts and (for Matplotlib palettes) the accent
  const palette = ledger?.settings.palette;
  useEffect(() => applyPalette(palette), [palette]);

  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => {
    if (load.kind === "ready") api.version().then(setVersion).catch(() => undefined);
  }, [load.kind]);

  const setView = useCallback((patch: Partial<View>) => {
    if (patch.regular != null) try { localStorage.setItem(REGULAR_KEY, patch.regular ? "1" : "0"); } catch { /* private window */ }
    setViewState((v) => ({ ...v, ...patch }));
  }, []);
  const go = useCallback((t: Tab, patch?: Partial<View>) => {
    if (patch) setView(patch);
    location.hash = t;
    window.scrollTo({ top: 0 });
  }, [setView]);

  // Live exchange rates for the main currency (fetched by the local server, cached for 12 hours).
  const currency = ledger?.settings.currency ?? "";
  const [rates, setRates] = useState<Rates | null>(null);
  const [ratesError, setRatesError] = useState("");
  const loadRates = useCallback(async (refresh = false) => {
    if (!/^[A-Za-z]{3}$/.test(currency)) { setRates(null); setRatesError("Set a three-letter main currency, like KES, to get exchange rates."); return; }
    try {
      const r = await api.rates(currency, refresh);
      setRates(r);
      setRatesError(r.stale ? r.error ?? "" : "");
    } catch (e) {
      setRatesError((e as Error).message);
    }
  }, [currency]);
  useEffect(() => { if (load.kind === "ready" && currency) loadRates(); }, [load.kind, currency, loadRates]);

  const [toast, setToast] = useState<{ text: string; id: number; undoable?: boolean } | null>(null);
  const notify = useCallback((text: string, undoable?: boolean) => setToast({ text, id: Date.now(), undoable }), []);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), toast.undoable ? 9000 : 6000);
    return () => window.clearTimeout(t);
  }, [toast]);
  const doUndo = useCallback(() => {
    if (undo()) notify("Undone.");
    else notify("There's nothing to undo.");
  }, [undo, notify]);

  // Search and jump (⌘K, Ctrl+K or /) and Undo (⌘Z / Ctrl+Z outside a text box)
  const [search, setSearch] = useState(false);
  const openSearch = useCallback(() => setSearch(true), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.matches?.("input, textarea, select") || el.isContentEditable);
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") { e.preventDefault(); setSearch((s) => !s); }
      else if (mod && !e.shiftKey && e.key.toLowerCase() === "z" && !typing) { e.preventDefault(); doUndo(); }
      else if (!typing && !mod && e.key === "/") { e.preventDefault(); setSearch(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doUndo]);
  const closeSearch = useCallback(() => setSearch(false), []);

  const ctx: Ctx | null = useMemo(() => {
    if (!ledger) return null;
    return {
      book: new Book(ledger), change, replace, view, setView, go, notify, rates, ratesError, theme, setTheme,
      undo: doUndo, canUndo, openSearch,
      refreshRates: () => loadRates(true),
      altRate: altRate(ledger.settings, rates),
      read: (text: string) => readMoney(text, ledger.settings.currency, rates),
    };
  }, [ledger, change, replace, view, setView, go, notify, rates, ratesError, loadRates, theme, setTheme, doUndo, canUndo, openSearch]);

  useEffect(() => {
    document.title = tab === "overview" || !ledger ? NAME : `${TABS.find((t) => t.id === tab)?.label} · ${NAME}`;
  }, [tab, ledger]);

  if (load.kind === "loading") return <div className="center muted">Opening your ledger…</div>;
  if (load.kind === "signedout")
    return (
      <div className="center">
        <h2>Open {NAME} from its shortcut</h2>
        <p className="muted">This browser isn't signed in to your ledger. Run <code>pixi run open</code>, or use the sign-in link it printed.</p>
      </div>
    );
  if (load.kind === "failed")
    return <div className="center"><h2>Your ledger didn't open</h2><p className="muted">{load.message}</p></div>;

  const actions: Command[] = [
    ...(canUndo ? [{ id: "a:undo", label: "Undo last change", hint: UNDO_KEY, kind: "Action" as const, run: doUndo }] : []),
    { id: "a:theme", label: "Switch theme", hint: `Now: ${theme}`, kind: "Action", run: cycle },
    { id: "a:export", label: "Export CSV", hint: "Save every figure as a spreadsheet", kind: "Action", run: () => ledger && downloadCSV(buildCSV(ledger)) },
    { id: "a:backup", label: "Back up now", hint: "A copy of the whole ledger", kind: "Action",
      run: () => api.backupNow().then(() => notify("Backup saved.")).catch((e) => notify((e as Error).message)) },
    { id: "a:rates", label: "Check exchange rates", hint: "Fetch today's rates", kind: "Action", run: () => loadRates(true).then(() => notify("Exchange rates checked.")) },
  ];

  const saveLabel = save.kind === "saving" ? "Saving…" : save.kind === "saved" ? "Saved" : save.kind === "error" ? "Not saved" : "On this computer";

  return (
    <div className="app">
      <header className="top">
        <div className="brand"><h1>{NAME}</h1><span className="mark">{ledger?.settings.currency ?? "KES"}</span></div>
        <span className="save" data-s={save.kind}>{saveLabel}</span>
        {ledger && (
          <>
            <button className="searchbtn" onClick={openSearch} title="Search pages, months, categories and actions">
              <span>Search or jump to…</span><kbd>{SEARCH_KEY}</kbd>
            </button>
            <button className="theme" onClick={doUndo} disabled={!canUndo} title={`Undo the last change (${UNDO_KEY})`}>↶ Undo</button>
          </>
        )}
        <button className="theme" onClick={cycle} title="Switch between system, light and dark">
          {theme === "system" ? "Theme: system" : theme === "light" ? "Theme: light" : "Theme: dark"}
        </button>
        {ledger && (
          <nav className="tabs" aria-label="Sections">
            {SECTIONS.map((s) => (
              <a key={s.id} href={`#${lastInSection[s.id] ?? s.tabs[0].id}`} aria-current={sectionOf(tab).id === s.id ? "page" : undefined}>{s.label}</a>
            ))}
          </nav>
        )}
      </header>
      {ledger && (
        <nav className="subnav" aria-label={sectionOf(tab).label}>
          {sectionOf(tab).tabs.map((t) => (
            <a key={t.id} href={`#${t.id}`} aria-current={tab === t.id ? "page" : undefined}
              onClick={() => t.id !== "categories" && view.catHint && setView({ catHint: false })}>{t.label}</a>
          ))}
        </nav>
      )}

      {save.kind === "error" && (
        <div className="banner" role="alert"><span><b>Your last change wasn't saved.</b> {save.message}</span><button className="btn" onClick={retry}>Try again</button></div>
      )}
      {ledger?.settings.example && tab !== "settings" && (
        <div className="banner">
          <span><b>These are example figures.</b> Clear them when you're ready to enter your own. Your categories stay.</span>
          <button className="btn" onClick={() => { change((l) => { l.years = {}; l.settings.goals = []; l.settings.example = false; }, ["settings", ...Object.keys(ledger.years).map((y) => `y:${y}`)]); notify("Example figures cleared.", true); }}>Clear example figures</button>
        </div>
      )}

      <main className="stack">
        {!ctx ? (
          <Welcome onStart={(l, then) => { replace(l); setView({ catHint: then === "categories" && l.settings.cats.length > 0 }); go(then); }} />
        ) : (
          <AppContext.Provider value={ctx}>
            {tab === "overview" && <OverviewView />}
            {tab === "month" && <MonthView />}
            {tab === "budget" && <BudgetView />}
            {tab === "year" && <YearView />}
            {tab === "compare" && <CompareView />}
            {tab === "goals" && <GoalsView />}
            {tab === "categories" && <CategoriesView />}
            {tab === "settings" && <SettingsView version={version} onRestored={restored} />}
            {tab === "appearance" && <AppearanceView />}
            {search && <CommandPalette onClose={closeSearch} actions={actions} />}
          </AppContext.Provider>
        )}
      </main>
      <div className="toast-zone" aria-live="polite">
        {toast && (
          <div className="toast" key={toast.id}>
            <span>{toast.text}</span>
            {toast.undoable && <button className="toast-btn" onClick={() => { setToast(null); doUndo(); }}>Undo</button>}
          </div>
        )}
      </div>
    </div>
  );
}
