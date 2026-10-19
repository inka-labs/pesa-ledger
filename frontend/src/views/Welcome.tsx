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
        Pesa Ledger tracks a household budget the way a careful spreadsheet does. Budget the months ahead, then record what came in
        and went out: income, savings, family support, essentials and sinking funds. See each month against its budget, the month
        before and the same month last year.
      </p>
      <p>Everything stays on this computer. Nothing is sent anywhere.</p>
      <div className="choices">
        <button className="choice" onClick={() => onStart({ settings: starterSettings(), years: {} }, "categories")}>
          <b>Start with standard categories</b><span>Rent, food, savings, family support and more. Rename or remove any of them before you begin.</span>
        </button>
        <button className="choice" onClick={() => onStart({ settings: emptyGroupsSettings(), years: {} }, "categories")}>
          <b>Build my own categories</b><span>Start with empty groups for income, savings and spending, and add only what you use.</span>
        </button>
        <button className="choice" onClick={() => onStart(exampleLedger(thisMonth()), "month")}>
          <b>Explore with example figures</b><span>Two years of made-up numbers so you can try every view. Clear them when you're ready.</span>
        </button>
        <ImportButton className="choice" current={null} onDone={(r) => onStart(r.ledger, "month")} onError={setError}>
          <b>Import a CSV</b><span>Bring in figures from a spreadsheet. Columns: year, month, group, category, amount, note.</span>
        </ImportButton>
      </div>
      {error && <div className="notice err" role="alert">{error}</div>}
    </div>
  );
}
