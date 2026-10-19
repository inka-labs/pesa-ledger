/** How the search shortcut is written on this computer: ⌘K on a Mac, Ctrl K elsewhere. */
export const SEARCH_KEY = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? "⌘K" : "Ctrl K";
export const UNDO_KEY = SEARCH_KEY === "⌘K" ? "⌘Z" : "Ctrl Z";
