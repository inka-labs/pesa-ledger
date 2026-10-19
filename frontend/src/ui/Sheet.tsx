/** A form that slides in from the right, over the page, so nothing on the page moves while you edit.
 *  Esc, the ✕ or a click outside closes it. */

import { useEffect, type ReactNode } from "react";

export function Sheet({ title, onClose, onSubmit, children, footer }: {
  title: string;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  children: ReactNode;
  footer: ReactNode;
}) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);
  return (
    <div className="sheet-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="sheet" role="dialog" aria-modal="true" aria-label={title} onSubmit={(e) => { e.preventDefault(); onSubmit(e); }}>
        <div className="sheet-h">
          <h3>{title}</h3>
          <button type="button" className="iconbtn" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <div className="sheet-body">{children}</div>
        <div className="sheet-foot">{footer}</div>
      </form>
    </div>
  );
}
