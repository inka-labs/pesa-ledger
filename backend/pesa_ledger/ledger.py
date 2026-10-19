"""The ledger on disk, and the shape every write must have.

    ~/.pesa-ledger/settings.json        currency, groups, categories, goals
    ~/.pesa-ledger/years/<year>.json    one year's actual figures, budgets and notes
    ~/.pesa-ledger/backups/*.json       whole-ledger snapshots

A year file holds, per month key "01".."12":
    actual[month][category id]  what really came in or went out
    budget[month][category id]  a budget set for that month on its own
    notes[month]                free text
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


class Group(Strict):
    id: Id
    name: Name
    kind: Literal["income", "saving", "expense"]
    slot: int = Field(ge=0, le=8)


class Category(Strict):
    id: Id
    name: Name
    group: Id
    archived: bool = False


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
    rate: Annotated[float, Field(gt=0, allow_inf_nan=False)] | None = None


class Settings(Strict):
    v: int = 1
    currency: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=5)] = "KES"
    alt: OtherCurrency | None = None
    groups: list[Group] = Field(max_length=40)
    cats: list[Category] = Field(max_length=1000)
    goals: list[Goal] = Field(default_factory=list, max_length=200)
    example: bool = False


class YearDoc(Strict):
    actual: dict[MonthKey, dict[Id, Amount]] = Field(default_factory=dict)
    budget: dict[MonthKey, dict[Id, Amount]] = Field(default_factory=dict)
    plan: dict[Id, Amount] = Field(default_factory=dict)
    notes: dict[MonthKey, Annotated[str, StringConstraints(max_length=10000)]] = Field(default_factory=dict)


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

def save_settings(payload: dict) -> dict:
    try:
        settings = Settings.model_validate(payload)
    except ValidationError as e:
        raise LedgerError(_explain(e))
    group_ids = {g.id for g in settings.groups}
    if len(group_ids) != len(settings.groups):
        raise LedgerError("Two groups have the same id.")
    if len({c.id for c in settings.cats}) != len(settings.cats):
        raise LedgerError("Two categories have the same id.")
    if any(c.group not in group_ids for c in settings.cats):
        raise LedgerError("A category belongs to a group that doesn't exist.")
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
