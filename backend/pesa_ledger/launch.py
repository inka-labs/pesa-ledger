"""Open the ledger without a terminal: start it in the background if it isn't running, then open it
in the browser, signed in.

    python -m pesa_ledger.launch           # open the ledger (starting it if needed)
    python -m pesa_ledger.launch --stop    # ask a running ledger to quit
"""

import argparse
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
import webbrowser
from pathlib import Path

from . import brand
from .core.store import home

PORT = int(os.environ.get(brand.PORT_ENV) or brand.PORT)  # another port if that one is taken
COOKIE = f"{brand.SLUG.replace('-', '_')}_session"  # app.COOKIE (not imported: that would load the whole server)
APP_DIR = Path(__file__).resolve().parents[2]


def _token() -> str:
    try:
        return (home() / "session_token").read_text().strip()
    except OSError:
        return ""


def _call(path: str, method: str = "GET", port: int = PORT, timeout: float = 2) -> tuple[int, dict] | None:
    """(status, JSON body) from whatever answers on the port, or None when nothing does."""
    req = urllib.request.Request(f"http://127.0.0.1:{port}{path}", method=method,
                                 headers={"Cookie": f"{COOKIE}={_token()}"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            status, raw = resp.status, resp.read()
    except urllib.error.HTTPError as e:
        status, raw = e.code, e.read()
    except (OSError, ValueError):
        return None
    try:
        body = json.loads(raw or b"{}")
    except ValueError:
        body = {}
    return status, body if isinstance(body, dict) else {}


def running(port: int = PORT) -> str | None:
    """"ledger" when this computer's ledger answers on the port, "other" when another program
    does, None when nothing does."""
    answer = _call("/api/version", port=port)
    if answer is None:
        return None
    status, body = answer
    signed_out = status == 401 and str(body.get("detail", "")).startswith("Not signed in")
    mine = status == 200 and body.get("name") == brand.NAME
    return "ledger" if mine or (signed_out and brand.NAME in str(body.get("detail", ""))) else "other"


def _python(background: bool) -> str:
    """This environment's Python; pythonw on Windows for a process without a console window."""
    if background and os.name == "nt":
        pythonw = Path(sys.executable).with_name("pythonw.exe")
        if pythonw.is_file():
            return str(pythonw)
    return sys.executable


def server_command(port: int = PORT) -> list[str]:
    # -X utf8: read and write text as UTF-8 on Windows too, as on macOS and Linux
    return [_python(background=True), "-X", "utf8", "-m", "pesa_ledger", "--no-browser", "--port", str(port)]


def start(port: int = PORT, wait: float = 30) -> None:
    """Start the ledger as a background process (its output goes to ledger.log) and wait until it answers."""
    log = home() / "ledger.log"
    out = open(log, "ab")
    kwargs: dict = {"cwd": APP_DIR, "stdin": subprocess.DEVNULL, "stdout": out, "stderr": subprocess.STDOUT}
    if os.name == "nt":
        kwargs["creationflags"] = subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP  # type: ignore[attr-defined]
    else:
        kwargs["start_new_session"] = True
    proc = subprocess.Popen(server_command(port), **kwargs)
    out.close()
    deadline = time.monotonic() + wait
    while time.monotonic() < deadline:
        if running(port) == "ledger":
            return
        if proc.poll() is not None and running(port) != "ledger":
            raise RuntimeError(f"{brand.NAME} stopped while starting.\n\n" + _tail(log))
        time.sleep(0.3)
    raise RuntimeError(f"{brand.NAME} didn't start within {int(wait)} seconds.\n\n" + _tail(log))


def stop(port: int = PORT, wait: float = 10) -> str:
    if running(port) != "ledger":
        return ""
    _call("/api/quit", method="POST", port=port)
    deadline = time.monotonic() + wait
    while time.monotonic() < deadline and running(port) == "ledger":
        time.sleep(0.3)
    return f"{brand.NAME} has stopped."


def _tail(log: Path, lines: int = 12) -> str:
    try:
        return "\n".join(log.read_text(errors="replace").splitlines()[-lines:])
    except OSError:
        return ""


def open_ledger(port: int = PORT, browser: bool = True) -> str:
    state = running(port)
    if state == "other":
        raise RuntimeError(f"Another program is using port {port}, which {brand.NAME} needs. "
                           f"Close it, or set {brand.PORT_ENV} to another port.")
    if state is None:
        start(port)
    url = f"http://127.0.0.1:{port}/auth?token={_token()}"
    if browser:
        webbrowser.open(url)
    return url


def main() -> None:
    parser = argparse.ArgumentParser(prog=f"{brand.SLUG}-launch", description=f"Open {brand.NAME}, starting it if needed.")
    parser.add_argument("--stop", action="store_true", help=f"Ask a running {brand.NAME} to quit.")
    parser.add_argument("--no-browser", action="store_true")
    parser.add_argument("--port", type=int, default=PORT)
    args = parser.parse_args()
    try:
        if args.stop:
            print(stop(args.port) or f"{brand.NAME} isn't running.")
        else:
            print(open_ledger(args.port, browser=not args.no_browser))
    except RuntimeError as e:
        sys.exit(str(e))


if __name__ == "__main__":
    main()
