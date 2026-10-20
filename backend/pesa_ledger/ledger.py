"""The ledger on disk, and the shape every write must have.

    ~/.pesa-ledger/settings.json        currency, groups, categories, goals
    ~/.pesa-ledger/years/<year>.json    one year's actual figures, budgets and notes
    ~/.pesa-ledger/backups/*.json       whole-ledger snapshots

A year file holds, per month key "01".."12":
    actual[month][category id]  what really came in or went out
    budget[month][category id]  a budget set for that month on its own
    notes[month]                free text
    oneoff[month][category id]  {amount, note}: the part of that figure that won't repeat
    balances[month][account id] what an account held (or owed) at the end of the month
and plan[category id], a yearly budget spread evenly over the months that have no budget of their own.

Before the first change of each day the whole ledger is copied to backups/auto-<date>.json, so any
day's state can be restored. Backups older than KEEP_AUTO days are pruned.
"""

import re
from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, ValidationError

from .core.store import home, read_json, write_json

KEEP_AUTO = 60

Id = Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9_-]{1,40}$")]
MonthKey = Annotated[str, StringConstraints(pattern=r"^(0[1-9]|1[0-2])$")]
YearMonth = Annotated[str, StringConstraints(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")]
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
Amount = Annotated[float, Field(allow_inf_nan=False, ge=-1e13, le=1e13)]


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class Kind(Strict):
    """A type of group the user defines ("Income", "Business", "Debt repayment"...). Its effect says how
    its figures count: in (adds to what's left over), aside (saved or invested: subtracts, and is
    budgeted), out (spent: subtracts, and is budgeted), none (tracked only: never in the totals)."""
    id: Id
    name: Name
    effect: Literal["in", "aside", "out", "none"]


# The three every ledger started with; their ids are what groups saved before custom types point at.
DEFAULT_KINDS = [
    {"id": "income", "name": "Income", "effect": "in"},
    {"id": "saving", "name": "Saving", "effect": "aside"},
    {"id": "expense", "name": "Spending", "effect": "out"},
]

Hex = Annotated[str, StringConstraints(pattern=r"^#[0-9a-fA-F]{6}$")]


class Group(Strict):
    id: Id
    name: Name
    kind: Id
    # a position in the chosen palette (0 = the text colour)...
    slot: int = Field(ge=0, le=40)
    # ...unless the user picked a colour of their own
    color: Hex | None = None


class Fund(Strict):
    """A sinking fund on a category: money set aside in it (from `from`, plus `start` already there) builds
    towards `target` by `due`. `every` months after a bill is paid the next cycle starts (0: once)."""
    target: Annotated[float, Field(gt=0, allow_inf_nan=False)]
    due: YearMonth
    start: Amount = 0
    from_: YearMonth = Field(alias="from")
    every: int = Field(default=12, ge=0, le=120)


class Category(Strict):
    id: Id
    name: Name
    group: Id
    archived: bool = False
    # the amount that comes in or goes out every month (rent, salary): offered on the Month page, and the
    # budget when none is set
    repeat: Amount | None = None
    fund: Fund | None = None


class Account(Strict):
    """Somewhere money sits (a bank, the MMF, the car) or is owed (a loan). Its balance is recorded monthly in
    the year file; `cats` are the categories whose amounts are contributions to it."""
    id: Id
    name: Name
    debt: bool = False
    cats: list[Id] = Field(default_factory=list, max_length=200)
    archived: bool = False


class Bucket(Strict):
    """A share of income in an allocation rule: at most (max), at least (min) or about (target) `pct`%."""
    id: Id
    name: Name
    pct: Annotated[float, Field(ge=0, le=100, allow_inf_nan=False)]
    kind: Literal["max", "min", "target"] = "target"


class Allocation(Strict):
    """The spending-allocation rule to measure against (50/30/20 and the like, or `custom`), and for each
    rule which bucket each group ("g:<id>") or category ("c:<id>") falls in. With `leftover` on, money left
    over counts towards the rule's savings bucket."""
    rule: Annotated[str, StringConstraints(pattern=r"^[a-z0-9-]{1,30}$")] | None = None
    maps: dict[Annotated[str, StringConstraints(pattern=r"^[a-z0-9-]{1,30}$")],
               dict[Annotated[str, StringConstraints(pattern=r"^[gc]:[A-Za-z0-9_-]{1,40}$")], Id]] = Field(default_factory=dict)
    custom: list[Bucket] = Field(default_factory=list, max_length=12)
    leftover: bool = True


class Health(Strict):
    """What the Health page needs to know: the emergency fund ("a:<account>" or "g:<goal>"), the groups that
    are essential costs, and the rent category."""
    ef: Annotated[str, StringConstraints(pattern=r"^[ag]:[A-Za-z0-9_-]{1,40}$")] | None = None
    essential: list[Id] | None = None
    rent: Id | None = None


class Goal(Strict):
    id: Id
    name: Name
    target: Annotated[float, Field(gt=0, allow_inf_nan=False)]
    deadline: YearMonth
    start: Amount = 0
    from_: YearMonth = Field(alias="from")
    cats: list[Id] = Field(default_factory=list, max_length=500)


class OtherCurrency(Strict):
    code: Annotated[str, StringConstraints(strip_whitespace=True, max_length=5)] = ""
    # units of the main currency per 1 of this one; only used when `auto` is off
    rate: Annotated[float, Field(gt=0, allow_inf_nan=False)] | None = None
    # use the live rate (rates.py) instead of `rate`
    auto: bool = True


class Settings(Strict):
    v: int = 1
    currency: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=5)] = "KES"
    alt: OtherCurrency | None = None
    kinds: list[Kind] = Field(default_factory=lambda: [Kind(**k) for k in DEFAULT_KINDS], min_length=1, max_length=30)
    # a Matplotlib colormap name, or "pesa" (the built-in palette)
    palette: Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9_-]{1,30}$")] = "pesa"
    # how much the palette colours the page behind the figures
    tint: Literal["off", "soft", "rich"] = "soft"
    groups: list[Group] = Field(max_length=40)
    cats: list[Category] = Field(max_length=1000)
    goals: list[Goal] = Field(default_factory=list, max_length=200)
    accounts: list[Account] = Field(default_factory=list, max_length=100)
    health: Health | None = None
    allocation: Allocation | None = None
    example: bool = False


