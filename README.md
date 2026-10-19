# Pesa Ledger

A private household ledger that runs on your own computer. Budget the months ahead, record what came in and went
out, and compare month on month and year on year. It's built the same way as Ecoscope Studio and Docling Studio:
a small local server and a web page, with your figures kept in a folder in your home directory.

- **Month:** each category's budget and actual side by side, with what's left or overspent, the change from last
  month and from the same month last year. Copy last month's amounts or fill from the budget in one click.
- **Budget:** plan any year month by month. A yearly figure spreads evenly; a single month can be set on its own
  (school fees in January, insurance in November). It also shows a year-end forecast (actual figures so far plus
  budget for the rest) and the next 12 months with a running total. Months that would leave you short are flagged.
- **Year:** where each month's money went, as a chart and a full month-by-month table against budget.
- **Compare:** any two years over the same months, by total, group or single category.
- **Goals:** a target and deadline linked to savings or sinking-fund categories. Shows progress, what's needed per
  month, and when you'll get there at your current pace and on your budget.
- **Categories:** your own groups (income, saving or spending) and categories. Rename, reorder, move between groups,
  or archive ones you've stopped using without changing past months.
- **Settings:** a second currency at the live exchange rate (or one you set), CSV import and export, backups and
  restore, and start at login.

Income isn't budgeted: it's what comes in. Budgets cover savings and spending, and for months that haven't happened
the forecast expects income at your recent average (the last three months with income).

### Other currencies

Type an amount in another currency in any amount box (`USD 415`, `$415`, `415 eur`) and it's converted to your main
currency at today's rate; a message says what it converted and at what rate. The local server fetches rates from
[open.er-api.com](https://www.exchangerate-api.com) (free, no key, includes KES), falling back to
[fawazahmed0/exchange-api](https://github.com/fawazahmed0/exchange-api), and caches them for 12 hours in
`~/.pesa-ledger/rates/`. Only your main currency's code is sent, never a figure. Offline, the last rates fetched are
used and marked as old. `pytest --live` checks both services still answer.

## Your data

Everything stays on this computer, in `~/.pesa-ledger` (set `PESA_LEDGER_HOME` to use another folder):

    settings.json          currency, groups, categories, goals
    years/2026.json        a year's actual figures, budgets and notes
    backups/               the whole ledger, copied before the first change of each day (60 days kept)

The folder and files are readable only by you. The server listens on 127.0.0.1 only (port 8768, next to Ecoscope
Studio's 8765 and Docling Studio's 8766). Every request needs a session cookie set from a one-time sign-in link, and
requests from other websites are refused.

The repository never holds anyone's figures. `*.csv` is git-ignored so exports and imports can't be committed by
mistake.

## Run it

You need [pixi](https://pixi.sh).

    cd pesa-ledger
    pixi run start          # builds the page, starts the server and opens it in your browser

Afterwards:

    pixi run open           # open it, starting it in the background if it isn't running
    pixi run stop
    pixi run autostart install    # start at login (or Settings → Start Pesa Ledger when I log in)

If the browser says it isn't signed in, use `pixi run open` or the sign-in link printed in the terminal.

### Bring in a spreadsheet

Settings → Import CSV (or the import choice on first start). Columns:

    year,month,group,category,amount,note
    2026,plan,Income,Salary,6300000,          ← a yearly budget, spread evenly
    2026,plan-11,Essentials,Rent,40000,       ← one month's budget on its own
    2026,1,Essentials,Rent,18000,             ← an actual figure (month number or name)
    2026,1,,,,Rent went up this month         ← a note for the month

Groups and categories are matched by name and created when new. Groups called something like *Income*, *Savings* or
*Investments* get the matching type; anything else is spending. Export CSV writes the same format.

## Develop

    pixi run test           # API tests (pytest) and the money maths (vitest)
    pixi run serve          # the API on :8768
    pixi run dev-ui         # the page with live reload on :5175 (sign in with the dev link the server prints)

```
backend/pesa_ledger/
  app.py        HTTP API, sign-in, serving the page
  ledger.py     the files on disk, validation (pydantic), backups and restore
  launch.py     open / stop without a terminal
  autostart.py  start at login (LaunchAgent / systemd / Startup shortcut)
frontend/src/
  model/        types, the arithmetic (ledger.ts), CSV, example data: pure and unit-tested
  store.ts      the ledger in memory; changes show at once and save in the background
  views/        Month, Budget, Year, Compare, Goals, Categories, Settings
  ui/           amount inputs, tiles, charts
```
