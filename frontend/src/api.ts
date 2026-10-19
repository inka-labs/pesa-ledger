/** The ledger's local HTTP API. Every call carries the session cookie (same origin); a 401 means
 *  the browser isn't signed in, which App shows as such. */

import type { Rates } from "./model/money";
import type { Ledger, Settings, YearDoc } from "./model/types";

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let r: Response;
  try {
    r = await fetch(path, { credentials: "same-origin", headers: { "Content-Type": "application/json" }, ...init });
  } catch {
    throw new ApiError(0, "Pesa Ledger isn't running. Start it again with `pixi run open`.");
  }
  if (!r.ok) {
    let detail = "";
    try {
      detail = (await r.json()).detail;
    } catch {
      /* not JSON */
    }
    throw new ApiError(r.status, detail || r.statusText);
  }
  return (r.status === 204 ? undefined : await r.json()) as T;
}

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

export type Version = { version: string; name: string; platform: string; home: string; autostart: { supported: boolean; enabled: boolean } };
export type Stored = { settings: Settings | null; years: Record<string, Partial<YearDoc>> };
export type Backup = { name: string; kind: string; taken: string; years: string[]; size: number };

export const api = {
  version: () => call<Version>("/api/version"),
  ledger: () => call<Stored>("/api/ledger"),
  putSettings: (s: Settings) => call<Settings>("/api/settings", json("PUT", s)),
  putYear: (y: string, doc: YearDoc) => call<YearDoc>(`/api/years/${y}`, json("PUT", doc)),
  deleteYear: (y: string) => call<void>(`/api/years/${y}`, { method: "DELETE" }),
  backups: () => call<{ backups: Backup[]; folder: string }>("/api/backups"),
  backupNow: () => call<{ name: string }>("/api/backups", { method: "POST" }),
  restore: (name: string) => call<Stored>(`/api/backups/${encodeURIComponent(name)}/restore`, { method: "POST" }),
  rates: (base: string, refresh = false) => call<Rates>(`/api/rates?base=${encodeURIComponent(base)}${refresh ? "&refresh=true" : ""}`),
  reveal: () => call<void>("/api/reveal", { method: "POST" }),
  quit: () => call<void>("/api/quit", { method: "POST" }),
  setAutostart: (enabled: boolean) => call<{ enabled: boolean; message: string }>("/api/autostart", json("PUT", { enabled })),
};

export function normalise(stored: Stored): Ledger | null {
  if (!stored.settings) return null;
  const years: Ledger["years"] = {};
  for (const [y, d] of Object.entries(stored.years))
    years[y] = { actual: d.actual ?? {}, budget: d.budget ?? {}, plan: d.plan ?? {}, notes: d.notes ?? {}, oneoff: d.oneoff ?? {} };
  return { settings: { ...stored.settings, goals: stored.settings.goals ?? [] }, years };
}
