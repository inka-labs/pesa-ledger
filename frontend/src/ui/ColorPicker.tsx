/** Pick a group's colour: a place in the current palette, the text colour, or any colour of your own.
 *  No two groups share a colour: ones already taken are crossed out and can't be picked. */

import { useEffect, useRef, useState } from "react";
import { useApp } from "../context";
import { colorOf, paletteById, resolvedColor } from "../model/theme";
import type { Group } from "../model/types";

export function ColorPicker({ g, onPick }: { g: Group; onPick: (p: { slot: number; color: string | null }) => void }) {
  const { book, notify } = useApp();
  const ref = useRef<HTMLDetailsElement>(null);
  // the colour well fires on every step of a drag: show it as it moves, save once when it's let go
  // (one Undo step, one save)
  const well = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const n = Math.min(20, paletteById(book.settings.palette).colors.length);
  // the colour each other group shows, so a taken one can be crossed out
  const takenBy = new Map<string, string>();
  for (const o of book.settings.groups) if (o.id !== g.id) takenBy.set(resolvedColor(o), o.name);
  const owner = (p: { slot: number; color: string | null }) => takenBy.get(resolvedColor(p));
  const pick = (p: { slot: number; color: string | null }) => {
    const who = owner(p);
    if (who) { notify(`${who} already uses that colour. Each group needs its own.`); return; }
    onPick(p);
    if (ref.current) ref.current.open = false;
  };
  const commit = useRef<() => void>(() => undefined);
  commit.current = () => {
    if (draft == null) return;
    setDraft(null);
    if (draft.toLowerCase() === (g.color ?? "").toLowerCase()) return;
    const p = { slot: g.slot, color: draft };
    const who = owner(p);
    if (who) notify(`${who} already uses that colour. Each group needs its own.`); else onPick(p);
  };
  useEffect(() => {
    const el = well.current;
    if (!el) return;
    const done = () => commit.current();
    el.addEventListener("change", done); // the native change event: the picker was closed or let go
    el.addEventListener("blur", done);
    return () => { el.removeEventListener("change", done); el.removeEventListener("blur", done); };
  }, []);
  return (
    <details className="cpick" ref={ref}>
      <summary aria-label={`Colour for ${g.name}`} title="Change colour"><span className="sw big" style={{ background: draft ?? colorOf(g) }} /></summary>
      <div className="pop" role="group" aria-label={`Colours for ${g.name}`}>
        <span className="lbl">From the palette</span>
        <div className="swatches">
          {Array.from({ length: n }, (_, i) => i + 1).map((slot) => (
            <Swb key={slot} label={`Palette colour ${slot}`} on={!g.color && g.slot === slot} bg={`var(--s${slot})`} taken={owner({ slot, color: null })} onClick={() => pick({ slot, color: null })} />
          ))}
          <Swb label="Text colour" on={!g.color && g.slot === 0} bg="var(--s0)" taken={owner({ slot: 0, color: null })} onClick={() => pick({ slot: 0, color: null })} />
        </div>
        <label className="bar small">
          <span>Your own colour</span>
          <input type="color" ref={well} value={draft ?? (g.color || "#1d6b4f")} onChange={(e) => setDraft(e.target.value)} />
        </label>
      </div>
    </details>
  );
}

function Swb({ label, on, bg, taken, onClick }: { label: string; on: boolean; bg: string; taken?: string; onClick: () => void }) {
  return (
    <button type="button" className={`swb${taken ? " taken" : ""}`} aria-label={taken ? `${label}, used by ${taken}` : label} aria-pressed={on}
      aria-disabled={!!taken || undefined} title={taken ? `Used by ${taken}` : undefined} style={{ background: bg }} onClick={onClick} />
  );
}
