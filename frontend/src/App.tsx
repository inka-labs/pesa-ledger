import { useCallback, useEffect, useMemo, useState } from "react";
import { SEARCH_KEY, UNDO_KEY } from "./ui/keys";
import { api, type Version } from "./api";
import { NAME } from "./brand";
import { ABOUT, AppContext, SECTIONS, TABS, sectionOf, type Ctx, type Tab, type View } from "./context";
import { ChevronDown, ChevronLeft, Ellipsis, Info, Monitor, Moon, Plus, Search, Settings as SettingsIcon, Sun, Undo2, X } from "lucide-react";
import { AddExpense } from "./ui/AddExpense";
import { MoreView } from "./views/MoreView";
import { TAB_ICON } from "./ui/icons";
import { applyPalette } from "./model/theme";
import { AppearanceView } from "./views/AppearanceView";
import { OverviewView } from "./views/OverviewView";
import { CommandPalette, type Command } from "./ui/CommandPalette";
import { buildCSV } from "./model/csv";
import { downloadCSV } from "./ui/download";
import { Book, currentMonth, thisMonth } from "./model/ledger";
import { altRate, altRates, readMoney, type Rates } from "./model/money";
import { useLedger } from "./store";
import { BudgetView } from "./views/BudgetView";
import { CategoriesView } from "./views/CategoriesView";
import { CompareView } from "./views/CompareView";
import { GoalsView } from "./views/GoalsView";
import { FundsView } from "./views/FundsView";
import { AllocationView } from "./views/AllocationView";
import { HealthView } from "./views/HealthView";
import { NetWorthView } from "./views/NetWorthView";
import { MonthView } from "./views/MonthView";
import { SettingsView } from "./views/SettingsView";
import { Welcome } from "./views/Welcome";
import { YearView } from "./views/YearView";

const REGULAR_KEY = "pesa-ledger.leave-out-one-offs";
const EXAMPLE_KEY = "pesa-ledger.example-note-hidden";

