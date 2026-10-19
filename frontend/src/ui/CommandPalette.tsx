/** Search and jump (⌘K / Ctrl+K): any page, any month ("mar 2025"), any category, or a quick action.
 *  ↑ ↓ to choose, Enter to go, Esc to close. */

import { useEffect, useMemo, useRef, useState } from "react";
import { sectionOf, TABS, useApp, type Tab, type View } from "../context";
import { MONTHS, MONTHS_LONG, prevYM } from "../model/ledger";
import { colorOf } from "../model/theme";

export type Command = { id: string; label: string; hint: string; kind: "Page" | "Month" | "Category" | "Action"; run: () => void; swatch?: string; words?: string };

export function CommandPalette({ onClose, actions }: { onClose: () => void; actions: Command[] }) {
  const { book, go } = useApp();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  useEffect(() => input.current?.focus(), []);

  const all = useMemo(() => {
    const to = (tab: Tab, patch?: Partial<View>) => () => { go(tab, patch); onClose(); };
    const out: Command[] = TABS.map((t) => ({ id: `p:${t.id}`, label: t.label, hint: sectionOf(t.id).label, kind: "Page" as const, run: to(t.id) }));
    // months: the last 13, plus whatever month the search names
    let p = book.today;
    const months: { y: number; m: number }[] = [];
    for (let i = 0; i < 13; i++) { months.push(p); p = prevYM(p); }
    const named = q.toLowerCase().match(/([a-z]{3,9})\s*(\d{4})?/);
    if (named) {
      const k = MONTHS.findIndex((mn) => named[1].startsWith(mn.toLowerCase()));
      const y = named[2] ? Number(named[2]) : book.today.y;
      if (k >= 0 && y > 1900 && y < 3000 && !months.some((x) => x.y === y && x.m === k + 1)) months.unshift({ y, m: k + 1 });
    }
    months.forEach((ym) => out.push({ id: `m:${ym.y}-${ym.m}`, label: `${MONTHS_LONG[ym.m - 1]} ${ym.y}`, hint: "Open month", kind: "Month",
      words: `${MONTHS[ym.m - 1]} ${ym.y}`, run: to("month", { y: ym.y, m: ym.m }) }));
    book.settings.cats.forEach((c) => {
      const g = book.groups[c.group];
      out.push({ id: `c:${c.id}`, label: c.name, hint: `${g?.name ?? ""} · this month`, kind: "Category", swatch: g ? colorOf(g) : undefined,
        run: to("month", { ...book.today, focusCat: c.id }) });
    });
    return [...out, ...actions.map((a) => ({ ...a, run: () => { a.run(); onClose(); } }))];
  }, [book, go, onClose, actions, q]);

  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  // best first: the exact name, then names starting with what's typed, then a word starting with it, then anything containing it
  const rank = (c: Command) => {
    const label = c.label.toLowerCase(), query = words.join(" ");
    if (label === query) return 0;
    if (label.startsWith(query)) return 1;
    if (words.every((w) => label.split(/[\s&/·-]+/).some((part) => part.startsWith(w)))) return 2;
    return 3;
  };
  const shown = (words.length
    ? all
        .filter((c) => { const text = `${c.label} ${c.hint} ${c.kind} ${c.words ?? ""}`.toLowerCase(); return words.every((w) => text.includes(w)); })
        .map((c, i) => ({ c, i, r: rank(c) }))
        .sort((a, b) => a.r - b.r || a.i - b.i)
        .map((x) => x.c)
    : all.filter((c) => c.kind !== "Month" || c.id === `m:${book.today.y}-${book.today.m}`)
  ).slice(0, 40);
  useEffect(() => setSel(0), [q]);
  useEffect(() => { list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" }); }, [sel]);

  const key = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(shown.length - 1, s + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); shown[sel]?.run(); }
    else if (e.key === "Escape") { e.preventDefault(); onClose(); }
  };

  return (
    <div className="cmdk-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cmdk" role="dialog" aria-modal="true" aria-label="Search and jump">
        <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={key}
          placeholder="Search pages, months (mar 2025), categories or actions…" aria-label="Search"
          role="combobox" aria-expanded="true" aria-controls="cmdk-list" aria-activedescendant={shown[sel] ? `cmd-${sel}` : undefined} />
        <ul id="cmdk-list" ref={list} role="listbox">
          {shown.map((c, i) => (
            <li key={c.id} id={`cmd-${i}`} role="option" aria-selected={i === sel} onMouseEnter={() => setSel(i)} onClick={() => c.run()}>
              <span className="kind">{c.kind}</span>
              {c.swatch && <span className="sw" style={{ background: c.swatch }} />}
              <span className="label">{c.label}</span>
              <span className="hint">{c.hint}</span>
            </li>
          ))}
          {!shown.length && <li className="none">Nothing matches “{q}”.</li>}
        </ul>
        <div className="cmdk-foot small muted"><span><kbd>↑</kbd><kbd>↓</kbd> choose</span><span><kbd>Enter</kbd> go</span><span><kbd>Esc</kbd> close</span></div>
      </div>
    </div>
  );
}
