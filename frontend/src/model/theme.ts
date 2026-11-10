/** Colours from a palette: the built-in one, or any Matplotlib colormap (palettes.ts).
 *
 *  The palette also tints the page: the background, cards, sunken areas and borders take a little of its
 *  accent (more with tint "rich", none with "off"), and a soft glow of its first two colours sits at the top
 *  of the page. The mixes are worked out here rather than with CSS color-mix, because the charts read these
 *  colours and Plotly needs real ones. Text colours aren't tinted, so contrast doesn't change.
 *
 *  A palette sets the series colours --s1..--s40 (groups and chart marks, cycling when a palette is
 *  shorter) and, for Matplotlib palettes, the UI accent: the first palette colour that is readable on
 *  the page in that theme (3:1 against the surface), with white or near-black text on it, whichever
 *  reads better. --s0 stays the text colour (income, by default). */

import { MATPLOTLIB, type Palette } from "./palettes";
import type { Group, Tint } from "./types";

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
const PESA_ACCENT = { light: "#1d6b4f", dark: "#4fbf8f" };

/** Neutral page colours each tint starts from, per theme (styles.css holds the untinted Pesa ones). */
const NEUTRAL = {
  light: { bg: "#f3f5f4", surface: "#ffffff", sunk: "#eef1ef", line: "#e3e7e4" },
  dark: { bg: "#0f1211", surface: "#181c1a", sunk: "#202523", line: "#2b302e" },
};
/** How much of the accent each one takes: [bg, surface, sunk, line, glow]. */
const TINT: Record<Exclude<Tint, "off">, Record<"light" | "dark", number[]>> = {
  // a flat canvas and plain cards (the dashboard look): soft only hints at the accent, with no glow
  soft: { light: [0.03, 0, 0.05, 0.06, 0], dark: [0.04, 0.02, 0.05, 0.08, 0] },
  rich: { light: [0.14, 0.05, 0.16, 0.2, 0.18], dark: [0.13, 0.08, 0.14, 0.2, 0.17] },
};

const hex2 = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0");
/** `a` mixed into `b` by `t` (0 = b, 1 = a), as a hex colour. */
export function mix(a: string, b: string, t: number): string {
  const p = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  return `#${[0, 1, 2].map((i) => hex2(p(a, i) * t + p(b, i) * (1 - t))).join("")}`;
}
const rgba = (h: string, a: number) => `rgba(${parseInt(h.slice(1, 3), 16)}, ${parseInt(h.slice(3, 5), 16)}, ${parseInt(h.slice(5, 7), 16)}, ${a})`;

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
  let accent = colors.find((c) => contrast(c, surface) >= 3) ?? [...colors].sort((a, b) => contrast(b, surface) - contrast(a, surface))[0];
  // the accent also colours text (links, headline figures), so it's deepened (or lightened on dark) to 4.5:1
  const toward = mode === "light" ? "#000000" : "#ffffff";
  for (let i = 0; i < 20 && contrast(accent, surface) < 4.5; i++) accent = mix(toward, accent, 0.08);
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

function block(p: PaletteChoice, all: string[], mode: "light" | "dark", tint: Tint): string {
  const colors = p.id === "pesa" ? all : usable(all, mode);
  const vars = Array.from({ length: 40 }, (_, i) => `--s${i + 1}: ${colors[i % colors.length]};`);
  const [a, b] = pair(p, colors);
  vars.push(`--cmp-a: ${a};`, `--cmp-b: ${b};`);
  const accent = p.id === "pesa" ? PESA_ACCENT[mode] : accentFor(colors, mode).accent;
  if (p.id !== "pesa") vars.push(`--accent: ${accent};`, `--accent-ink: ${accentFor(colors, mode).ink};`);
  if (tint !== "off") {
    const n = NEUTRAL[mode], [tb, ts, tk, tl, tg] = TINT[tint][mode];
    const surface = mix(accent, n.surface, ts);
    vars.push(
      `--bg: ${mix(accent, n.bg, tb)};`, `--surface: ${surface};`, `--sunk: ${mix(accent, n.sunk, tk)};`, `--line: ${mix(accent, n.line, tl)};`,
      `--accent-soft: ${mix(accent, surface, mode === "dark" ? 0.2 : 0.16)};`,
      `--glow: radial-gradient(900px 420px at 12% -8%, ${rgba(colors[0], tg)}, transparent 70%), radial-gradient(800px 380px at 92% -10%, ${rgba(colors[1] ?? colors[0], tg * 0.8)}, transparent 70%);`,
    );
  } else if (p.id !== "pesa") {
    vars.push(`--accent-soft: ${mix(accent, SURFACE[mode], 0.18)};`);
  }
  return vars.join(" ");
}

/** CSS for a palette, following the same light / dark / system rules as styles.css. */
export function paletteCSS(id: string | undefined, tint: Tint = "soft"): string {
  const p = paletteById(id);
  const light = block(p, p.colors, "light", tint);
  const dark = block(p, p.dark ?? p.colors, "dark", tint);
  return `:root { ${light} }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { ${dark} } }
:root[data-theme="dark"] { ${dark} }`;
}

export function applyPalette(id: string | undefined, tint: Tint = "soft") {
  let el = document.getElementById("palette") as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = "palette";
    document.head.appendChild(el);
  }
  el.textContent = paletteCSS(id, tint);
}

/** The colour a group shows right now, as lower-case hex (its own, or its palette place read from the page). */
export function resolvedColor(g: Pick<Group, "slot" | "color">): string {
  if (g.color) return g.color.toLowerCase();
  if (typeof document === "undefined") return `slot:${g.slot}`;
  return getComputedStyle(document.documentElement).getPropertyValue(`--s${g.slot ?? 0}`).trim().toLowerCase() || `slot:${g.slot}`;
}

/** A group's colour: its own, or its place in the palette (0 = the text colour). */
export function colorOf(g: Pick<Group, "slot" | "color">): string {
  return g.color || `var(--s${g.slot ?? 0})`;
}
