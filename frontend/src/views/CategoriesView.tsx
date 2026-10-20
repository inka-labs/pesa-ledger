/** Categories: a list to scan, not a form to fill. Each group is a card of its categories, each with its last
 *  12 months (a trend line and the total) and chips for what's set on it (repeats, a sinking fund, archived).
 *  Click a category for everything about it in a side panel; drag to reorder or to move it to another group;
 *  search and filter; fold groups. Group types live folded away at the bottom: they're set once. */

import { useCallback, useMemo, useState } from "react";
import { GripVertical, Pencil, Plus, Search, X } from "lucide-react";
import { useApp } from "../context";
import { newId, nextSlot, textSlotTaken } from "../model/csv";
import { setPlan } from "../model/edit";
import { money } from "../model/format";
import { addMonths, EFFECTS, fmtYM, kindsOf, MONTHS, parseYM } from "../model/ledger";
import { bucketOf, defaultBucket, ruleById } from "../model/allocation";
import type { Category, Effect, Group, Ledger } from "../model/types";
import { ColorPicker } from "../ui/ColorPicker";
import { AmountInput, Sparkline, TextInput } from "../ui/bits";
import { colorOf } from "../model/theme";
import { useFolded } from "../ui/fold";
import { Sheet } from "../ui/Sheet";

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
/** Whether a name is already taken in a list (ignoring capitals and spaces), other than by `except`. */
const taken = (list: { id: string; name: string }[], name: string, except?: string) => list.some((x) => x.id !== except && norm(x.name) === norm(name));

type Filter = "all" | "repeating" | "funds" | "unused" | "archived";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" }, { id: "repeating", label: "Repeating" }, { id: "funds", label: "Sinking funds" },
  { id: "unused", label: "Unused 6 months" }, { id: "archived", label: "Archived" },
];

/** Each category's last 12 months (to this one), its total and whether it's had anything in the last six. */
function useHistory() {
  const { book } = useApp();
  return useMemo(() => {
    const months = Array.from({ length: 12 }, (_, i) => addMonths(book.today, i - 11));
    const out: Record<string, { series: (number | null)[]; total: number; recent: boolean }> = {};
    for (const c of book.settings.cats) {
      const series = months.map((p) => book.actual(p.y, p.m, c.id));
      out[c.id] = { series, total: series.reduce<number>((s, v) => s + (v ?? 0), 0), recent: series.slice(6).some((v) => v != null && v !== 0) };
    }
    return { months, by: out };
  }, [book]);
}

