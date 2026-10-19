/** Which groups are folded away in a table, remembered in this browser under `key`. */

import { useCallback, useState } from "react";

export function useFolded(key: string) {
  const storeKey = `pesa-ledger.folded.${key}`;
  const [folded, setFolded] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(storeKey) || "[]")); } catch { return new Set(); }
  });
  // every change builds on the latest set (two quick clicks both count) and is remembered
  const update = useCallback((next: (s: Set<string>) => Set<string>) => {
    setFolded((prev) => {
      const s = next(prev);
      try { localStorage.setItem(storeKey, JSON.stringify([...s])); } catch { /* private window */ }
      return s;
    });
  }, [storeKey]);
  const toggle = useCallback((id: string) => update((prev) => {
    const s = new Set(prev);
    if (s.has(id)) s.delete(id); else s.add(id);
    return s;
  }), [update]);
  const setAll = useCallback((ids: string[], fold: boolean) => update(() => new Set(fold ? ids : [])), [update]);
  return { folded, toggle, setAll };
}
