/** A form that slides in from the right, over the page, so nothing on the page moves while you edit.
 *  Esc, the ✕ or a click outside closes it. Focus moves into it, Tab stays inside it, and focus goes
 *  back where it was when it closes. An Esc something inside already handled (an amount box putting
 *  its figure back, the search box on top) doesn't also close it. */

import { useEffect, useRef, type ReactNode } from "react";

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Keep keyboard focus inside `el` while it's open and put it back afterwards. */
export function useDialogFocus(ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const before = document.activeElement as HTMLElement | null;
    const items = () => [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.offsetParent !== null || x === document.activeElement);
    if (!el.contains(document.activeElement)) (el.querySelector<HTMLElement>(".sheet-body :is(input, select, textarea):not([disabled])") ?? items()[0] ?? el).focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const all = items();
      if (!all.length) return;
      const first = all[0], last = all[all.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    el.addEventListener("keydown", trap);
    return () => {
      el.removeEventListener("keydown", trap);
      if (before && document.contains(before)) before.focus();
    };
  }, [ref]);
}

export function Sheet({ title, onClose, onSubmit, children, footer }: {
  title: string;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  children: ReactNode;
  footer: ReactNode;
}) {
  const form = useRef<HTMLFormElement>(null);
  useDialogFocus(form);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && !e.defaultPrevented && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);
  return (
    <div className="sheet-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form ref={form} tabIndex={-1} className="sheet" role="dialog" aria-modal="true" aria-label={title} onSubmit={(e) => { e.preventDefault(); onSubmit(e); }}>
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
