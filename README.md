# Pesa Ledger

A private household ledger that runs on your own computer. Budget the months ahead, record what came in and went
out, and compare month on month and year on year. It's built the same way as Ecoscope Studio and Docling Studio:
a small local server and a web page, with your figures kept in a folder in your home directory.

Three pages cover the everyday, and everything else is one click away:

- **Home:** where the app opens, laid out as a dashboard. Four cards (left to spend, came in, spent, saved) with
  the change from last month, a chart of money in, spent and saved over the last 12 months (click a month to open
  it), a ring of where this month's money went, the latest expenses added, a short to-do list and your goals.
- **Spending:** the month, one row per category: what's been spent with one bar against its budget, and the
  figure. **Add expense** (the sidebar, the + on each row, or the round + on a phone) adds an amount to a
  category's total and keeps a list of what was added, so any of it can be taken back out. You can also type a
  month's total straight in. The … menu copies last month's amounts or fills empty rows from the budget.
- **Budget:** one month at a time, one amount per category. An amount is the usual one for every month unless
  you tick **Only <month>** (school fees in January, insurance in November), and changing either never moves
  the other months. A month with nothing budgeted offers last month's. **Whole year** shows the 12-month grid, a
  yearly figure to spread evenly, and the next 12 months' forecast.
- **More:** Year, Compare, Health, Net worth, Goals, Sinking funds and Allocation, each with what it's for:
  - **Year:** where each month's money went (with budget ticks and one-offs hatched), where the year's income
    went as shares, and a full month-by-month table against budget.
  - **Compare:** any two years over the same months, by total, group or single category, month by month or as
    a running total, with the gap each month and the categories that changed most.
  - **Goals:** a target and deadline linked to savings or sinking-fund categories, with progress and what's
    needed per month.

The Year and Compare charts are [Plotly](https://plotly.com/javascript/) (the bar-and-line build, loaded only on those
pages): drag to zoom, double-click to reset, click a legend item to hide it, and the camera icon saves a PNG.

**Settings** (bottom of the sidebar): how the ledger is set up
- **General:** a second currency at the live exchange rate (or one you set), CSV import and export, backups and
  restore, and start at login.
- **Categories:** your own group types, groups and categories. Every group has a type, and each type says how its
  figures count: *money in*, *set aside* (saved or invested), *money out*, or *not counted* (tracked only, like
  transfers between your own accounts). Add as many types as you like (Business, Investments, Debt repayment...).
  Rename, reorder and recolour groups, move categories between them, or archive ones you've stopped using without
  changing past months.
- **Appearance:** light, dark or match the computer, and the palette: the built-in one (chosen so neighbouring
  groups stay distinguishable with colour blindness) or any of 37
  [Matplotlib colormaps](https://matplotlib.org/stable/users/explain/colors/colormaps.html) (tab10, Set2, viridis,
  plasma, coolwarm, twilight, turbo...). A palette colours the groups, the charts and the app's accent; colours that
  would vanish against the page in the current theme are skipped. Any group can also have a colour of its own.
  `frontend/scripts/palettes.py` regenerates the palettes from Matplotlib.

Money in isn't budgeted: it's what comes in. Budgets cover money set aside and money out, and for months that haven't happened
the forecast expects income at your recent average (the last three months with income).

### Repeating amounts, sinking funds, net worth and health

- **Repeating amounts** (Categories, "Every month"): rent, salary, subscriptions. The Spending page lists the ones not
  recorded yet, one click each, and a repeating amount is the budget when no other budget is set.
- **Sinking funds** (More): a category becomes a pot for a bill you know is coming, with a target, a due month and how
  often it repeats. Each fund says whether it's on pace, short, or holding more than the bill needs; "Bill paid" starts
  the next cycle and carries over what's left.
- **Net worth** (More): accounts you own and owe, with a balance recorded at the end of each month (it carries
  forward until the next). Link an account to the categories you pay into it and the app splits its change into what
  you put in and what it earned, like MMF interest.
- **Health** (More): the last 12 months against common rules of thumb (savings ≥ 20% of income, rent ≤ 30%, an
  emergency fund of 6+ months of essential costs, essentials well within a weak month, spending growing no faster than
  income, no months in the red, sinking funds on pace), one-offs left out. Choose the emergency fund, the essential
  groups and the rent category at the bottom of the page.

### Allocation

More → Allocation measures how income divides up against the long-standing rules: 50/30/20 (Elizabeth Warren),
70/20/10, pay yourself first (80/20), the Babylon tenth (George Clason), 10/10/80, six jars (T. Harv Eker), 30/30/30/10,
or your own split. Pick one, then see actual and budget against it for this month, next month, this year or the last
12 months, with each bucket on target, over or short. Groups and categories fall into buckets automatically (saved →
savings, rent → housing, family support → giving, entertainment → wants); "What goes where" changes any of them.
"Every rule against your money" shows how each rule reads the same figures, and Health gains a "Matches your rule"
check.

### One-offs

A car, a deposit, a renovation, a bonus: money that won't repeat. Give it a category of its own and tick
**One-off** in the category's panel (Settings → Categories, click the category): everything recorded there counts
as one-off. It stays in the month's totals, but "left to spend" measures everyday spending on its own (with
"plus 150,000 one-off" beside it), the Year and Compare pages get a **Leave out one-offs** switch to compare usual
months, and one-off income never counts towards the forecast's expected income. Parts of ordinary categories
marked as one-off in earlier versions still count, and show as a tag on that month's row.

### Getting around

- **Search and jump:** ⌘K (Ctrl K on Windows) or `/`. Type a page, a month (`mar 2025`), a category (`rent` opens it
  in this month with the cursor in its figure) or an action (`export`, `back up`, `theme`, `undo`).
- **Undo:** ⌘Z (Ctrl Z) outside a text box, the Undo button in the header, or the Undo link in the message after
  anything is deleted. The last 50 changes can be undone.
- **Months:** click the month's name to pick any month (months with figures are marked), or use ← and →.
- **Groups:** click a group's name on the Spending page to fold it away; it stays folded next time.

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
    backups/               the whole ledger, copied before the first change of each day (the last 60 such days kept)

The folder and files are readable only by you. The server listens on 127.0.0.1 only (port 8768, next to Ecoscope
Studio's 8765 and Docling Studio's 8766). Every request needs a session cookie set from the sign-in link, and
requests from other websites (including other servers on this computer) are refused. A file that can't be
read is never overwritten: it's set aside as `<name>.damaged-<time>` and the page says so.

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
  views/        Home (OverviewView), Spending (MonthView), Budget, More and the pages under it, Settings
  ui/           amount inputs, tiles, charts
```
