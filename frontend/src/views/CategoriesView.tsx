import { useState } from "react";
import { useApp } from "../context";
import { newId, nextSlot } from "../model/csv";
import type { Category, Group, Kind, Ledger } from "../model/types";
import { Swatch, TextInput } from "../ui/bits";

const KINDS: [Kind, string][] = [["income", "Income"], ["saving", "Saving"], ["expense", "Spending"]];

export function CategoriesView() {
  const { book, change, view } = useApp();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Kind>("expense");
  const edit = (fn: (l: Ledger) => void) => change(fn, ["settings"]);
  const addGroup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    edit((l) => void l.settings.groups.push({ id: newId("g"), name: name.trim(), kind, slot: kind === "income" ? 0 : nextSlot(l.settings.groups) }));
    setName("");
  };
  return (
    <>
      <div className="panel-h"><h2>Categories</h2><span className="muted">Shape the ledger around how you earn, save and spend</span></div>
      {view.catHint && <div className="notice">These are starter categories. Rename them, remove the ones you don't use and add your own. Then set amounts on the Budget tab.</div>}
      <p className="small prose">
        Each group has a type. <b>Income</b> is money coming in. <b>Saving</b> counts towards what you put aside. <b>Spending</b> covers
        everything else, including family support and sinking funds. A category that already has figures can be archived instead of
        removed, so past months stay correct.
      </p>
      <div className="catgroups">
        {book.settings.groups.map((g, i) => <GroupPanel key={g.id} g={g} first={i === 0} last={i === book.settings.groups.length - 1} />)}
        <form className="panel" onSubmit={addGroup}>
          <h3>Add a group</h3>
          <div className="add-line">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Business, Children, Loans" aria-label="New group name" />
            <select value={kind} onChange={(e) => setKind(e.target.value as Kind)} aria-label="New group type">
              <option value="expense">Spending</option><option value="saving">Saving</option><option value="income">Income</option>
            </select>
            <button className="btn">Add group</button>
          </div>
        </form>
      </div>
    </>
  );
}

function GroupPanel({ g, first, last }: { g: Group; first: boolean; last: boolean }) {
  const { book, change } = useApp();
  const [name, setName] = useState("");
  const cats = book.catsIn(g.id, true);
  const edit = (fn: (l: Ledger) => void) => change(fn, ["settings"]);
  const group = (l: Ledger) => l.settings.groups.find((x) => x.id === g.id)!;
  const moveGroup = (dir: -1 | 1) => edit((l) => {
    const gs = l.settings.groups, i = gs.findIndex((x) => x.id === g.id), j = i + dir;
    if (j >= 0 && j < gs.length) [gs[i], gs[j]] = [gs[j], gs[i]];
  });
  const setKind = (kind: Kind) => edit((l) => {
    const x = group(l);
    x.kind = kind;
    if (kind === "income") x.slot = 0;
    else if (!x.slot) x.slot = nextSlot(l.settings.groups);
  });
  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    edit((l) => void l.settings.cats.push({ id: newId("c"), name: name.trim(), group: g.id }));
    setName("");
  };
  return (
    <div className="panel">
      <div className="group-line">
        <Swatch g={g} />
        <TextInput className="gname" value={g.name} label="Group name"
          onCommit={(v) => v.trim() && edit((l) => void (group(l).name = v.trim()))} />
        <select value={g.kind} aria-label="Group type" onChange={(e) => setKind(e.target.value as Kind)}>
          {KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <span className="moves">
          <button className="iconbtn" aria-label="Move group up" disabled={first} onClick={() => moveGroup(-1)}>↑</button>
          <button className="iconbtn" aria-label="Move group down" disabled={last} onClick={() => moveGroup(1)}>↓</button>
        </span>
        {!cats.length && <button className="btn ghost danger" onClick={() => edit((l) => void (l.settings.groups = l.settings.groups.filter((x) => x.id !== g.id)))}>Remove group</button>}
      </div>
      <div className="cat-list">
        {cats.length > 0 && <div className="cat-line head lbl"><span>Category</span><span>Order</span><span>Group</span><span /></div>}
        {cats.map((c, i) => <CategoryLine key={c.id} c={c} first={i === 0} last={i === cats.length - 1} />)}
        <form className="add-line" onSubmit={add}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add a category" aria-label={`New category in ${g.name}`} />
          <button className="btn">Add</button>
        </form>
      </div>
    </div>
  );
}

function CategoryLine({ c, first, last }: { c: Category; first: boolean; last: boolean }) {
  const { book, change } = useApp();
  const edit = (fn: (l: Ledger) => void) => change(fn, ["settings"]);
  const cat = (l: Ledger) => l.settings.cats.find((x) => x.id === c.id)!;
  const move = (dir: -1 | 1) => edit((l) => {
    const cats = l.settings.cats, i = cats.findIndex((x) => x.id === c.id);
    const sibling = dir < 0 ? cats.slice(0, i).reverse().find((x) => x.group === c.group) : cats.slice(i + 1).find((x) => x.group === c.group);
    if (!sibling) return;
    const j = cats.indexOf(sibling);
    [cats[i], cats[j]] = [cats[j], cats[i]];
  });
  const remove = () => edit((l) => {
    l.settings.cats = l.settings.cats.filter((x) => x.id !== c.id);
    l.settings.goals.forEach((g) => (g.cats = g.cats.filter((x) => x !== c.id)));
  });
  return (
    <div className={`cat-line${c.archived ? " archived" : ""}`}>
      <TextInput className="cname" value={c.name} label="Category name" onCommit={(v) => v.trim() && edit((l) => void (cat(l).name = v.trim()))} />
      <span className="moves">
        <button className="iconbtn" aria-label={`Move ${c.name} up`} disabled={first} onClick={() => move(-1)}>↑</button>
        <button className="iconbtn" aria-label={`Move ${c.name} down`} disabled={last} onClick={() => move(1)}>↓</button>
      </span>
      <select className="cgroup" value={c.group} aria-label={`Move ${c.name} to another group`} onChange={(e) => edit((l) => void (cat(l).group = e.target.value))}>
        {book.settings.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
      </select>
      {book.catHasData(c.id) ? (
        <button className="btn ghost cact" title={c.archived ? "Show it again in the month and budget" : "Hide it from new months. Past figures stay"}
          onClick={() => edit((l) => { const x = cat(l); if (x.archived) delete x.archived; else x.archived = true; })}>
          {c.archived ? "Restore" : "Archive"}
        </button>
      ) : (
        <button className="btn ghost danger cact" onClick={remove}>Remove</button>
      )}
    </div>
  );
}
