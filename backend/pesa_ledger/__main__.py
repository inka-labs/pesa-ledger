import argparse
import sys
import threading
import webbrowser

import uvicorn

from .core.store import home
from . import __version__, brand, launch
from .app import create_app


def main() -> None:
    parser = argparse.ArgumentParser(prog=brand.SLUG, description=f"Run {brand.NAME} locally.")
    parser.add_argument("--port", type=int, default=launch.PORT)
    parser.add_argument("--no-browser", action="store_true", help="Don't open the browser.")
    parser.add_argument("--version", action="version", version=f"{brand.NAME} {__version__}")
    args = parser.parse_args()

    if sys.stdout is None:  # pythonw (Windows shortcut, start at login): no console to write to
        sys.stdout = sys.stderr = open(home() / "ledger.log", "a", buffering=1, encoding="utf-8")
    if launch.running(args.port) == "ledger":
        # Already running (opened twice, or start at login after opening it): nothing to do. Exit 0
        # so the login service doesn't keep retrying.
        print(f"{brand.NAME} is already running on port {args.port}.")
        return

    app = create_app()
    url = f"http://127.0.0.1:{args.port}/auth?token={app.state.token}"
    print(
        f"\n  {brand.NAME} {__version__} is running on this computer only.\n"
        f"  Open: {url}\n"
        f"  (UI dev server: http://localhost:5175/auth?token={app.state.token})\n"
        f"  Your figures are in {home()}\n"
    )
    if not args.no_browser:
        threading.Timer(1.0, webbrowser.open, args=(url,)).start()
    # 127.0.0.1 only: never expose this on the network, it holds your finances.
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=args.port, log_level="warning"))
    app.state.server = server  # lets Settings → Quit stop it
    server.run()


if __name__ == "__main__":
    main()
