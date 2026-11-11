# Security

Pesa Ledger holds someone's finances, so it is built to keep them on their own computer and out of reach of
anything else. This page says what it protects against, what it doesn't, and how to report a problem.

## What it does

**Nothing leaves the computer.**
- There are no accounts, no cloud, no analytics or telemetry, and no update checks.
- The only request it makes to the internet is for exchange rates. It sends your main currency's code, such as
  `KES`, to open.er-api.com (or, if that's unavailable, to the fawazahmed0 exchange-api on jsDelivr). It never sends
  a figure, a name or a note.

**Only this computer can reach it.**
- The server listens on `127.0.0.1`, so other devices on the network, including the same Wi-Fi, can't connect.
- Requests whose `Host` isn't `127.0.0.1`, `localhost` or `[::1]` are refused. This stops a malicious website from
  pointing its own domain name at your computer to reach the ledger (DNS rebinding).

**Only you, signed in, can use it.**
- Every API request needs a session cookie. The cookie is `HttpOnly` and `SameSite=Strict`, and is set from a sign-in
  link the launcher opens.
- The session token is 32 random bytes and is checked in constant time.
- If the token file is missing, empty or cut short, a new token is made. An empty token is never accepted.

**Other websites can't act on it.**
- A change (anything but reading) must come from the ledger's own page: the same host *and port*. Other sites, and
  other servers on the same computer, are refused.
- The page can't be framed by another site (`frame-ancestors 'none'`, `X-Frame-Options: DENY`), which blocks
  clickjacking.

**Injected code can't run.**
- A strict Content-Security-Policy allows only the app's own scripts. Nothing inline, nothing from elsewhere, no
  plugins.
- If a note or category name ever contained a `<script>`, it would not run.
- React escapes everything it displays.

**Your files are guarded.**
- The data folder (`~/.pesa-ledger`) and every file in it are readable only by your user account on Mac and Linux.
  On Windows, files in your profile folder are private to your account by default.
- Writes are atomic: each save goes to a temporary file, is flushed to disk, then replaces the old one. A crash or a
  full disk never leaves half a file.
- A file that can't be read is never overwritten. It's set aside as `<name>.damaged-<time>` and the page says so.
- A backup of the whole ledger is made before the first change of each day.

**What goes on disk is checked.**
- Every save is validated against a strict schema. Unknown fields, out-of-range amounts, malformed ids and
  settings that point at groups or types that don't exist are refused, so a bug or a hostile request can't write
  nonsense into your files.

**Dependencies are watched.**
- Python packages are locked to exact versions (`pixi.lock`), and the installer installs exactly those with
  `--frozen`.
- CI checks the locked Python packages with `pip-audit` and the page's packages with `npm audit`, on every push and
  every Monday.
- Dependabot opens pull requests for npm and GitHub Actions updates.
- CI actions are pinned to commits, not tags.

**Downloads can be checked.**
- Each release zip is published with a `.sha256` file. On a Mac, check it with
  `shasum -a 256 Pesa-Ledger-<v>-mac.zip`; on Windows, with `Get-FileHash Pesa-Ledger-<v>-windows.zip`. The result
  should match the `.sha256` file.
- The installer downloads only pixi (from its GitHub releases, over HTTPS) and the locked packages.

## What it doesn't protect against

- **Someone using your computer account.** Anyone signed in as you can read `~/.pesa-ledger` and open the ledger.
  Use a login password, lock your screen, and turn on disk encryption (FileVault on Mac, BitLocker or Device
  Encryption on Windows), so a lost or stolen laptop doesn't expose your figures.
- **Malware already running as you.** It can read your files whatever any app does.
- **Copies you make.** CSV exports and backups you copy elsewhere (email, USB sticks, cloud drives) are only as
  private as wherever you put them.
- **Unsigned installers.** The installers aren't code-signed yet, which is why macOS and Windows warn the first time.
  Get the zip only from the person or place you trust, and compare its checksum.

## Reporting a problem

Please don't open a public issue for a security problem. Email the maintainer (see the repository's owner) with what
you found and how to reproduce it. You'll get a reply within a week.
