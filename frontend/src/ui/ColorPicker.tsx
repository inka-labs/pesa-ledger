/** Pick a group's colour: a place in the current palette, the text colour, or any colour of your own. */

import { useRef } from "react";
import { useApp } from "../context";
import { colorOf, paletteById } from "../model/theme";
import type { Group } from "../model/types";

export function ColorPicker({ g, onPick }: { g: Group; onPick: (p: { slot: number; color: string | null }) => void }) {
  const { book } = useApp();
  const ref = useRef<HTMLDetailsElement>(null);
  const n = Math.min(20, paletteById(book.settings.palette).colors.length);
  const pick = (p: { slot: number; color: string | null }) => {
    onPick(p);
    if (ref.current) ref.current.open = false;
  };
  return (
    <details className="cpick" ref={ref}>
      <summary aria-label={`Colour for ${g.name}`} title="Change colour"><span className="sw big" style={{ background: colorOf(g) }} /></summary>
      <div className="pop" role="group" aria-label={`Colours for ${g.name}`}>
        <span className="lbl">From the palette</span>
        <div className="swatches">
          {Array.from({ length: n }, (_, i) => i + 1).map((slot) => (
            <button key={slot} type="button" className="swb" aria-label={`Palette colour ${slot}`} aria-pressed={!g.color && g.slot === slot}
              style={{ background: `var(--s${slot})` }} onClick={() => pick({ slot, color: null })} />
          ))}
          <button type="button" className="swb" aria-label="Text colour" aria-pressed={!g.color && g.slot === 0}
            style={{ background: "var(--s0)" }} onClick={() => pick({ slot: 0, color: null })} />
        </div>
        <label className="bar small">
          <span>Your own colour</span>
          <input type="color" value={g.color || "#1d6b4f"} onChange={(e) => onPick({ slot: g.slot, color: e.target.value })} />
        </label>
      </div>
    </details>
  );
}
