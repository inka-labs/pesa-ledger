/** Health: is the money going where it should? Each check grades the last 12 months (one-offs left out)
 *  against a common rule of thumb, says why, and links to where to act. The panel at the bottom says
 *  which account is the emergency fund, which groups are essential costs, and which category is rent. */

import { useApp, type Tab, type View } from "../context";
import { healthChecks, healthStats, rentCategory, type Check, type CheckId, type Tone } from "../model/health";
import { money } from "../model/format";
import type { HealthSettings, Ledger } from "../model/types";
import { EmptyState, Swatch } from "../ui/bits";
import { CircleAlert, CircleCheck, HeartPulse, Info, TriangleAlert } from "lucide-react";

const TONE: Record<Tone, { icon: React.ReactNode; label: string }> = {
  good: { icon: <CircleCheck size={13} strokeWidth={2.4} />, label: "Good" },
  warn: { icon: <CircleAlert size={13} strokeWidth={2.4} />, label: "Watch" },
  bad: { icon: <TriangleAlert size={13} strokeWidth={2.4} />, label: "Needs attention" },
  info: { icon: <Info size={13} strokeWidth={2.4} />, label: "For context" },
};

export function HealthView() {
  const { book, go } = useApp();
  const checks = healthChecks(book);
  const stats = healthStats(book);
  const count = (t: Tone) => checks.filter((c) => c.tone === t).length;
  const today = book.today;
  const firstNeg = stats.negative[0];
  const actions: Partial<Record<CheckId, { label: string; tab: Tab; patch?: Partial<View> }>> = {
    savings: { label: "See the year", tab: "year", patch: { yearView: today.y } },
    ef: { label: "Net worth", tab: "networth" },
    fixed: { label: "Budget", tab: "budget", patch: { planYear: today.y } },
    rent: { label: "Budget", tab: "budget", patch: { planYear: today.y } },
    growth: { label: "Compare years", tab: "compare", patch: { cmpA: today.y, cmpB: today.y - 1, cmpMetric: "spent", cmpSame: true, regular: true } },
    negative: firstNeg ? { label: `Open ${firstNeg.m}/${firstNeg.y}`, tab: "month", patch: { ...firstNeg } } : undefined,
    funds: { label: "Sinking funds", tab: "funds" },
  };
  const needsSetup = checks.some((c) => c.setup);

  return (
    <>
      <div className="panel-h">
        <h2>Health</h2>
        <span className="muted">The last {stats.months} months against common rules of thumb, one-offs left out</span>
      </div>
      {!checks.length ? (
        <EmptyState icon={HeartPulse} title="Your money's health, once there's a month to look at" action={<button className="btn primary" onClick={() => go("month", { ...book.today })}>Record this month</button>}>
          Record a few months and this page checks them against common rules of thumb: how much you save, how long your emergency fund would last, whether rent and essentials fit your income.
        </EmptyState>
      ) : (
        <>
          <div className="health-sum">
            {(["bad", "warn", "good"] as const).map((t) => count(t) > 0 && (
              <span key={t} className={`hchip ${t}`}><span aria-hidden>{TONE[t].icon}</span> {count(t)} {TONE[t].label.toLowerCase()}</span>
            ))}
          </div>
          <div className="health-grid">
            {[...checks].sort((a, b) => order(a) - order(b)).map((c) => {
              const act = actions[c.id];
              return (
                <article key={c.id} className={`hcard ${c.tone}`}>
                  <div className="hcard-h">
                    <span className={`hchip ${c.tone}`}><span aria-hidden>{TONE[c.tone].icon}</span> {TONE[c.tone].label}</span>
                    <h3>{c.title}</h3>
                  </div>
                  <div className="hval">{c.value}</div>
                  <p>{c.detail}</p>
                  <p className="small muted">Rule: {c.rule}</p>
                  <div className="bar">
                    {c.setup && <a className="btn" href="#health-setup">{c.setup}</a>}
                    {!c.setup && act && <button className="btn ghost" onClick={() => go(act.tab, act.patch)}>{act.label} →</button>}
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
      <HealthSetup open={needsSetup} essentialsAmount={stats.essentials} />
    </>
  );
}

const order = (c: Check) => ({ bad: 0, warn: 1, good: 2, info: 3 })[c.tone];

function HealthSetup({ open, essentialsAmount }: { open: boolean; essentialsAmount: number }) {
  const { book, change } = useApp();
  const h = book.settings.health ?? {};
  const outGroups = book.settings.groups.filter((g) => book.effectOfGroup(g) === "out");
  const essential = h.essential ?? outGroups.map((g) => g.id);
  const rent = rentCategory(book);
  const set = (patch: Partial<HealthSettings>) => change((l: Ledger) => { l.settings.health = { ...(l.settings.health ?? {}), ...patch }; }, ["settings"]);
  const toggle = (gid: string) => set({ essential: essential.includes(gid) ? essential.filter((x) => x !== gid) : [...essential, gid] });
  const accounts = book.accounts().filter((a) => !a.debt);
  return (
    <details className="panel hsetup" id="health-setup" open={open}>
      <summary><h3>What the checks use</h3><span className="muted small">Emergency fund, essential costs and rent</span></summary>
      <div className="form-grid">
        <label className="field"><span className="lbl">Emergency fund</span>
          <select value={h.ef ?? ""} onChange={(e) => set({ ef: e.target.value || null })}>
            <option value="">Choose…</option>
            {accounts.length > 0 && <optgroup label="Accounts (Net worth)">{accounts.map((a) => <option key={a.id} value={`a:${a.id}`}>{a.name}</option>)}</optgroup>}
            {book.settings.goals.length > 0 && <optgroup label="Goals">{book.settings.goals.map((g) => <option key={g.id} value={`g:${g.id}`}>{g.name}</option>)}</optgroup>}
          </select>
          <span className="small muted">An account uses its latest balance; a goal, what it has saved.</span>
        </label>
        <label className="field"><span className="lbl">Rent</span>
          <select value={h.rent ?? rent?.id ?? ""} onChange={(e) => set({ rent: e.target.value || null })}>
            <option value="">None</option>
            {book.settings.cats.filter((c) => book.effectOf(c.id) === "out" && !c.archived).map((c) => <option key={c.id} value={c.id}>{book.groups[c.group]?.name} · {c.name}</option>)}
          </select>
          <span className="small muted">Measured at next month's budget, or the latest figure.</span>
        </label>
      </div>
      <div className="field">
        <span className="lbl">Essential costs · about {money(essentialsAmount)} a month</span>
        <div className="pick-chips">
          {outGroups.map((g) => {
            const on = essential.includes(g.id);
            return <button type="button" key={g.id} className={`pick${on ? " on" : ""}`} aria-pressed={on} onClick={() => toggle(g.id)}>{on && <span aria-hidden>✓ </span>}<Swatch g={g} /> {g.name}</button>;
          })}
        </div>
        <span className="small muted">The groups you'd still have to pay in a bad month. They size the emergency fund and the weak-month check.</span>
      </div>
    </details>
  );
}