class OneOff(Strict):
    """The part of a month's figure that won't repeat (a car, a renovation, a bonus), so comparisons
    and forecasts can leave it out. It's part of actual[month][category], not added to it."""
    amount: Amount
    note: Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)] = ""


class YearDoc(Strict):
    actual: dict[MonthKey, dict[Id, Amount]] = Field(default_factory=dict)
    budget: dict[MonthKey, dict[Id, Amount]] = Field(default_factory=dict)
    plan: dict[Id, Amount] = Field(default_factory=dict)
    notes: dict[MonthKey, Annotated[str, StringConstraints(max_length=10000)]] = Field(default_factory=dict)
    oneoff: dict[MonthKey, dict[Id, OneOff]] = Field(default_factory=dict)
    # account id -> its balance at the end of the month
    balances: dict[MonthKey, dict[Id, Amount]] = Field(default_factory=dict)


class LedgerError(ValueError):
    pass


def _explain(e: ValidationError) -> str:
    first = e.errors()[0]
    where = ".".join(str(p) for p in first["loc"])
    return f"{where}: {first['msg']}" if where else first["msg"]


def _years_dir():
    return home() / "years"


def _check_year(year: int) -> int:
    if not 1900 <= year <= 2999:
        raise LedgerError("The year must be between 1900 and 2999.")
    return year


# Reading ---------------------------------------------------------------------------------------

def load() -> dict:
    """{"settings": {...} or None (never set up), "years": {"2026": {...}, ...}}"""
    years = {}
    folder = _years_dir()
    if folder.is_dir():
        for path in sorted(folder.glob("*.json")):
            if re.fullmatch(r"\d{4}", path.stem):
                body = read_json(path, None)
                if isinstance(body, dict):
                    years[path.stem] = body
    return {"settings": read_json(home() / "settings.json", None), "years": years}


# Writing ---------------------------------------------------------------------------------------

def _unique(names: list[str], message: str, fold: bool = True) -> None:
    """Refuse a list with the same name twice (ignoring capitals and spacing, unless `fold` is off)."""
    seen = set()
    for n in names:
        key = " ".join(n.split()).lower() if fold else n
        if key in seen:
            raise LedgerError(message.format(f"“{n}”" if fold else n))
        seen.add(key)


