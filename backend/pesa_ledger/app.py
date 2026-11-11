"""HTTP API + static UI.

The ledger only listens on 127.0.0.1. On top of that every /api call needs the session cookie, which
is set by opening the one-time link printed at startup (/auth?token=...). That keeps other websites
open in the same browser from reading or changing your figures, and the Host check blocks
DNS-rebinding.
"""

import hmac
import os
import secrets
import subprocess
import sys
import threading
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse

from . import __version__, autostart, brand, ledger, rates
from .core.store import home, write_text_private

COOKIE = f"{brand.SLUG.replace('-', '_')}_session"
ALLOWED_HOSTS = {"127.0.0.1", "localhost", "[::1]"}

# What the page may load and do: only its own scripts, styles, fonts and API (styles may be inline: the
# palette is a <style> the page writes, and React sets style attributes), images it makes itself (chart
# PNGs), and nothing may frame it. A script injected into a figure or a note would not run.
SECURITY_HEADERS = {
    "Content-Security-Policy": "; ".join([
        "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:",
        "font-src 'self' data:", "connect-src 'self'", "object-src 'none'", "base-uri 'none'", "form-action 'self'",
        "frame-ancestors 'none'",
    ]),
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
}
UI_DIST = Path(os.environ.get("PESA_LEDGER_UI") or Path(__file__).resolve().parents[2] / "frontend" / "dist")


def _hostname(host: str) -> str:
    """'127.0.0.1:8768' -> '127.0.0.1', '[::1]:8768' -> '[::1]'."""
    if host.startswith("["):
        return host.split("]", 1)[0] + "]"
    return host.rsplit(":", 1)[0]


def _same_origin(request: Request) -> bool:
    """A change must come from this page: host *and port* match (another local server on
    127.0.0.1:9999 is a different site). Requests with no Origin come from the launcher, not a browser,
    unless the browser says they're cross-site."""
    origin = request.headers.get("origin")
    if origin:
        return origin.split("://", 1)[-1].rstrip("/") == request.headers.get("host", "")
    return request.headers.get("sec-fetch-site", "same-origin") in ("same-origin", "none")


def session_token() -> str:
    """Stable across restarts so an open tab keeps working; rotate by deleting the file."""
    path = home() / "session_token"
    try:
        token = path.read_text().strip()
    except FileNotFoundError:
        token = ""
    if len(token) < 32:  # missing, emptied or cut short: never accept a guessable token
        token = secrets.token_urlsafe(32)
        write_text_private(path, token)
    return token


def reveal(path: Path) -> None:
    """Show a folder in Finder / Explorer / the file manager."""
    if sys.platform == "darwin":
        subprocess.Popen(["open", str(path)])
    elif os.name == "nt":
        os.startfile(str(path))  # type: ignore[attr-defined]
    else:
        subprocess.Popen(["xdg-open", str(path)])


def create_app() -> FastAPI:
    token = session_token()
    app = FastAPI(title=brand.NAME, docs_url=None, redoc_url=None, openapi_url=None)
    app.state.token = token

    @app.middleware("http")
    async def guard(request: Request, call_next):
        if _hostname(request.headers.get("host", "")) not in ALLOWED_HOSTS:
            return JSONResponse({"detail": "Forbidden host."}, status_code=403)
        if request.url.path.startswith("/api/"):
            if not hmac.compare_digest(request.cookies.get(COOKIE, ""), token):
                return JSONResponse({"detail": f"Not signed in. Open {brand.NAME} again (or the sign-in link it printed)."}, status_code=401)
            if request.method not in ("GET", "HEAD") and not _same_origin(request):
                return JSONResponse({"detail": "Cross-origin request refused."}, status_code=403)
        response = await call_next(request)
        for name, value in SECURITY_HEADERS.items():
            response.headers.setdefault(name, value)
        if request.url.path.startswith("/api/"):
            response.headers.setdefault("Cache-Control", "no-store")
        return response

    @app.get("/auth")
    def auth(request: Request):
        if not hmac.compare_digest(request.query_params.get("token", ""), token):
            return HTMLResponse(f"<p>That sign-in link isn't valid. Open {brand.NAME} again (pixi run open), or use the link it printed.</p>", status_code=401)
        resp = RedirectResponse("/", status_code=303)
        resp.set_cookie(COOKIE, token, httponly=True, samesite="strict", max_age=60 * 60 * 24 * 365)
        return resp

    def bad(e: Exception):
        raise HTTPException(400, str(e))

    # The app ----------------------------------------------------------------------------------

    @app.get("/api/version")
    def get_version():
        return {"version": __version__, "name": brand.NAME, "platform": sys.platform, "home": str(home()),
                "autostart": {"supported": autostart.supported(), "enabled": autostart.enabled()}}

    @app.post("/api/quit")
    def quit_app(request: Request):
        server = getattr(request.app.state, "server", None)
        if server is not None:
            threading.Timer(0.5, lambda: setattr(server, "should_exit", True)).start()
        return {"ok": True}

    @app.post("/api/reveal")
    def reveal_folder():
        reveal(home())
        return {"ok": True}

    @app.put("/api/autostart")
    def set_autostart(payload: dict):
        try:
            message = autostart.install() if payload.get("enabled") else autostart.uninstall(stop_now=False)
        except autostart.AutostartError as e:
            bad(e)
        return {"enabled": autostart.enabled(), "message": message}

    # Exchange rates -----------------------------------------------------------------------------

    @app.get("/api/rates")
    def get_rates(base: str = "KES", refresh: bool = False):
        try:
            return rates.get(base, refresh=refresh)
        except rates.RatesError as e:
            raise HTTPException(503, str(e))

    # The ledger -------------------------------------------------------------------------------

    @app.get("/api/ledger")
    def get_ledger():
        return ledger.load()

    @app.put("/api/settings")
    def put_settings(payload: dict):
        try:
            return ledger.save_settings(payload)
        except ledger.LedgerError as e:
            bad(e)

    @app.put("/api/years/{year}")
    def put_year(year: int, payload: dict):
        try:
            return ledger.save_year(year, payload)
        except ledger.LedgerError as e:
            bad(e)

    @app.delete("/api/years/{year}", status_code=204)
    def delete_year(year: int):
        try:
            ledger.delete_year(year)
        except ledger.LedgerError as e:
            bad(e)

    @app.get("/api/backups")
    def get_backups():
        return {"backups": ledger.list_backups(), "folder": str(home() / "backups")}

    @app.post("/api/backups")
    def make_backup():
        try:
            return {"name": ledger.backup_now()}
        except ledger.LedgerError as e:
            bad(e)

    @app.post("/api/backups/{name}/restore")
    def restore_backup(name: str):
        try:
            return ledger.restore(name)
        except ledger.LedgerError as e:
            bad(e)

    # The UI -----------------------------------------------------------------------------------

    @app.get("/{path:path}")
    def ui(path: str):
        if path.startswith("api/"):
            raise HTTPException(404, "Not found.")
        index = UI_DIST / "index.html"
        if not index.is_file():
            return HTMLResponse("<p>The UI isn't built yet. Run <code>pixi run build-ui</code> (or <code>pixi run start</code>).</p>", status_code=503)
        candidate = (UI_DIST / path).resolve()
        if path and UI_DIST.resolve() in candidate.parents and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(index)

    return app
