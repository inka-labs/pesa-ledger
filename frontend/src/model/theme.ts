/** Colours from a palette: the built-in one, or any Matplotlib colormap (palettes.ts).
 *
 *  A palette sets the series colours --s1..--s40 (groups and chart marks, cycling when a palette is
 *  shorter) and, for Matplotlib palettes, the UI accent: the first palette colour that is readable on
 *  the page in that theme (3:1 against the surface), with white or near-black text on it, whichever
 *  reads better. --s0 stays the text colour (income, by default). */

import { MATPLOTLIB, type Palette } from "./palettes";
import type { Group } from "./types";

export type PaletteChoice = Palette & { name: string; dark?: string[] };

/** The built-in palette: eight hues ordered and stepped so neighbours stay apart for colour-blind readers, in both themes. */
export const PESA: PaletteChoice = {
  id: "pesa",
  name: "Pesa",
  family: "Built in",
  colors: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"],
  dark: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"],
};

export const PALETTES: PaletteChoice[] = [PESA, ...MATPLOTLIB.map((p) => ({ ...p, name: p.id }))];
export const FAMILIES = [...new Set(PALETTES.map((p) => p.family))];

export function paletteById(id: string | undefined): PaletteChoice {
  return PALETTES.find((p) => p.id === id) ?? PESA;
}

const SURFACE = { light: "#fcfdfb", dark: "#161c19" };

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** The accent for one theme: the first palette colour readable on that theme's surface, or the most readable one. */
export function accentFor(colors: string[], mode: "light" | "dark"): { accent: string; ink: string } {
  const surface = SURFACE[mode];
  const accent = colors.find((c) => contrast(c, surface) >= 3) ?? [...colors].sort((a, b) => contrast(b, surface) - contrast(a, surface))[0];
  const ink = contrast("#ffffff", accent) >= contrast("#0b0b0b", accent) ? "#ffffff" : "#0b0b0b";
  return { accent, ink };
}

/** Two clearly different colours for comparing two years. */
function pair(p: PaletteChoice, colors: string[]): [string, string] {
  if (p.id === "pesa" || p.family === "Qualitative") return [colors[0], colors[1]];
  return [colors[1] ?? colors[0], colors[Math.max(0, colors.length - 2)]];
}

/** The palette's colours that stand out from this theme's page (1.8:1 or more), in order; all of them if that leaves fewer than three.
 *  Keeps viridis' near-black purple off the dark theme and Set1's yellow off the light one. */
export function usable(colors: string[], mode: "light" | "dark"): string[] {
  const kept = colors.filter((c) => contrast(c, SURFACE[mode]) >= 1.8);
  return kept.length >= 3 ? kept : colors;
}

function block(p: PaletteChoice, all: string[], mode: "light" | "dark"): string {
  const colors = p.id === "pesa" ? all : usable(all, mode);
  const vars = Array.from({ length: 40 }, (_, i) => `--s${i + 1}: ${colors[i % colors.length]};`);
  const [a, b] = pair(p, colors);
  vars.push(`--cmp-a: ${a};`, `--cmp-b: ${b};`);
  if (p.id !== "pesa") {
    const { accent, ink } = accentFor(colors, mode);
    vars.push(`--accent: ${accent};`, `--accent-ink: ${ink};`, `--accent-soft: color-mix(in srgb, ${accent} 18%, var(--surface));`);
  }
  return vars.join(" ");
}

/** CSS for a palette, following the same light / dark / system rules as styles.css. */
export function paletteCSS(id: string | undefined): string {
  const p = paletteById(id);
  const light = block(p, p.colors, "light");
  const dark = block(p, p.dark ?? p.colors, "dark");
  return `:root { ${light} }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { ${dark} } }
:root[data-theme="dark"] { ${dark} }`;
}

export function applyPalette(id: string | undefined) {
  let el = document.getElementById("palette") as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = "palette";
    document.head.appendChild(el);
  }
  el.textContent = paletteCSS(id);
}

/** A group's colour: its own, or its place in the palette (0 = the text colour). */
export function colorOf(g: Pick<Group, "slot" | "color">): string {
  return g.color || `var(--s${g.slot ?? 0})`;
}
