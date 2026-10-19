/** The ledger in memory, and saving it to disk.
 *
 *  A change updates the screen at once and marks what it touched ("settings" or "y:2026"). Shortly
 *  after the last change, each touched part is written to the local API, one at a time. Nothing
 *  waits on the network to show a figure, and leaving the page with unsaved changes asks first. */

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, normalise, type Stored } from "./api";
import type { Ledger } from "./model/types";

export type LoadState = { kind: "loading" } | { kind: "signedout"; message: string } | { kind: "failed"; message: string } | { kind: "ready" };
export type SaveState = { kind: "idle" | "saving" | "saved" } | { kind: "error"; message: string };

const DELAY = 500;
const HISTORY = 50;

export function useLedger() {
  const [load, setLoad] = useState<LoadState>({ kind: "loading" });
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  const latest = useRef<Ledger | null>(null);
  const dirty = useRef(new Set<string>());
  const timer = useRef<number | undefined>(undefined);
  const flushing = useRef(false);
  // earlier versions of the ledger, newest last, for Undo
  const history = useRef<Ledger[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const remember = (l: Ledger | null) => {
    if (!l) return;
    history.current.push(l);
    if (history.current.length > HISTORY) history.current.shift();
    setCanUndo(true);
  };

  const accept = useCallback((stored: Stored) => {
    const l = normalise(stored);
    latest.current = l;
    setLedger(l);
  }, []);

  const reload = useCallback(async () => {
    try {
      accept(await api.ledger());
      setLoad({ kind: "ready" });
    } catch (e) {
      const err = e as ApiError;
      setLoad(err.status === 401 ? { kind: "signedout", message: err.message } : { kind: "failed", message: err.message });
    }
  }, [accept]);

  useEffect(() => {
    reload();
  }, [reload]);

  const flush = useCallback(async () => {
    if (flushing.current) {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, DELAY);
      return;
    }
    flushing.current = true;
    setSave({ kind: "saving" });
    try {
      while (dirty.current.size) {
        const key = dirty.current.values().next().value as string;
        dirty.current.delete(key);
        const l = latest.current;
        if (!l) continue;
        try {
          if (key === "settings") await api.putSettings(l.settings);
          else {
            const y = key.slice(2);
            if (l.years[y]) await api.putYear(y, l.years[y]);
            else await api.deleteYear(y);
          }
        } catch (e) {
          dirty.current.add(key); // keep it, so the next change retries it
          const err = e as ApiError;
          if (err.status === 401) setLoad({ kind: "signedout", message: err.message });
          setSave({ kind: "error", message: err.message || "The last change wasn't saved." });
          return;
        }
      }
      setSave({ kind: "saved" });
    } finally {
      flushing.current = false;
    }
  }, []);

  const schedule = useCallback(() => {
    setSave({ kind: "saving" });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, DELAY);
  }, [flush]);

  /** Change the ledger in place on a copy; `touches` names what to save ("settings", "y:2026"). */
  const change = useCallback(
    (mutate: (draft: Ledger) => void, touches: string[]) => {
      if (!latest.current) return;
      const next = structuredClone(latest.current);
      mutate(next);
      // a change that changes nothing isn't saved or remembered (so Undo always undoes something)
      if (JSON.stringify(next) === JSON.stringify(latest.current)) return;
      remember(latest.current);
      latest.current = next;
      setLedger(next);
      touches.forEach((k) => dirty.current.add(k));
      schedule();
    },
    [schedule],
  );

  /** Swap the whole ledger (start, import, example): saves settings and every year, deleting years it no longer has. */
  const replace = useCallback(
    (next: Ledger) => {
      const before = Object.keys(latest.current?.years ?? {});
      remember(latest.current);
      latest.current = next;
      setLedger(next);
      dirty.current.add("settings");
      [...before, ...Object.keys(next.years)].forEach((y) => dirty.current.add(`y:${y}`));
      schedule();
    },
    [schedule],
  );

  /** Put back the ledger as it was before the last change, and save whatever that touches. */
  const undo = useCallback(() => {
    const prev = history.current.pop();
    setCanUndo(history.current.length > 0);
    if (!prev || !latest.current) return false;
    const now = latest.current;
    latest.current = prev;
    setLedger(prev);
    if (JSON.stringify(prev.settings) !== JSON.stringify(now.settings)) dirty.current.add("settings");
    for (const y of new Set([...Object.keys(prev.years), ...Object.keys(now.years)]))
      if (JSON.stringify(prev.years[y]) !== JSON.stringify(now.years[y])) dirty.current.add(`y:${y}`);
    schedule();
    return true;
  }, [schedule]);

  /** Restoring a backup: the server already wrote it, so just show it. */
  const restored = useCallback(
    (stored: Stored) => {
      dirty.current.clear();
      history.current = [];
      setCanUndo(false);
      accept(stored);
      setSave({ kind: "saved" });
    },
    [accept],
  );

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty.current.size || flushing.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  return { load, ledger, save, change, replace, restored, undo, canUndo, retry: flush, reload };
}
