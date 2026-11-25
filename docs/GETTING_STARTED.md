# Getting started with Pesa Ledger

Pesa Ledger is a household budget that runs on your own computer. You plan what each month's money is for, record
what you spend, and see where it went. Your figures stay on your computer: nothing is uploaded anywhere.

## 1. Install it

You'll get a zip file from whoever shares Pesa Ledger with you: `Pesa-Ledger-<version>-mac.zip` or
`Pesa-Ledger-<version>-windows.zip`.

### On a Mac

1. Double-click the zip to unzip it, and open the **Pesa Ledger** folder.
2. Double-click **Install Pesa Ledger**.
   The first time, macOS may say it "can't be opened" or "could not be verified". That's because the installer
   isn't registered with Apple. Right-click (or Control-click) it, choose **Open**, then **Open** again. Or go to
   **System Settings → Privacy & Security**, scroll down and click **Open Anyway**.
3. A window shows the progress. The first install downloads Python and a few packages (about 150 MB) and takes a
   few minutes. You don't need a password.
4. Pesa Ledger opens in your browser. From now on, open it from **Applications**, or press **⌘ Space** and type
   *Pesa*.

### On Windows

1. Right-click the zip, choose **Extract All…**, and open the **Pesa Ledger** folder.
2. Double-click **Install Pesa Ledger**.
   If Windows shows "Windows protected your PC", click **More info**, then **Run anyway**. No administrator rights
   are needed.
3. A window shows the progress. The first install takes a few minutes.
4. Pesa Ledger opens in your browser. From now on, open it from the **Start menu** or the **Desktop** shortcut.

### On Linux, or from the code

You need [pixi](https://pixi.sh). Then:

    git clone https://github.com/inka-labs/pesa-ledger.git
    cd pesa-ledger
    pixi run start

## 2. Your first ten minutes

When it first opens, choose how to start:

- **Start with standard categories** (rent, food, transport, savings…), then rename or remove any you don't use.
- **Build my own categories** from scratch.
- **Explore with example figures** first, to see what a few months look like. *Clear them* removes them when you're done.
- **Import a CSV**, if you already keep your figures in a spreadsheet.

Then work through the three pages in the menu:

1. **Budget.** For each category, type what you plan to spend or save in a usual month. Tick **Only Nov** for an
   amount that's just for this month, such as school fees or an insurance bill.
2. **Add expense** (top of the menu, or the round **+** on a phone). Type the amount, pick the category, add a note
   if you like. Each expense is added to that category's total for the month. If you'd rather type the month's
   total straight in, do that on the **Spending** page.
3. **Home** shows how the month is going:
   - what's left to spend, and where you're heading by month end;
   - last month in review;
   - anything worth a look, such as a category over budget or one you usually record that's still empty.

**Settings** (bottom of the menu) has your categories, your currency and others to show amounts in, and backups. It
also has the look: light or dark, the colours, and whether the menu sits at the side or across the top.

### Good to know

- **Pay day near the end of the month?** In **Settings → General**, set your payday. Each month then holds that
  month's pay and the next month's spending.
- **One-off costs** (a car, a deposit, a bonus): give them a category of their own and tick **One-off** on it, in
  **Settings → Categories**. The usual-month comparisons and forecasts then leave them out.
- **Other currencies:** type `USD 20` or `$20` in any amount box and it's converted at today's rate.
- **Undo:** ⌘Z (Ctrl Z on Windows), or the Undo button at the top. The last 50 changes can be undone.
- **Search:** ⌘K (Ctrl K) finds any page, month, category or action.

## 3. Your figures and backups

Everything is in a folder in your home folder, readable only by you:

| | |
|---|---|
| Mac | `~/.pesa-ledger` (your home folder, then the hidden `.pesa-ledger` folder) |
| Windows | `C:\Users\<you>\.pesa-ledger` |

Before the first change of each day, the whole ledger is copied to `backups/` inside that folder, and the last 60
days are kept. **Settings → General** lists them, and can restore one or make a backup now. To move to a new
computer, install Pesa Ledger there, then copy the `.pesa-ledger` folder across.

**Export CSV** (in Settings) saves every figure as a spreadsheet. **Import CSV** brings one in.

## 4. Updating

When there's a new version, you'll be sent a newer zip. Unzip it and run its **Install Pesa Ledger** the same way.
It replaces the app and keeps your figures, which live in `.pesa-ledger`, separate from the app. If Pesa Ledger is
open, the installer closes it first and nothing is lost, because every change is saved as you make it.

Pesa Ledger doesn't check for updates by itself, and doesn't contact anything online except for exchange rates.

## 5. Uninstalling

- **Mac:** in Pesa Ledger, **Settings → General → Quit Pesa Ledger**. Then double-click **Uninstall Pesa Ledger** (in
  the unzipped folder, or in `~/Library/Application Support/Pesa Ledger`).
- **Windows:** **Settings → Apps → Installed apps → Pesa Ledger → Uninstall**.

Both ask before deleting your figures. If you answer no, they stay in `.pesa-ledger` and come back when you install
again.

## Something not right?

- **"Not signed in"**: open Pesa Ledger from its shortcut (Applications, the Start menu or the Desktop), not from an
  old browser tab or bookmark.
- **"Your last change wasn't saved"**: Pesa Ledger isn't running, perhaps after a restart. Open it from its shortcut,
  then press **Try again** on the message; your change is still on the page.
- **It won't start:** the log is `ledger.log` in the `.pesa-ledger` folder.
