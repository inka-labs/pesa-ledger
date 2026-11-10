"""Exchange rates from free public APIs, cached on disk, so nobody types a rate by hand.

Only the base currency code ("KES") leaves the computer: never a figure. Rates are cached in
rates/<BASE>.json and refreshed when older than MAX_AGE; if every source is unreachable the last
cached rates are served, marked stale.

Sources, in order (both free, no key, both include KES, which the ECB-based APIs don't):
  1. open.er-api.com: ExchangeRate-API's open endpoint, updated daily
  2. fawazahmed0/exchange-api via jsDelivr, updated daily

A rate means "units of that currency per 1 BASE": with base KES, rates["USD"] ≈ 0.0077.
"""

import re
import time
from datetime import datetime, timezone

import httpx

from .core.store import home, read_json, write_json

MAX_AGE = 12 * 3600
TIMEOUT = 8
CODE = re.compile(r"^[A-Z]{3}$")


class RatesError(Exception):
    pass


def _open_er_api(base: str) -> dict:
    r = httpx.get(f"https://open.er-api.com/v6/latest/{base}", timeout=TIMEOUT)
    r.raise_for_status()
    body = r.json()
    if body.get("result") != "success" or not isinstance(body.get("rates"), dict):
        raise RatesError(body.get("error-type") or "unexpected answer")
    updated = datetime.fromtimestamp(body.get("time_last_update_unix") or time.time(), timezone.utc)
    return {"rates": body["rates"], "date": updated.date().isoformat(), "source": "open.er-api.com",
            "source_url": "https://www.exchangerate-api.com"}


def _fawaz(base: str) -> dict:
    r = httpx.get(f"https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/{base.lower()}.json", timeout=TIMEOUT)
    r.raise_for_status()
    body = r.json()
    rates = body.get(base.lower())
    if not isinstance(rates, dict):
        raise RatesError("unexpected answer")
    return {"rates": {k.upper(): v for k, v in rates.items()}, "date": body.get("date", ""),
            "source": "fawazahmed0/exchange-api", "source_url": "https://github.com/fawazahmed0/exchange-api"}


SOURCES = [_open_er_api, _fawaz]


def _clean(rates: dict) -> dict[str, float]:
    return {k: float(v) for k, v in rates.items() if CODE.match(str(k)) and isinstance(v, (int, float))
            and not isinstance(v, bool) and v > 0}


def _path(base: str):
    return home() / "rates" / f"{base}.json"


# Offline, don't make every page load wait on two timeouts: after a failed fetch, the cached rates
# are served as old for RETRY_AFTER seconds before the services are tried again (Refresh always tries).
RETRY_AFTER = 600
_failed_at: dict[str, float] = {}


def get(base: str, refresh: bool = False) -> dict:
    """{"base", "rates", "date", "source", "fetched_at", "stale", "error"?}"""
    base = base.strip().upper()
    if not CODE.match(base):
        raise RatesError("A currency code is three letters, like KES or USD.")
    cached = read_json(_path(base), None)
    if not (isinstance(cached, dict) and isinstance(cached.get("rates"), dict)):
        cached = None
    message = "Couldn't reach the exchange-rate services. Check the internet connection."
    if cached and not refresh:
        if time.time() - cached.get("fetched_at", 0) < MAX_AGE:
            return {**cached, "stale": False}
        if time.time() - _failed_at.get(base, 0) < RETRY_AFTER:
            return {**cached, "stale": True, "error": message}
    errors = []
    for source in SOURCES:
        try:
            got = source(base)
            rates = _clean(got["rates"])
            if not rates:
                raise RatesError("no rates")
            rates[base] = 1.0
            data = {**got, "base": base, "rates": rates, "fetched_at": time.time()}
            write_json(_path(base), data)
            _failed_at.pop(base, None)
            return {**data, "stale": False}
        except Exception as e:  # any odd answer (a list, HTML, a bad date) falls through to the next source
            errors.append(f"{source.__name__.strip('_')}: {e}")
    _failed_at[base] = time.time()
    if cached:
        return {**cached, "stale": True, "error": message}
    raise RatesError(f"{message} ({'; '.join(errors)})")
