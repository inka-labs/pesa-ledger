/** Everything beyond the everyday three: one card per page, with what it's for. */

import { ABOUT, SECTIONS } from "../context";
import { TAB_ICON } from "../ui/icons";

export function MoreView() {
  const tabs = SECTIONS.find((s) => s.id === "more")!.tabs;
  return (
    <>
      <div className="panel-h"><h2>More</h2><span className="muted">Reports and planning tools, when you want them</span></div>
      <div className="more-cards">
        {tabs.map((t) => {
          const Icon = TAB_ICON[t.id];
          return (
            <a key={t.id} className="more-card" href={`#${t.id}`}>
              <Icon size={20} strokeWidth={1.8} aria-hidden />
              <span><b>{t.label}</b><span className="muted small">{ABOUT[t.id]}</span></span>
            </a>
          );
        })}
      </div>
    </>
  );
}
