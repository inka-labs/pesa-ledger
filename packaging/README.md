# Packaging: installers for Mac and Windows

For people who don't use a terminal: they unzip, double-click **Install Pesa Ledger**, then open it from
Applications or the Start menu. They don't need pixi, git, Node or a build step. The user-facing guide is
[docs/GETTING_STARTED.md](../docs/GETTING_STARTED.md).

## Make a release

1. Bump the version in `backend/pyproject.toml` and `backend/pesa_ledger/__init__.py`. The installers and the
   Windows *Apps* list show it.
2. Make sure `main` is green in CI. The **Installer** job has already built these zips and installed from them on a
   fresh Mac and Windows machine.
3. Run:

       pixi run release

   It builds the page, then writes, in `packaging/dist/`:
   - `Pesa-Ledger-<version>-mac.zip` and `-windows.zip` (about 1.5 MB each);
   - a `.sha256` file beside each.

   It also refreshes `THIRD_PARTY_NOTICES.md`. Commit that if it changed.
4. Optionally, write the release notes in `docs/releases/v<version>.md`. Without them, GitHub writes notes from
   the commits.
5. Tag it and push the tag:

       git tag v<version> && git push origin v<version>

   The **Release** workflow (`.github/workflows/release.yml`) checks the tag matches the version, runs the tests,
   builds the zips and publishes them as a GitHub release, with the `.sha256` files beside them. Steps 2–3 are
   then only for checking locally.
6. The repository is private, so only people with access can see the release. Send the zips (and `.sha256` files)
   to anyone else directly.

Each zip contains:

| | |
|---|---|
| `Install Pesa Ledger.command` / `.cmd` | the installer to double-click |
| `Uninstall Pesa Ledger.command` | Mac only (on Windows: Settings → Apps) |
| `Read me first.txt` | install steps, including getting past the "unidentified developer" and SmartScreen warnings |
| `Third-party notices.md` | every bundled package and its licence |
| `app/` | the ledger: `backend/` (no tests), `frontend/dist/` (the built page), `pixi.toml`, `pixi.lock`, `docs/`, `packaging/` |

## What the installer does

It needs no administrator rights and only touches the user's own folders:

1. It downloads pixi, at the version the release was built with, into the ledger's folder. It doesn't use or change
   any pixi the user already has.
2. If the ledger is already installed (an update), it stops it. Every change is already saved, so nothing is lost.
3. It copies `app/`, keeping the existing `.pixi` environment so updates are quick (about 15 seconds).
4. It runs `pixi install --frozen`, so the user gets exactly the locked packages.
5. It adds the launcher, opens the ledger, and leaves the uninstaller behind.

| | Mac | Windows |
|---|---|---|
| The ledger's folder | `~/Library/Application Support/Pesa Ledger/` | `%LOCALAPPDATA%\Pesa Ledger\` |
| Launcher | `~/Applications/Pesa Ledger.app` | Start menu + Desktop shortcut |
| Uninstall | `Uninstall Pesa Ledger.command` | Settings → Apps → Pesa Ledger |
| Figures (never touched by installing or updating) | `~/.pesa-ledger/` | `%USERPROFILE%\.pesa-ledger\` |

The launcher runs `python -m pesa_ledger.launch` from the ledger's environment. If the ledger isn't running, that
starts it in the background, logging to `ledger.log`. Then it opens the browser at the sign-in link.

`PESA_LEDGER_UNATTENDED=1` runs the installer with no prompts and restarts the ledger in the background instead of
opening it. CI uses it, and a future in-app *Update now* could too.

## Updating: how people get a new version

They run the newer zip's installer over the old one. Their figures live in `.pesa-ledger`, outside the app, so
nothing is lost. The app has no update check, because the repository is private and its releases can't be reached
without signing in to GitHub.

If releases are ever published publicly (a public repository, or a public releases-only repository), the app could
check weekly. It would ask GitHub's releases API for the latest tag, which sends nothing about the user. It could
then offer **Update now**: download the zip, check its SHA-256, and run the installer with
`PESA_LEDGER_UNATTENDED=1`. Ecoscope Studio's `manage/selfupdate.py` does exactly this, and can be ported.

## Testing a build without touching your own ledger

    pixi run release
    ditto -x -k packaging/dist/Pesa-Ledger-<v>-mac.zip /tmp/try
    env HOME=/tmp/try/home PESA_LEDGER_PORT=8799 PESA_LEDGER_UNATTENDED=1 "/tmp/try/Pesa Ledger <v>/Install Pesa Ledger.command"

`HOME` keeps it in `/tmp/try/home`, and `PESA_LEDGER_PORT` runs it beside your own ledger on 8768. The token is in
`/tmp/try/home/.pesa-ledger/session_token`, and you sign in at `http://127.0.0.1:8799/auth?token=<it>`. On Windows,
CI's **Installer** job is the test.

## Not signed (yet)

The installers aren't code-signed. The first time, macOS asks people to right-click → Open (or Privacy & Security →
Open Anyway), and Windows shows SmartScreen's "More info → Run anyway". `Read me first.txt` explains both. Signing
needs an Apple Developer account ($99 a year, plus notarisation) and a Windows code-signing certificate.

## Files here

- `build_release.py`: builds the zips. It fills `__APP_VERSION__` and `__PIXI_VERSION__` into the scripts.
- `notices.py`: writes `THIRD_PARTY_NOTICES.md`.
- `mac/install.command`, `mac/uninstall.command`, `mac/icon.icns`.
- `windows/install.cmd` runs `windows/install.ps1`. Also `windows/uninstall.ps1` and `windows/icon.ico`. Keep the
  `.ps1` files ASCII-only, because Windows PowerShell 5.1 misreads UTF-8 without a BOM.
- `icon.svg`: the source of both icons, the same as the page's favicon.
