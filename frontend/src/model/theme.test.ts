import { describe, expect, it } from "vitest";
import { accentFor, colorOf, contrast, paletteById, paletteCSS, PALETTES, usable } from "./theme";

describe("palettes", () => {
  it("includes the built-in palette and Matplotlib's", () => {
    expect(PALETTES[0].id).toBe("pesa");
    for (const id of ["viridis", "tab10", "Set2", "coolwarm", "twilight", "turbo"]) expect(paletteById(id).id).toBe(id);
    expect(paletteById("no-such-map").id).toBe("pesa");
    expect(paletteById("tab10").colors[0]).toBe("#1f77b4"); // Matplotlib's own value
  });

  it("picks an accent readable as text on the page in each theme, with readable text on it", () => {
    for (const p of PALETTES) {
      for (const mode of ["light", "dark"] as const) {
        const { accent, ink } = accentFor(p.colors, mode);
        expect(contrast(accent, mode === "light" ? "#fcfdfb" : "#161c19")).toBeGreaterThanOrEqual(4.5);
        expect(contrast(ink, accent)).toBeGreaterThanOrEqual(3);
      }
    }
    // a pale palette's accent is deepened from its own colour rather than swapped for another
    expect(contrast(accentFor(paletteById("Set2").colors, "light").accent, "#fcfdfb")).toBeGreaterThanOrEqual(4.5);
    // viridis: dark purple on a light page, a lighter green-yellow on a dark one
    expect(accentFor(paletteById("viridis").colors, "light").accent).toBe("#440154");
    expect(contrast(accentFor(paletteById("viridis").colors, "dark").accent, "#161c19")).toBeGreaterThanOrEqual(3);
  });

  it("writes series colours for both themes, cycling short palettes", () => {
    const css = paletteCSS("Dark2"); // eight colours, all readable on both themes
    expect(css).toContain("--s1: #1b9e77;");
    expect(css).toContain("--s9: #1b9e77;");
    expect(css).toContain('[data-theme="dark"]');
    expect(paletteCSS("pesa")).not.toContain("--accent:"); // the built-in palette keeps the app's green
    // a tint colours the page from the accent; plain leaves it alone
    expect(paletteCSS("viridis", "soft")).toMatch(/--bg: #[0-9a-f]{6};/);
    expect(paletteCSS("viridis", "off")).not.toContain("--bg:");
  });

  it("leaves out colours that would vanish against the page", () => {
    const [light, dark] = paletteCSS("Set1").split("@media");
    expect(light).not.toContain("#ffff33"); // yellow on white
    expect(dark).toContain("#ffff33");
    const viridis = paletteById("viridis").colors;
    expect(usable(viridis, "dark")).not.toContain("#440154"); // near-black purple on the dark page
    expect(usable(viridis, "light")).toContain("#440154");
  });

  it("uses a group's own colour before its palette place", () => {
    expect(colorOf({ slot: 3 })).toBe("var(--s3)");
    expect(colorOf({ slot: 3, color: "#aa3377" })).toBe("#aa3377");
  });
});
