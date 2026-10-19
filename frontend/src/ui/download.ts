/** Save text as a file through the browser's own download. */

import { mk, thisMonth } from "../model/ledger";

export function downloadText(name: string, text: string, type = "text/csv") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadCSV(csv: string) {
  const t = thisMonth();
  downloadText(`pesa-ledger-${t.y}-${mk(t.m)}.csv`, csv);
}
