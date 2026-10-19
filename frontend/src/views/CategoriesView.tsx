import { useState } from "react";
import { useApp } from "../context";
import { newId, nextSlot } from "../model/csv";
import { EFFECTS, kindsOf } from "../model/ledger";
import type { Category, Effect, Group, Ledger } from "../model/types";
import { ColorPicker } from "../ui/ColorPicker";
import { TextInput } from "../ui/bits";

export function CategoriesView() {
  const { book, change, view } = useApp();
  const kinds = book.kindList();
  const [name, setName] = useState("");
  const [kind, setKind] = useState(kinds.find((k) => k.effect === "out")?.id ?? kinds[0].id);
  const edit = (fn: (l: Ledger) => void) => change(fn, ["settings"]);
  const addGroup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const effect = book.kinds[kind]?.effect;
    edit((l) => void l.settings.groups.push({ id: newId("g"), name: name.trim(), kind, slot: effect === "in" ? 0 : nextSlot(l.settings.groups) }));
    setName("");
  };
  return (
    <>
      <div className="panel-h"><h2>Categories</h2><span className="muted">Shape the ledger around how you earn, save and spend</span></div>
      {view.catHint && <div className="notice">These are starter categories. Rename them, remove the ones you don't use and add your own. Then set amounts on the Budget tab.</div>}
      <KindsPanel />
      <div className="catgroups">
        {book.settings.groups.map((g, i) => <GroupPanel key={g.id} g={g} first={i === 0} last={i === book.settings.groups.length - 1} />)}
        <form className="panel" onSubmit={addGroup}>
          <h3>Add a group</h3>
          <div className="add-line">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Business, Children, Loans" aria-label="New group name" />
            <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="New group type">
              {kinds.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
            </select>
            <button className="btn">Add group</button>
          </div>
        </form>
      </div>
    </>
  );
}

/** The types groups can have. Each says how its figures count; add as many as you like. */
function KindsPanel() {
  const { book, change } = useApp();
  const kinds = book.kindList();
  const [name, setName] = useState("");
  const [effect, setEffect] = useState<Effect>("out");
  const used = (id: string) => book.settings.groups.some((g) => g.kind === id);
  const edit = (fn: (l: Ledger) => void) => change((l) => { l.settings.kinds = structuredClone(kindsOf(l.settings)); fn(l); }, ["settings"]);
  const kindIn = (l: Ledger, id: string) => l.settings.kinds!.find((k) => k.id === id)!;
  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    edit((l) => void l.settings.kinds!.push({ id: newId("k"), name: name.trim(), effect }));
    setName("");
  };
  return (
    <div className="panel">
      <div className="panel-h"><h3>Group types</h3><span className="muted small">Every group has a type. The type decides how its figures count.</span></div>
      <div className="kinds">
        {kinds.map((k) => (
          <div className="kind-line" key={k.id}>
            <TextInput value={k.name} label="Type name" onCommit={(v) => v.trim() && edit((l) => void (kindIn(l, k.id).name = v.trim()))} />
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
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New type, e.g. Investments, Debt repayment" aria-label="New type name" />
          <select value={effect} onChange={(e) => setEffect(e.target.value as Effect)} aria-label="How the new type counts">
            {EFFECTS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
          </select>
          <span className="small muted help">{EFFECTS.find((x) => x.id === effect)?.help}</span>
          <button className="btn">Add type</button>
        </form>
      </div>
    </div>
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
  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    edit((l) => void l.settings.cats.push({ id: newId("c"), name: name.trim(), group: g.id }));
    setName("");
  };
  return (
    <div className="panel">
      <div className="group-line">
        <ColorPicker g={g} onPick={(p) => edit((l) => Object.assign(group(l), p))} />
        <TextInput className="gname" value={g.name} label="Group name"
          onCommit={(v) => v.trim() && edit((l) => void (group(l).name = v.trim()))} />
        <select value={g.kind} aria-label="Group type" onChange={(e) => edit((l) => void (group(l).kind = e.target.value))}>
          {book.kindList().map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
          {!book.kinds[g.kind] && <option value={g.kind}>Removed type</option>}
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