/** Shapes where the page will be, while the ledger loads. */
function Skeleton() {
  return (
    <div className="shell" aria-busy="true" aria-label="Opening your ledger">
      <aside className="side"><div className="sk" style={{ height: 28, width: "70%" }} />{[...Array(8)].map((_, i) => <div key={i} className="sk" style={{ height: 14, width: `${50 + (i % 3) * 15}%` }} />)}</aside>
      <div className="main"><div className="stack">
        <div className="sk" style={{ height: 30, width: 260 }} />
        <div className="kpis">{[...Array(4)].map((_, i) => <div key={i} className="sk" style={{ height: 96 }} />)}</div>
        <div className="sk" style={{ height: 280 }} />
      </div></div>
    </div>
  );
}

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
  const { load, ledger, save, change, replace, restored, undo, canUndo, retry, saveNow, problems } = useLedger();
  /** A backup reads the files on disk, so anything still waiting to be saved goes first. */
  const backupNow = useCallback(async () => {
    if (!(await saveNow())) throw new Error("Your latest changes aren't saved yet, so a backup now would miss them. Try again once they're saved.");
    return api.backupNow();
  }, [saveNow]);
  const [tab, setTab] = useState<Tab>(tabFromHash);
  const today = thisMonth();
  const [view, setViewState] = useState<View>({
    y: today.y, m: today.m, yearView: today.y, cmpA: today.y, cmpB: today.y - 1, cmpMetric: "spent", cmpSame: true, planYear: today.y, planMonth: today.m, catHint: false,
    regular: (() => { try { return localStorage.getItem(REGULAR_KEY) === "1"; } catch { return false; } })(),
  });
  const [version, setVersion] = useState<Version | null>(null);
  const { theme, setTheme, cycle } = useTheme();
  // the last tab used in each section, so switching sections returns to it
  const [exampleHidden, setExampleHidden] = useState(() => { try { return sessionStorage.getItem(EXAMPLE_KEY) === "1"; } catch { return false; } });
  const hideExample = () => { setExampleHidden(true); try { sessionStorage.setItem(EXAMPLE_KEY, "1"); } catch { /* private window */ } };
  // the palette recolours groups, charts and (for Matplotlib palettes) the accent
  const palette = ledger?.settings.palette;
  const tint = ledger?.settings.tint ?? "soft";
  useEffect(() => applyPalette(palette, tint), [palette, tint]);

  // with a pay cycle, "now" is last month's figures until payday: open there once the ledger loads,
  // and again whenever the pay cycle setting changes
  const payday = ledger ? ledger.settings.paycycle?.payday ?? 0 : null;
  useEffect(() => {
    if (payday == null) return;
    const now = currentMonth(payday ? { paycycle: { payday } } : null);
    setViewState((v) => ({ ...v, y: now.y, m: now.m, yearView: now.y, cmpA: now.y, cmpB: now.y - 1, planYear: now.y, planMonth: now.m }));
  }, [payday]);

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
  // "Add expense": undefined is closed; a string (possibly empty) is open, with that category chosen
  const [adding, setAdding] = useState<string | undefined>(undefined);
  const addExpense = useCallback((cid?: string | null) => setAdding(cid ?? ""), []);
  const [phoneMore, setPhoneMore] = useState(false);
  useEffect(() => setPhoneMore(false), [tab]);

  const ctx: Ctx | null = useMemo(() => {
    if (!ledger) return null;
    return {
      book: new Book(ledger, currentMonth(ledger.settings)), change, replace, view, setView, go, notify, rates, ratesError, theme, setTheme,
      undo: doUndo, canUndo, openSearch, addExpense,
      refreshRates: () => loadRates(true),
      altRate: altRate(ledger.settings, rates),
      altRates: altRates(ledger.settings, rates),
      read: (text: string) => readMoney(text, ledger.settings.currency, rates),
    };
  }, [ledger, change, replace, view, setView, go, notify, rates, ratesError, loadRates, theme, setTheme, doUndo, canUndo, openSearch, addExpense]);

  useEffect(() => {
    document.title = tab === "overview" || !ledger ? NAME : `${TABS.find((t) => t.id === tab)?.label} · ${NAME}`;
  }, [tab, ledger]);

  if (load.kind === "loading") return <Skeleton />;
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
      run: () => backupNow().then(() => notify("Backup saved.")).catch((e) => notify((e as Error).message)) },
    { id: "a:rates", label: "Check exchange rates", hint: "Fetch today's rates", kind: "Action", run: () => loadRates(true).then(() => notify("Exchange rates checked.")) },
  ];

  const saveLabel = save.kind === "saving" ? "Saving…" : save.kind === "saved" ? "Saved" : save.kind === "error" ? "Not saved" : "On this computer";
  const ThemeIcon = theme === "system" ? Monitor : theme === "light" ? Sun : Moon;
  const navLink = (t: { id: Tab; label: string }, cls: string) => {
    const Icon = TAB_ICON[t.id];
    return (
      <a key={t.id} className={cls} href={`#${t.id}`}
        aria-current={tab === t.id || (t.id === "more" && sectionOf(tab).id === "more") || (t.id === "settings" && sectionOf(tab).id === "setup") ? "page" : undefined}
        onClick={() => { if (t.id !== "categories" && view.catHint) setView({ catHint: false }); }}>
        <Icon size={17} strokeWidth={1.9} aria-hidden /><span>{t.label}</span>
      </a>
    );
  };

  return (
    <div className={`shell${ledger ? "" : " bare"}`}>
      {ledger && (
        <aside className="side" aria-label="Pages">
          <div className="brand"><h1>{NAME}</h1><span className="mark">{ledger.settings.currency}</span></div>
          <button className="searchbtn" onClick={openSearch} title="Search pages, months, categories and actions">
            <Search size={15} aria-hidden /><span>Search…</span><kbd>{SEARCH_KEY}</kbd>
          </button>
          <button className="btn primary add-btn" onClick={() => { setView(ctxToday(ledger)); addExpense(); }}><Plus size={16} aria-hidden /> Add expense</button>
          <nav className="side-nav">
            <div className="side-sec">
              {SECTIONS[0].tabs.filter((t) => t.id !== "more").map((t) => navLink(t, "side-link"))}
              <MoreMenu tab={tab} />
            </div>
          </nav>
          <div className="side-foot">
            {navLink({ id: "settings", label: "Settings" }, "side-link")}
            <span className="save" data-s={save.kind} role="status">{saveLabel}</span>
            <div className="bar">
              <button className="iconbtn wide" onClick={doUndo} disabled={!canUndo} title={`Undo the last change (${UNDO_KEY})`}><Undo2 size={15} aria-hidden /> Undo</button>
              <button className="iconbtn wide" onClick={cycle} title="Switch between system, light and dark"><ThemeIcon size={15} aria-hidden /> {theme === "system" ? "System" : theme === "light" ? "Light" : "Dark"}</button>
            </div>
          </div>
        </aside>
      )}
      <div className="main">
        <header className="mtop">
          <div className="brand"><h1>{NAME}</h1>{ledger && <span className="mark">{ledger.settings.currency}</span>}</div>
          {ledger && <span className="save" data-s={save.kind} role="status" title={saveLabel}><span className="sr-only">{saveLabel}</span></span>}
          {ledger && <button className="iconbtn" onClick={openSearch} aria-label="Search"><Search size={19} /></button>}
          {ledger && <button className="iconbtn" onClick={doUndo} disabled={!canUndo} aria-label="Undo"><Undo2 size={19} /></button>}
          <button className="iconbtn" onClick={cycle} aria-label={`Theme: ${theme}`}><ThemeIcon size={19} /></button>
        </header>

        {save.kind === "error" && (
          <div className="banner" role="alert">
            <span><b>{save.signedOut ? "Signed out: your changes aren't saved yet." : "Your last change wasn't saved."}</b> {save.message}</span>
            <span className="bar">
              {ledger && <button className="btn ghost" onClick={() => downloadCSV(buildCSV(ledger))}>Export CSV</button>}
              <button className="btn" onClick={() => void retry()}>Try again</button>
            </span>
          </div>
        )}
        {problems.length > 0 && (
          <div className="banner" role="alert">
            <span><b>Part of your ledger couldn't be read.</b> {problems.join(" ")} Nothing was overwritten; restore a backup from Settings → General, or put the file back from the data folder.</span>
          </div>
        )}
        {ledger?.settings.example && tab !== "settings" && !exampleHidden && (
          <div className="strip-note">
            <Info size={15} aria-hidden />
            <span>You're looking at example figures.</span>
            <button className="link" onClick={() => { change((l) => { l.years = {}; l.settings.goals = []; l.settings.example = false; }, ["settings", ...Object.keys(ledger.years).map((y) => `y:${y}`)]); notify("Example figures cleared.", true); }}>Clear them</button>
            <button className="iconbtn" aria-label="Hide this note" onClick={hideExample}><X size={14} /></button>
          </div>
        )}

      <main className="stack page" key={tab}>
        {ctx && <SubNav tab={tab} />}
        {!ctx ? (
          <Welcome onStart={(l, then) => { replace(l); setView({ catHint: then === "categories" && l.settings.cats.length > 0 }); go(then); }} />
        ) : (
          <AppContext.Provider value={ctx}>
            {tab === "overview" && <OverviewView />}
            {tab === "more" && <MoreView />}
            {tab === "month" && <MonthView />}
            {tab === "budget" && <BudgetView />}
            {tab === "year" && <YearView />}
            {tab === "compare" && <CompareView />}
            {tab === "goals" && <GoalsView />}
            {tab === "funds" && <FundsView />}
            {tab === "allocation" && <AllocationView />}
            {tab === "health" && <HealthView />}
            {tab === "networth" && <NetWorthView />}
            {tab === "categories" && <CategoriesView />}
            {tab === "settings" && <SettingsView version={version} onRestored={restored} saveNow={saveNow} backupNow={backupNow} />}
            {tab === "appearance" && <AppearanceView />}
            {search && <CommandPalette onClose={closeSearch} actions={actions} />}
            {adding !== undefined && <AddExpense cid={adding || null} onClose={() => setAdding(undefined)} />}
          </AppContext.Provider>
        )}
      </main>
      </div>
      {ledger && (
        <nav className="bottombar" aria-label="Pages">
          {SECTIONS[0].tabs.slice(0, 2).map((t) => navLink(t, "bb-link"))}
          <button className="bb-add" aria-label="Add expense" onClick={() => { setView(ctxToday(ledger)); addExpense(); }}><Plus size={22} aria-hidden /></button>
          {navLink(SECTIONS[0].tabs[2], "bb-link")}
          <button className={`bb-link${phoneMore || sectionOf(tab).id === "more" ? " on" : ""}`} aria-expanded={phoneMore} aria-haspopup="menu" onClick={() => setPhoneMore((x) => !x)}>
            <Ellipsis size={17} aria-hidden /><span>More</span>
          </button>
        </nav>
      )}
      {phoneMore && ledger && (
        <div className="sheet-back" onMouseDown={(e) => e.target === e.currentTarget && setPhoneMore(false)}>
          <nav className="more-sheet" aria-label="More pages" onClick={() => setPhoneMore(false)}>
            {SECTIONS[1].tabs.map((t) => {
              const Icon = TAB_ICON[t.id];
              return (
                <a key={t.id} className="more-row" href={`#${t.id}`} aria-current={tab === t.id ? "page" : undefined}>
                  <Icon size={18} aria-hidden /><span><b>{t.label}</b><span className="muted small">{ABOUT[t.id]}</span></span>
                </a>
              );
            })}
          </nav>
        </div>
      )}
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

/** The month "Add expense" opens on from the menu: the current one (or current pay cycle). */
function ctxToday(ledger: { settings: Parameters<typeof currentMonth>[0] } | null) {
  return currentMonth(ledger?.settings ?? null);
}

/** Pages under More and Settings get a way back and their siblings; the three everyday pages need neither. */
function SubNav({ tab }: { tab: Tab }) {
  const sec = sectionOf(tab);
  if (sec.id === "more")
    return <a className="crumb" href="#more"><ChevronLeft size={15} aria-hidden /> More</a>;
  if (sec.id === "setup")
    return (
      <nav className="subtabs" aria-label="Settings">
        <SettingsIcon size={15} aria-hidden />
        {sec.tabs.map((t) => <a key={t.id} href={`#${t.id}`} aria-current={tab === t.id ? "page" : undefined}>{t.label}</a>)}
      </nav>
    );
  return null;
}

/** "More" in the sidebar: a dropdown of the pages under it, open while you're on one of them. */
function MoreMenu({ tab }: { tab: Tab }) {
  const inside = sectionOf(tab).id === "more";
  const [open, setOpen] = useState(inside);
  useEffect(() => { if (inside) setOpen(true); }, [inside]);
  const Icon = TAB_ICON.more;
  return (
    <div className="side-more">
      <button className="side-link" aria-expanded={open} aria-controls="side-more-list" onClick={() => setOpen((x) => !x)}>
        <Icon size={17} strokeWidth={1.9} aria-hidden /><span>More</span>
        <ChevronDown size={15} aria-hidden className={`side-chev${open ? " open" : ""}`} />
      </button>
      {open && (
        <div id="side-more-list" className="side-sub">
          {SECTIONS[1].tabs.map((t) => {
            const I = TAB_ICON[t.id];
            return (
              <a key={t.id} className="side-link sub" href={`#${t.id}`} aria-current={tab === t.id ? "page" : undefined} title={ABOUT[t.id]}>
                <I size={15} strokeWidth={1.9} aria-hidden /><span>{t.label}</span>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
