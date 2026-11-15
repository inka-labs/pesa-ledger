import { useRef, useState, type ReactNode } from "react";
import { importCSV, type ImportResult } from "../model/csv";
import { emptyGroupsSettings, exampleLedger, starterSettings } from "../model/example";
import { thisMonth } from "../model/ledger";
import type { Ledger } from "../model/types";

export function ImportButton({ current, onDone, onError, className, children }: {
  current: Ledger | null;
  onDone: (r: ImportResult) => void;
  onError: (message: string) => void;
  className?: string;
  children: ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);
  const read = (file: File) =>
    file.text().then((text) => {
      try {
        onDone(importCSV(text, current));
      } catch (e) {
        onError((e as Error).message || "That file couldn't be read.");
      }
    });
  return (
    <>
      <button type="button" className={className} onClick={() => input.current?.click()}>{children}</button>
      <input ref={input} type="file" accept=".csv,text/csv" hidden onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) read(f);
        e.target.value = "";
      }} />
    </>
  );
}

export function Welcome({ onStart }: { onStart: (l: Ledger, then: "categories" | "month") => void }) {
  const [error, setError] = useState("");
  return (
    <div className="panel welcome">
      <h2>Set up your ledger</h2>
      <p>
        Budget the months ahead, record what came in and went out, and see each month against its budget and the month before.
        Everything stays on this computer; nothing is sent anywhere.
      </p>
      <div className="choices">
        <button className="choice rec" onClick={() => onStart({ settings: starterSettings(), years: {} }, "categories")}>
          <span className="chip ok">Recommended</span>
          <b>Start with standard categories</b><span>Rent, food, savings, family support and more. Rename or remove any of them before you begin.</span>
        </button>
        <button className="choice" onClick={() => onStart(exampleLedger(thisMonth()), "month")}>
          <b>Look around first</b><span>Two years of made-up figures so you can try every page. Clear them when you're ready to start.</span>
        </button>
      </div>
      <p className="welcome-alt small">
        Or <button className="link" onClick={() => onStart({ settings: emptyGroupsSettings(), years: {} }, "categories")}>build your own categories</button> from empty groups,
        or <ImportButton className="link" current={null} onDone={(r) => onStart(r.ledger, "month")} onError={setError}>import a CSV</ImportButton> (columns: year, month, group, category, amount, note).
      </p>
      {error && <div className="notice err" role="alert">{error}</div>}
    </div>
  );
}
