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

from . import __version__, autostart, brand, ledger
from .core.store import home

COOKIE = f"{brand.SLUG.replace('-', '_')}_session"
ALLOWED_HOSTS = {"127.0.0.1", "localhost", "[::1]", "testserver"}
UI_DIST = Path(os.environ.get("PESA_LEDGER_UI") or Path(__file__).resolve().parents[2] / "frontend" / "dist")


def _hostname(host: str) -> str:
    """'127.0.0.1:8768' -> '127.0.0.1', '[::1]:8768' -> '[::1]'."""
    if host.startswith("["):
        return host.split("]", 1)[0] + "]"
    return host.rsplit(":", 1)[0]


def session_token() -> str:
    """Stable across restarts so an open tab keeps working; rotate by deleting the file."""
    path = home() / "session_token"
    if path.exists():
        return path.read_text().strip()
    token = secrets.token_urlsafe(32)
    path.write_text(token)
    os.chmod(path, 0o600)
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
            origin = request.headers.get("origin")
            if request.method not in ("GET", "HEAD") and origin:
                if _hostname(origin.split("://", 1)[-1]) not in ALLOWED_HOSTS:
                    return JSONResponse({"detail": "Cross-origin request refused."}, status_code=403)
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
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
