/** The ledger in memory, and saving it to disk.
 *
 *  A change updates the screen at once and marks what it touched ("settings" or "y:2026"). Shortly
 *  after the last change, each touched part is written to the local API, one at a time. Nothing
 *  waits on the network to show a figure, and leaving the page with unsaved changes asks first. */

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, normalise, type Stored } from "./api";
import type { Ledger } from "./model/types";
import { Saver, type SaveState } from "./saver";

export type { SaveState };

export type LoadState = { kind: "loading" } | { kind: "signedout"; message: string } | { kind: "failed"; message: string } | { kind: "ready" };
/** `signedOut`: the browser lost its sign-in while saving. The ledger stays on screen with the changes in it;
 *  signing in again in another tab and pressing Try again saves them. */
const HISTORY = 50;

export function useLedger() {
  const [load, setLoad] = useState<LoadState>({ kind: "loading" });
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  const latest = useRef<Ledger | null>(null);
  const saver = useRef<Saver | null>(null);
  saver.current ??= new Saver(async (key) => {
    const l = latest.current;
    if (!l) return;
    if (key === "settings") await api.putSettings(l.settings);
    else {
      const y = key.slice(2);
      if (l.years[y]) await api.putYear(y, l.years[y]);
      else await api.deleteYear(y);
    }
  }, setSave);
  const saves = saver.current;
  const [problems, setProblems] = useState<string[]>([]);
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
    setProblems(stored.problems ?? []);
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

  const flush = useCallback(() => saves.flush(), [saves]);

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
      saves.touch(...touches);
    },
    [saves],
  );

  /** Swap the whole ledger (start, import, example): saves settings and every year, deleting years it no longer has. */
  const replace = useCallback(
    (next: Ledger) => {
      const before = Object.keys(latest.current?.years ?? {});
      remember(latest.current);
      latest.current = next;
      setLedger(next);
      saves.touch("settings", ...[...before, ...Object.keys(next.years)].map((y) => `y:${y}`));
    },
    [saves],
  );

  /** Put back the ledger as it was before the last change, and save whatever that touches. */
  const undo = useCallback(() => {
    const prev = history.current.pop();
    setCanUndo(history.current.length > 0);
    if (!prev || !latest.current) return false;
    const now = latest.current;
    latest.current = prev;
    setLedger(prev);
    const touched: string[] = [];
    if (JSON.stringify(prev.settings) !== JSON.stringify(now.settings)) touched.push("settings");
    for (const y of new Set([...Object.keys(prev.years), ...Object.keys(now.years)]))
      if (JSON.stringify(prev.years[y]) !== JSON.stringify(now.years[y])) touched.push(`y:${y}`);
    saves.touch(...touched);
    return true;
  }, [saves]);

  /** Restoring a backup: the server already wrote it, so just show it. */
  const restored = useCallback(
    (stored: Stored) => {
      saves.clear();
      history.current = [];
      setCanUndo(false);
      accept(stored);
      setSave({ kind: "saved" });
    },
    [accept],
  );

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (saves.pending) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saves]);

  return { load, ledger, save, change, replace, restored, undo, canUndo, retry: flush, saveNow: flush, reload, problems };
}