export function CategoriesView() {
  const { book, change, view, notify } = useApp();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<string | null>(null);
  const close = useCallback(() => setOpen(null), []);
  const [drag, setDrag] = useState<string | null>(null);
  const { folded, toggle, setAll } = useFolded("categories");
  const hist = useHistory();
  const groups = book.settings.groups;

  const matches = (c: Category) => {
    const h = hist.by[c.id];
    if (filter === "archived") { if (!c.archived) return false; }
    else if (c.archived) return false;
    if (filter === "repeating" && !c.repeat) return false;
    if (filter === "funds" && !c.fund) return false;
    if (filter === "unused" && h?.recent) return false;
    if (q.trim()) {
      const g = book.groups[c.group];
      return norm(c.name).includes(norm(q)) || norm(g?.name ?? "").includes(norm(q));
    }
    return true;
  };
  const narrowing = filter !== "all" || !!q.trim();
  const shown = groups.map((g) => ({ g, cats: book.catsIn(g.id, true).filter(matches) })).filter((x) => !narrowing || x.cats.length);
  const count = shown.reduce((s, x) => s + x.cats.length, 0);
  const archivedCount = book.settings.cats.filter((c) => c.archived).length;

  /** Put `id` before `beforeId` (or at the end of `gid`), moving it to that group if need be. */
  const place = (id: string, gid: string, beforeId: string | null) => {
    if (id === beforeId) return;
    const c = book.cats[id], to = book.groups[gid];
    if (!c || !to) return;
    if (c.group !== gid && taken(book.catsIn(gid, true), c.name)) { notify(`${to.name} already has “${c.name}”.`); return; }
    change((l: Ledger) => {
      const cats = l.settings.cats, i = cats.findIndex((x) => x.id === id);
      const [moved] = cats.splice(i, 1);
      moved.group = gid;
      let at = beforeId ? cats.findIndex((x) => x.id === beforeId) : -1;
      if (at < 0) { const lastInGroup = cats.map((x) => x.group).lastIndexOf(gid); at = lastInGroup + 1 || cats.length; }
      cats.splice(at, 0, moved);
    }, ["settings"]);
    if (c.group !== gid) notify(`Moved “${c.name}” to ${to.name}.`, true);
  };

  return (
    <>
      <div className="panel-h">
        <h2>Categories</h2>
        <span className="muted">{book.settings.cats.filter((c) => !c.archived).length} categories in {groups.length} groups</span>
        <div className="end">
          <button className="btn ghost" onClick={() => setAll(groups.map((g) => g.id), !groups.every((g) => folded.has(g.id)))}>{groups.every((g) => folded.has(g.id)) ? "Expand all" : "Collapse all"}</button>
          <a className="btn" href="#new-group"><Plus size={15} aria-hidden /> New group</a>
        </div>
      </div>
      {view.catHint && <div className="notice">These are starter categories. Rename them, remove the ones you don't use and add your own. Then set amounts on the Budget tab.</div>}

      <div className="cg-tools">
        <label className="cg-search">
          <Search size={15} aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a category or group" aria-label="Find a category or group" />
          {q && <button className="iconbtn" aria-label="Clear" onClick={() => setQ("")}><X size={14} /></button>}
        </label>
        <div className="pick-chips" role="group" aria-label="Show">
          {FILTERS.filter((f) => f.id !== "archived" || archivedCount).map((f) => (
            <button key={f.id} className={`pick${filter === f.id ? " on" : ""}`} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
              {f.label}{f.id === "archived" ? ` (${archivedCount})` : ""}
            </button>
          ))}
        </div>
      </div>
      {narrowing && <p className="small muted">{count ? `${count} ${count === 1 ? "category" : "categories"} shown.` : "Nothing matches."} {narrowing && <button className="link" onClick={() => { setQ(""); setFilter("all"); }}>Show all</button>}</p>}

      <div className="cg-grid">
        {shown.map(({ g, cats }, i) => (
          <GroupCard key={g.id} g={g} cats={cats} hist={hist.by} first={i === 0} last={i === shown.length - 1} narrowing={narrowing}
            folded={!narrowing && folded.has(g.id)} onFold={() => toggle(g.id)} onOpen={setOpen}
            drag={drag} setDrag={setDrag} place={place} />
        ))}
        <NewGroup />
      </div>

      <details className="panel hsetup">
        <summary><h3>Group types</h3><span className="muted small">How each group's figures count: money in, set aside, money out, or tracked only. Usually set once.</span></summary>
        <KindsPanel />
      </details>

      {open && book.cats[open] && <CategoryPanel id={open} hist={hist} onClose={close} />}
    </>
  );
}

function GroupCard({ g, cats, hist, first, last, narrowing, folded, onFold, onOpen, drag, setDrag, place }: {
  g: Group; cats: Category[]; hist: ReturnType<typeof useHistory>["by"]; first: boolean; last: boolean; narrowing: boolean; folded: boolean;
  onFold: () => void; onOpen: (id: string) => void; drag: string | null; setDrag: (id: string | null) => void; place: (id: string, gid: string, before: string | null) => void;
}) {
  const { book, change, notify } = useApp();
  const [name, setName] = useState("");
  const [over, setOver] = useState<string | null>(null); // the row (or "end") a dragged category would land before
  const edit = (fn: (l: Ledger) => void) => change(fn, ["settings"]);
  const group = (l: Ledger) => l.settings.groups.find((x) => x.id === g.id)!;
  const all = book.catsIn(g.id, true);
  const total = all.reduce((s, c) => s + (hist[c.id]?.total ?? 0), 0);
  const moveGroup = (dir: -1 | 1) => edit((l) => {
    const gs = l.settings.groups, i = gs.findIndex((x) => x.id === g.id), j = i + dir;
    if (j >= 0 && j < gs.length) [gs[i], gs[j]] = [gs[j], gs[i]];
  });
  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (taken(all, name)) { notify(`${g.name} already has “${name.trim()}”.`); return; }
    edit((l) => void l.settings.cats.push({ id: newId("c"), name: name.trim(), group: g.id }));
    setName("");
  };
  const drop = (before: string | null) => (e: React.DragEvent) => { e.preventDefault(); const id = drag ?? e.dataTransfer.getData("text/plain"); setOver(null); setDrag(null); if (id) place(id, g.id, before); };
  const dragOver = (key: string) => (e: React.DragEvent) => { if (!drag) return; e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (over !== key) setOver(key); };

  return (
    <section className={`cg-card${drag ? " dragging" : ""}`} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null); }}>
      <header className="cg-head">
        <button className="fold" aria-expanded={!folded} aria-label={`${folded ? "Show" : "Fold"} ${g.name}`} onClick={onFold} disabled={narrowing}>
          <span className={`chev${folded ? "" : " open"}`} aria-hidden>▸</span>
        </button>
        <ColorPicker g={g} onPick={(p) => edit((l) => Object.assign(group(l), p))} />
        <TextInput className="inline-edit gname" value={g.name} label="Group name"
          onCommit={(v) => {
            if (!v.trim()) return false;
            if (taken(book.settings.groups, v, g.id)) { notify(`There's already a group called “${v.trim()}”.`); return false; }
            edit((l) => void (group(l).name = v.trim()));
          }} />
        <select className="ghost-select" value={g.kind} aria-label={`${g.name}'s type`} title="Group type: how its figures count" onChange={(e) => edit((l) => void (group(l).kind = e.target.value))}>
          {book.kindList().map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
          {!book.kinds[g.kind] && <option value={g.kind}>Removed type</option>}
        </select>
        <span className="cg-total num" title="Last 12 months">{money(total)}</span>
        <span className="moves">
          <button className="iconbtn" aria-label={`Move ${g.name} up`} disabled={first || narrowing} onClick={() => moveGroup(-1)}>↑</button>
          <button className="iconbtn" aria-label={`Move ${g.name} down`} disabled={last || narrowing} onClick={() => moveGroup(1)}>↓</button>
        </span>
      </header>
      {folded ? (
        <button className="cg-folded small muted" onClick={onFold}>{all.filter((c) => !c.archived).length} categories</button>
      ) : (
        <>
          <ul className="cg-list" onDragOver={dragOver("end")} onDrop={drop(null)}>
            {cats.map((c) => {
              const h = hist[c.id];
              const f = c.fund ? book.fund(c.id) : null;
              return (
                <li key={c.id} className={`cg-row${c.archived ? " archived" : ""}${over === c.id ? " drop-before" : ""}${drag === c.id ? " lifted" : ""}`}
                  draggable={!narrowing} onDragStart={(e) => { setDrag(c.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", c.id); }}
                  onDragEnd={() => { setDrag(null); setOver(null); }} onDragOver={dragOver(c.id)} onDrop={drop(c.id)}>
                  {!narrowing && <span className="grip" aria-hidden title="Drag to reorder or move to another group"><GripVertical size={15} /></span>}
                  <button className="cg-name" onClick={() => onOpen(c.id)} title={`Open ${c.name}`}>
                    <span className="nm">{c.name}</span>
                    <span className="chips">
                      {!!c.repeat && <span className="chip">Repeats {money(c.repeat)}</span>}
                      {f && <span className={`chip${f.status === "short" || f.status === "overdue" ? " warn" : ""}`}>Fund · due {fmtYM(parseYM(c.fund!.due))}</span>}
                      {c.archived && <span className="chip">Archived</span>}
                      {h && !h.recent && !c.archived && book.catHasData(c.id) && <span className="chip muted-chip">Quiet 6 months</span>}
                    </span>
                  </button>
                  <span className="cg-spark">{h && h.series.some((v) => v != null) ? <Sparkline values={h.series} label={`${c.name}, last 12 months`} /> : null}</span>
                  <span className="cg-amt num">{h?.total ? money(h.total) : <span className="muted">–</span>}</span>
                </li>
              );
            })}
            {drag && <li className={`cg-dropend${over === "end" ? " on" : ""}`} aria-hidden>Drop here to move to {g.name}</li>}
          </ul>
          {!narrowing && (
            <form className="cg-add" onSubmit={add}>
              <Plus size={15} aria-hidden className="muted" />
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add a category" aria-label={`New category in ${g.name}`} />
              {name.trim() && <button className="btn">Add</button>}
            </form>
          )}
          {!all.length && <button className="btn ghost danger" onClick={() => { edit((l) => void (l.settings.groups = l.settings.groups.filter((x) => x.id !== g.id))); notify(`Removed the group “${g.name}”.`, true); }}>Remove this empty group</button>}
        </>
      )}
    </section>
  );
}

function NewGroup() {
  const { book, change, notify } = useApp();
  const kinds = book.kindList();
  const [name, setName] = useState("");
  const [kind, setKind] = useState(kinds.find((k) => k.effect === "out")?.id ?? kinds[0].id);
  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (taken(book.settings.groups, name)) { notify(`There's already a group called “${name.trim()}”.`); return; }
    const effect = book.kinds[kind]?.effect;
    change((l) => void l.settings.groups.push({ id: newId("g"), name: name.trim(), kind, slot: effect === "in" && !textSlotTaken(l.settings.groups) ? 0 : nextSlot(l.settings.groups) }), ["settings"]);
    setName("");
  };
  return (
    <form className="cg-card cg-new" id="new-group" onSubmit={add}>
      <h3>New group</h3>
      <div className="add-line">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Business, Children, Loans" aria-label="New group name" />
        <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="New group type">
          {kinds.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
        </select>
        <button className="btn">Add group</button>
      </div>
    </form>
  );
}

/** Everything about one category in one place: name, group, repeating amount, this year's budget, its
 *  Allocation bucket, its sinking fund, its last 12 months, and archiving or removing it. */
function CategoryPanel({ id, hist, onClose }: { id: string; hist: ReturnType<typeof useHistory>; onClose: () => void }) {
  const { book, change, notify, go } = useApp();
  const c = book.cats[id];
  const g = book.groups[c.group];
  const h = hist.by[id];
  const y = book.today.y;
  const effect = book.effectOf(id);
  const budgeted = book.budgeted(id);
  const edit = (fn: (l: Ledger) => void) => change(fn, ["settings"]);
  const cat = (l: Ledger) => l.settings.cats.find((x) => x.id === id)!;
  const siblings = book.catsIn(c.group, true);
  const at = siblings.findIndex((x) => x.id === id);
  const rule = ruleById(book, book.settings.allocation?.rule);
  const chosen = book.settings.allocation?.maps?.[rule?.id ?? ""]?.[`c:${id}`] ?? "";
  const max = Math.max(1, ...h.series.map((v) => Math.abs(v ?? 0)));
  const withData = h.series.filter((v) => v != null).length;
  const move = (dir: -1 | 1) => edit((l) => {
    const cats = l.settings.cats, i = cats.findIndex((x) => x.id === id);
    const sib = dir < 0 ? cats.slice(0, i).reverse().find((x) => x.group === c.group) : cats.slice(i + 1).find((x) => x.group === c.group);
    if (!sib) return;
    const j = cats.indexOf(sib);
    [cats[i], cats[j]] = [cats[j], cats[i]];
  });
  const remove = () => {
    edit((l) => { l.settings.cats = l.settings.cats.filter((x) => x.id !== id); l.settings.goals.forEach((gl) => (gl.cats = gl.cats.filter((x) => x !== id))); });
    notify(`Removed “${c.name}”.`, true);
    onClose();
  };

  return (
    <Sheet title={c.name} onClose={onClose} onSubmit={onClose}
      footer={<div className="bar">
        <button className="btn primary">Done</button>
        {book.catHasData(id)
          ? <button type="button" className="btn ghost" onClick={() => edit((l) => { const x = cat(l); if (x.archived) delete x.archived; else x.archived = true; })}>{c.archived ? "Restore" : "Archive"}</button>
          : <button type="button" className="btn ghost danger" onClick={remove}>Remove</button>}
        <span className="small muted" style={{ marginLeft: "auto" }}>{c.archived ? "Archived: hidden from new months, figures kept." : "Changes save as you make them."}</span>
      </div>}>
      <div className="cp-hist">
        <div className="cp-figs">
          <div><span className="lbl">Last 12 months</span><b className="num big">{money(h.total)}</b></div>
          <div><span className="lbl">Monthly average</span><b className="num">{withData ? money(h.total / withData) : "–"}</b></div>
          {budgeted && <div><span className="lbl">Budget {y}</span><b className="num">{book.planYear(y, id) != null ? money(book.planYear(y, id)!) : "–"}</b></div>}
        </div>
        <div className="cp-bars" role="img" aria-label={`${c.name}, month by month`}>
          {h.series.map((v, i) => (
            <span key={i} className="cp-bar" title={`${MONTHS[hist.months[i].m - 1]} ${hist.months[i].y}: ${v == null ? "nothing recorded" : money(v)}`}>
              <i style={{ height: `${v ? Math.max(4, (Math.abs(v) / max) * 100) : 0}%`, background: g ? colorOf(g) : undefined }} className={v == null ? "none" : ""} />
              <small>{MONTHS[hist.months[i].m - 1][0]}</small>
            </span>
          ))}
        </div>
      </div>

      <label className="field"><span className="lbl">Name</span>
        <TextInput value={c.name} label="Category name" onCommit={(v) => {
          if (!v.trim()) return false;
          if (taken(siblings, v, id)) { notify(`${g?.name} already has “${v.trim()}”.`); return false; }
          edit((l) => void (cat(l).name = v.trim()));
        }} />
      </label>
      <div className="form-grid">
        <label className="field"><span className="lbl">Group</span>
          <select value={c.group} onChange={(e) => {
            const to = book.groups[e.target.value];
            if (taken(book.catsIn(to.id, true), c.name)) { notify(`${to.name} already has “${c.name}”.`); return; }
            edit((l) => void (cat(l).group = to.id)); notify(`Moved “${c.name}” to ${to.name}.`, true);
          }}>
            {book.settings.groups.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </label>
        <div className="field"><span className="lbl">Position in {g?.name}</span>
          <div className="bar">
            <button type="button" className="btn ghost" disabled={at <= 0} onClick={() => move(-1)}>↑ Up</button>
            <button type="button" className="btn ghost" disabled={at >= siblings.length - 1} onClick={() => move(1)}>↓ Down</button>
            <span className="small muted">{at + 1} of {siblings.length}</span>
          </div>
        </div>
        {effect !== "none" && (
          <label className="field"><span className="lbl">Every month</span>
            <AmountInput value={c.repeat ?? null} placeholder="–" label={`${c.name}: amount every month`}
              onCommit={(v) => edit((l) => { const x = cat(l); if (v == null) delete x.repeat; else x.repeat = v; })} />
            <span className="small muted">Rent, salary, a subscription: offered on the Month page{budgeted ? ", and the budget when none is set" : ""}.</span>
          </label>
        )}
        {budgeted && (
          <label className="field"><span className="lbl">Budget for {y}</span>
            <AmountInput value={book.planAnnual(y, id)} placeholder={book.planYear(y, id) != null ? money(book.planYear(y, id)!) : "–"} label={`${c.name}: budget for ${y}`}
              onCommit={(v) => change((l) => void setPlan(l, y, id, v), [`y:${y}`])} />
            <span className="small muted">For the whole year, spread evenly. Month-by-month budgets are on the <button type="button" className="link" onClick={() => go("budget", { planYear: y })}>Budget</button> tab.</span>
          </label>
        )}
      </div>

      {rule && budgeted && (
        <label className="field"><span className="lbl">In {rule.name}</span>
          <select value={chosen} onChange={(e) => change((l) => { const a = (l.settings.allocation ??= {}); const m = ((a.maps ??= {})[rule.id] ??= {}); if (e.target.value) m[`c:${id}`] = e.target.value; else delete m[`c:${id}`]; }, ["settings"])}>
            <option value="">Automatic ({rule.buckets.find((b) => b.id === (book.settings.allocation?.maps?.[rule.id]?.[`g:${c.group}`] ?? defaultBucket(book, rule, id)))?.name ?? "–"})</option>
            {rule.buckets.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <span className="small muted">Now counted as {rule.buckets.find((b) => b.id === bucketOf(book, rule, id))?.name} on the Allocation page.</span>
        </label>
      )}

      {budgeted && (
        <div className="field"><span className="lbl">Sinking fund</span>
          {c.fund ? (() => { const f = book.fund(id)!; return (
            <span className="small">{money(f.saved)} of {money(c.fund.target)}, due {fmtYM(parseYM(c.fund.due))} · {f.status === "ready" ? "ready" : f.status === "on-pace" ? "on pace" : `short ${money(f.short || f.remaining)}`}. <button type="button" className="link" onClick={() => go("funds")}>Open Sinking funds</button></span>
          ); })() : <span className="small muted">Saving up here for a known bill? <button type="button" className="link" onClick={() => go("funds")}>Make it a sinking fund</button>.</span>}
        </div>
      )}
      <p className="small muted"><Pencil size={12} aria-hidden /> Drag categories on the page to reorder them or move them between groups.</p>
    </Sheet>
  );
}

/** The types groups can have. Each says how its figures count; add as many as you like. */
function KindsPanel() {
  const { book, change, notify } = useApp();
  const kinds = book.kindList();
  const [name, setName] = useState("");
  const [effect, setEffect] = useState<Effect>("out");
  const used = (id: string) => book.settings.groups.some((g) => g.kind === id);
  const edit = (fn: (l: Ledger) => void) => change((l) => { l.settings.kinds = structuredClone(kindsOf(l.settings)); fn(l); }, ["settings"]);
  const kindIn = (l: Ledger, id: string) => l.settings.kinds!.find((k) => k.id === id)!;
  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (taken(kinds, name)) { notify(`There's already a group type called “${name.trim()}”.`); return; }
    edit((l) => void l.settings.kinds!.push({ id: newId("k"), name: name.trim(), effect }));
    setName("");
  };
  return (
    <div className="kinds">
      {kinds.map((k) => (
        <div className="kind-line" key={k.id}>
          <TextInput value={k.name} label="Type name" onCommit={(v) => {
            if (!v.trim()) return false;
            if (taken(kinds, v, k.id)) { notify(`There's already a group type called “${v.trim()}”.`); return false; }
            edit((l) => void (kindIn(l, k.id).name = v.trim()));
          }} />
          <select value={k.effect} aria-label={`How ${k.name} counts`} onChange={(e) => edit((l) => void (kindIn(l, k.id).effect = e.target.value as Effect))}>
            {EFFECTS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
          </select>
          <span className="small muted help">{EFFECTS.find((x) => x.id === k.effect)?.help}</span>
          {used(k.id) || kinds.length === 1
            ? <span className="small muted">{used(k.id) ? "In use" : ""}</span>
            : <button className="btn ghost danger" onClick={() => edit((l) => void (l.settings.kinds = l.settings.kinds!.filter((x) => x.id !== k.id)))}>Remove</button>}
        </div>
      ))}
      <form className="kind-line" onSubmit={add}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New type, e.g. Investments" aria-label="New type name" />
        <select value={effect} onChange={(e) => setEffect(e.target.value as Effect)} aria-label="How the new type counts">
          {EFFECTS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
        </select>
        <span className="small muted help">{EFFECTS.find((x) => x.id === effect)?.help}</span>
        <button className="btn">Add type</button>
      </form>
    </div>
  );
}
