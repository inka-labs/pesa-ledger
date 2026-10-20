import { useApp } from "../context";
import { FAMILIES, PALETTES } from "../model/theme";
import type { Ledger } from "../model/types";
import { ColorPicker } from "../ui/ColorPicker";

const THEMES = [["system", "Match this computer"], ["light", "Light"], ["dark", "Dark"]] as const;
const TINTS = [["off", "Plain"], ["soft", "Soft tint"], ["rich", "Rich tint"]] as const;

export function AppearanceView() {
  const { book, change, theme, setTheme } = useApp();
  const current = book.settings.palette ?? "pesa";
  const tint = book.settings.tint ?? "soft";
  const edit = (fn: (l: Ledger) => void) => change(fn, ["settings"]);
  const resetColours = () => edit((l) => {
    let slot = 1;
    for (const g of l.settings.groups) {
      g.color = null;
      const effect = (l.settings.kinds ?? []).find((k) => k.id === g.kind)?.effect ?? (g.kind === "income" ? "in" : "out");
      g.slot = effect === "in" ? 0 : slot++;
    }
  });

  return (
    <>
      <div className="panel-h"><h2>Appearance</h2><span className="muted">Colours and theme</span></div>
      <div className="cols">
        <div className="panel">
          <h3>Theme</h3>
          <div className="bar" role="radiogroup" aria-label="Theme">
            {THEMES.map(([id, label]) => (
              <label key={id} className="bar small"><input type="radio" name="theme" checked={theme === id} onChange={() => setTheme(id)} /> {label}</label>
            ))}
          </div>
          <h3>Background</h3>
          <div className="seg" role="group" aria-label="Background">
            {TINTS.map(([id, label]) => (
              <button key={id} className={tint === id ? "on" : ""} aria-pressed={tint === id} onClick={() => edit((l) => void (l.settings.tint = id))}>{label}</button>
            ))}
          </div>
          <p className="small muted">How much the palette colours the page, the cards and the borders behind your figures. Text keeps its contrast either way.</p>
        </div>
        <div className="panel">
          <div className="panel-h"><h3>Group colours</h3><div className="end"><button className="btn ghost" onClick={resetColours}>Reset to palette order</button></div></div>
          <div className="gcolors">
            {book.settings.groups.map((g) => (
              <span key={g.id} className="gcolor">
                <ColorPicker g={g} onPick={(p) => edit((l) => Object.assign(l.settings.groups.find((x) => x.id === g.id)!, p))} />
                {g.name}
              </span>
            ))}
          </div>
          <p className="small muted">Groups take their colour from the palette in order. Click a swatch to choose another, or one of your own.</p>
        </div>
      </div>

      <div className="panel">
        <div className="panel-h">
          <h3>Palette</h3>
          <span className="muted small">
            Colours for groups, charts, the app's accent and (with a tint) its background. Every palette except Pesa is one of{" "}
            <a href="https://matplotlib.org/stable/users/explain/colors/colormaps.html" target="_blank" rel="noreferrer">Matplotlib's colormaps</a>.
          </span>
        </div>
        {FAMILIES.map((family) => (
          <div key={family} className="pfamily">
            <span className="lbl">{family}</span>
            <div className="palettes">
              {PALETTES.filter((p) => p.family === family).map((p) => (
                <button key={p.id} type="button" className="pcard" aria-pressed={current === p.id} onClick={() => edit((l) => void (l.settings.palette = p.id))}>
                  <span className="pname">{p.name}{current === p.id && <span className="chip ok">✓ In use</span>}</span>
                  <span className="strip">{p.colors.slice(0, 12).map((c, i) => <i key={i} style={{ background: c }} />)}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
        <p className="small muted">
          Pesa's colours are chosen so neighbouring groups stay distinguishable with colour blindness. Continuous maps like
          viridis shade neighbouring groups alike, so names and legends always sit beside the colours.
        </p>
      </div>
    </>
  );
}