def save_settings(payload: dict) -> dict:
    try:
        settings = Settings.model_validate(payload)
    except ValidationError as e:
        raise LedgerError(_explain(e))
    kind_ids = {k.id for k in settings.kinds}
    if len(kind_ids) != len(settings.kinds):
        raise LedgerError("Two group types have the same id.")
    if any(g.kind not in kind_ids for g in settings.groups):
        raise LedgerError("A group has a type that doesn't exist.")
    group_ids = {g.id for g in settings.groups}
    if len(group_ids) != len(settings.groups):
        raise LedgerError("Two groups have the same id.")
    if len({c.id for c in settings.cats}) != len(settings.cats):
        raise LedgerError("Two categories have the same id.")
    if any(c.group not in group_ids for c in settings.cats):
        raise LedgerError("A category belongs to a group that doesn't exist.")
    if len({a.id for a in settings.accounts}) != len(settings.accounts):
        raise LedgerError("Two accounts have the same id.")
    _unique([k.name for k in settings.kinds], "Two group types are called {}.")
    _unique([g.name for g in settings.groups], "Two groups are called {}.")
    for gid in group_ids:
        _unique([c.name for c in settings.cats if c.group == gid], "A group has two categories called {}.")
    # no two groups share a colour: their own colours differ, and so do the palette places of groups without one
    _unique([g.color.lower() for g in settings.groups if g.color], "Two groups have the colour {}.", fold=False)
    _unique([str(g.slot) for g in settings.groups if not g.color], "Two groups use palette colour {}.", fold=False)
    data = settings.model_dump(by_alias=True, exclude_none=True)
    daily_backup()
    write_json(home() / "settings.json", data)
    return data


def save_year(year: int, payload: dict) -> dict:
    _check_year(year)
    payload = {k: v for k, v in payload.items() if k != "year"}
    try:
        doc = YearDoc.model_validate(payload)
    except ValidationError as e:
        raise LedgerError(_explain(e))
    data = doc.model_dump()
    daily_backup()
    write_json(_years_dir() / f"{year}.json", data)
    return data


def delete_year(year: int) -> None:
    _check_year(year)
    path = _years_dir() / f"{year}.json"
    if path.exists():
        daily_backup()
        path.unlink()


# Backups ---------------------------------------------------------------------------------------

def _backups_dir():
    return home() / "backups"


def _snapshot(name: str) -> str:
    current = load()
    if current["settings"] is None and not current["years"]:
        return ""  # nothing to keep yet
    write_json(_backups_dir() / name, {"taken": datetime.now().isoformat(timespec="seconds"), **current})
    return name


def daily_backup() -> str:
    """The ledger as it was before today's first change. Once a day; prunes old ones."""
    name = f"auto-{date.today().isoformat()}.json"
    if (_backups_dir() / name).exists():
        return ""
    made = _snapshot(name)
    autos = sorted(_backups_dir().glob("auto-*.json"))
    for old in autos[:-KEEP_AUTO]:
        old.unlink(missing_ok=True)
    return made


def backup_now() -> str:
    made = _snapshot(f"manual-{datetime.now().strftime('%Y-%m-%d-%H%M%S')}.json")
    if not made:
        raise LedgerError("There's nothing to back up yet.")
    return made


def list_backups() -> list[dict]:
    folder = _backups_dir()
    if not folder.is_dir():
        return []
    out = []
    for path in sorted(folder.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True):
        body = read_json(path, {})
        out.append({"name": path.name, "kind": path.name.split("-", 1)[0], "taken": body.get("taken", ""),
                    "years": sorted((body.get("years") or {}).keys()), "size": path.stat().st_size})
    return out


def restore(name: str) -> dict:
    if not re.fullmatch(r"(auto|manual|before-restore)-[0-9-]+\.json", name):
        raise LedgerError("No such backup.")
    path = _backups_dir() / name
    body = read_json(path, None)
    if not isinstance(body, dict):
        raise LedgerError("No such backup.")
    # validate everything before touching the live ledger
    years = body.get("years") or {}
    try:
        settings = Settings.model_validate(body["settings"]) if body.get("settings") else None
        docs = {int(y): YearDoc.model_validate({k: v for k, v in d.items() if k != "year"}) for y, d in years.items()}
    except (ValidationError, ValueError, AttributeError) as e:
        raise LedgerError(f"That backup can't be restored: {e}")
    _snapshot(f"before-restore-{datetime.now().strftime('%Y-%m-%d-%H%M%S')}.json")
    for old in _years_dir().glob("*.json") if _years_dir().is_dir() else []:
        old.unlink()
    for y, doc in docs.items():
        write_json(_years_dir() / f"{y}.json", doc.model_dump())
    if settings:
        write_json(home() / "settings.json", settings.model_dump(by_alias=True, exclude_none=True))
    else:
        (home() / "settings.json").unlink(missing_ok=True)
    return load()
