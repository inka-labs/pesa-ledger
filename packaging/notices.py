"""Write THIRD_PARTY_NOTICES.md: every package the ledger ships with and its licence. The Python
packages and runtime libraries come from the environment; the page's JavaScript and fonts from
frontend/node_modules (only what's bundled into the page, not build tools). Run by build_release.py, or:

    pixi run python packaging/notices.py
"""

import json
import re
import sys
from importlib.metadata import distributions
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
OUT = REPO / "THIRD_PARTY_NOTICES.md"
CHECK = re.compile(r"\b(A?GPL|LGPL|MPL|EPL|CDDL|SSPL|CC-BY-NC|Commons Clause)", re.I)
NOT_SHIPPED = {"pytest", "nodejs", "pesa-ledger", "pesa_ledger"}  # for building and testing, or the ledger itself


def licence(dist) -> str:
    meta = dist.metadata
    if meta.get("License-Expression"):
        return meta["License-Expression"].strip()
    classifiers = sorted({c.split("::")[-1].strip() for c in meta.get_all("Classifier") or []
                          if c.startswith("License ::") and not c.endswith("OSI Approved")})
    if classifiers:
        return "; ".join(classifiers)
    text = (meta.get("License") or "").strip()
    return text.splitlines()[0][:80] if text and text.upper() != "UNKNOWN" else "not stated"


def python_packages() -> list[tuple[str, str, str]]:
    rows = {(d.metadata["Name"], d.version, licence(d)) for d in distributions()
            if d.metadata["Name"] and d.metadata["Name"].lower() not in NOT_SHIPPED}
    names = {n.lower() for n, _, _ in rows}
    for meta in (Path(sys.prefix) / "conda-meta").glob("*.json"):  # Python itself, OpenSSL, libraries...
        try:
            data = json.loads(meta.read_text())
        except (OSError, ValueError):
            continue
        name = data.get("name", meta.stem)
        if name in NOT_SHIPPED or name.lower() in names:
            continue
        rows.add((name, data.get("version", ""), data.get("license") or "not stated"))
    return sorted(rows, key=lambda r: r[0].lower())


def page_packages() -> list[tuple[str, str, str]]:
    """What's bundled into the page: the runtime dependencies in frontend/package.json."""
    pkg = json.loads((REPO / "frontend" / "package.json").read_text())
    rows = []
    for name in sorted(pkg.get("dependencies", {})):
        meta = REPO / "frontend" / "node_modules" / name / "package.json"
        data = json.loads(meta.read_text()) if meta.is_file() else {}
        lic = data.get("license") or "not stated"
        rows.append((name, data.get("version", pkg["dependencies"][name]), lic if isinstance(lic, str) else lic.get("type", "not stated")))
    return rows


def main() -> None:
    py, page = python_packages(), page_packages()
    look = [r for r in py + page if CHECK.search(r[2]) or r[2] == "not stated"]
    table = lambda rows: ["| Package | Version | Licence |", "|---|---|---|", *[f"| {n} | {v} | {lic} |" for n, v, lic in rows], ""]
    lines = ["# Third-party notices for Pesa Ledger", "",
             "Pesa Ledger includes the open-source software listed below, each under its own licence.", ""]
    if look:
        lines += ["## To check", "", "Copyleft licences, or packages whose licence wasn't stated in their metadata:", "", *table(look)]
    lines += ["## In the page (JavaScript and fonts)", "", *table(page), "## Python and its libraries", "", *table(py)]
    OUT.write_text("\n".join(lines))
    print(f"{OUT.name}: {len(py) + len(page)} packages, {len(look)} to check")


if __name__ == "__main__":
    main()
