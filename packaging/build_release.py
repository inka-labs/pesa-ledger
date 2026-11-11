"""Build the downloads for people who don't use a terminal:

    pixi run release      # builds the page, then packaging/dist/Pesa-Ledger-<version>-mac.zip and -windows.zip

Each zip holds an installer to double-click, "Read me first.txt", the third-party notices, and app/: the
ledger's code (no tests), its page already built, and pixi.toml / pixi.lock (the installer installs exactly
the locked packages). The installer downloads pixi itself (the version this was built with), so the zips
stay small. A SHA-256 file is written beside each zip, for whoever downloads it to check.
"""

import hashlib
import os
import re
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
OUT = REPO / "packaging" / "dist"
NAME = "Pesa Ledger"
SLUG = "Pesa-Ledger"
SKIP_DIRS = {"__pycache__", ".pytest_cache", "tests", "node_modules", ".pixi"}


def app_version() -> str:
    text = (REPO / "backend" / "pyproject.toml").read_text()
    return re.search(r'^version\s*=\s*"([^"]+)"', text, re.M).group(1)


def pixi_version() -> str:
    if os.environ.get("PIXI_VERSION"):
        return os.environ["PIXI_VERSION"]
    pixi = os.environ.get("PIXI_EXE") or shutil.which("pixi") or str(Path.home() / ".pixi" / "bin" / "pixi")
    out = subprocess.run([pixi, "--version"], capture_output=True, text=True, check=True).stdout
    return out.split()[-1]


def app_files() -> list[Path]:
    """What goes in app/: the backend (without tests), the built page, the pixi files, packaging/."""
    files = [REPO / p for p in ("pixi.toml", "pixi.lock", "README.md", "THIRD_PARTY_NOTICES.md", "LICENSE") if (REPO / p).exists()]
    files += sorted((REPO / "docs").rglob("*.md")) if (REPO / "docs").is_dir() else []
    for top in ("backend", "frontend/dist", "packaging"):
        for path in sorted((REPO / top).rglob("*")):
            rel = path.relative_to(REPO)
            if path.is_file() and not SKIP_DIRS & set(rel.parts) and OUT not in path.parents \
                    and not any(part.endswith(".egg-info") for part in rel.parts) \
                    and path.suffix != ".pyc" and path.name != ".DS_Store":
                files.append(path)
    return files


def fill(text: str, versions: dict[str, str]) -> str:
    for key, value in versions.items():
        text = text.replace(f"__{key}__", value)
    return text


def add(zf: zipfile.ZipFile, name: str, data: bytes, executable: bool = False) -> None:
    info = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
    info.create_system = 3  # unix: keep the executable bit (macOS Archive Utility honours it)
    info.external_attr = (0o100755 if executable else 0o100644) << 16
    info.compress_type = zipfile.ZIP_DEFLATED
    zf.writestr(info, data)


def read_me(system: str, version: str) -> str:
    common_update = f"""UPDATE
Download the newer {NAME} and run its installer the same way. Your figures, budgets, goals and
settings are kept: they live in your home folder, not in the app.
"""
    common_know = f"""GOOD TO KNOW
- {NAME} runs only on this computer. Your figures stay in a folder in your home folder
  (.pesa-ledger) and are never sent anywhere. The only thing it fetches from the internet is
  exchange rates (it sends your main currency's code, never a figure).
- The installer needs the internet once, to download Python and the packages the ledger uses
  (about 150 MB). After that it works offline.
- A backup of the whole ledger is made before the first change of each day (Settings > General).
"""
    if system == "mac":
        text = f"""{NAME} {version} for Mac
{'=' * (len(NAME) + len(version) + 9)}

INSTALL
1. Double-click "Install {NAME}".
   The first time, macOS may say it "can't be opened" or "could not be verified". Then:
     - right-click (or Control-click) "Install {NAME}" and choose Open, then Open again; or
     - open System Settings > Privacy & Security, scroll down and click "Open Anyway".
   This only happens because the installer isn't registered with Apple; it doesn't need your password.
2. A window shows the progress. The first install takes a few minutes.
3. The ledger opens in your browser. From now on, open "{NAME}" from Applications
   (or press Cmd+Space and type Pesa).

{common_update}
{common_know}- Works on Apple silicon and Intel Macs.

UNINSTALL
In the ledger: Settings > General > Quit Pesa Ledger. Then double-click "Uninstall {NAME}"
(in this folder, or in ~/Library/Application Support/Pesa Ledger). It asks before deleting your figures.
"""
    else:
        text = f"""{NAME} {version} for Windows
{'=' * (len(NAME) + len(version) + 13)}

INSTALL
1. Double-click "Install {NAME}".
   Windows may show "Windows protected your PC": click "More info", then "Run anyway".
   If it asks "Do you want to run this file?", click Run. No administrator rights are needed.
2. A window shows the progress. The first install takes a few minutes.
3. The ledger opens in your browser. From now on, open "{NAME}" from the Start menu or the Desktop.

{common_update}
{common_know}- Needs 64-bit Windows 10 or 11.

UNINSTALL
Windows Settings > Apps > Installed apps > {NAME} > Uninstall. It asks before deleting your figures.
"""
    return text.replace("\n", "\r\n") if system == "windows" else text


def build() -> list[Path]:
    if not (REPO / "frontend" / "dist" / "index.html").is_file():
        sys.exit("Build the page first: pixi run build-ui (pixi run release does this).")
    subprocess.run([sys.executable, str(REPO / "packaging" / "notices.py")], check=True)
    version = app_version()
    versions = {"APP_VERSION": version, "PIXI_VERSION": pixi_version()}
    files = app_files()
    OUT.mkdir(parents=True, exist_ok=True)
    top = f"{NAME} {version}"
    built = []
    for system in ("mac", "windows"):
        target = OUT / f"{SLUG}-{version}-{system}.zip"
        with zipfile.ZipFile(target, "w") as zf:
            for path in files:
                rel = path.relative_to(REPO).as_posix()
                data = path.read_bytes()
                if rel.startswith(("packaging/mac/", "packaging/windows/")) and path.suffix in (".command", ".ps1", ".cmd"):
                    data = fill(data.decode(), versions).encode()
                add(zf, f"{top}/app/{rel}", data, executable=path.suffix == ".command")
            add(zf, f"{top}/Read me first.txt", read_me(system, version).encode())
            add(zf, f"{top}/Third-party notices.md", (REPO / "THIRD_PARTY_NOTICES.md").read_bytes())
            if system == "mac":
                for script, label in (("install", "Install"), ("uninstall", "Uninstall")):
                    text = fill((REPO / "packaging" / "mac" / f"{script}.command").read_text(), versions)
                    add(zf, f"{top}/{label} {NAME}.command", text.encode(), executable=True)
            else:
                add(zf, f"{top}/Install {NAME}.cmd", (REPO / "packaging" / "windows" / "install.cmd").read_bytes())
        digest = hashlib.sha256(target.read_bytes()).hexdigest()
        target.with_name(target.name + ".sha256").write_text(f"{digest}  {target.name}\n")
        built.append(target)
    return built


if __name__ == "__main__":
    for path in build():
        print(f"{path.relative_to(REPO)}  ({path.stat().st_size / 1e6:.1f} MB)")
