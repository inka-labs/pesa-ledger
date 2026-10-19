"""Where the ledger keeps its state: ~/<brand.HOME_DIR> (override with the brand.HOME_ENV variable).

Everything in here is someone's finances, so the folder and every file are owner-only, and every
write goes to a temporary file first and is then renamed into place: a crash mid-write never leaves
half a file.
"""

import json
import os
import tempfile
from pathlib import Path
from typing import Any

from .. import brand


def home() -> Path:
    path = Path(os.environ.get(brand.HOME_ENV) or Path.home() / brand.HOME_DIR)
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    return path


def read_json(path: Path, default: Any) -> Any:
    try:
        return json.loads(path.read_text())
    except (FileNotFoundError, ValueError):
        return default


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.")
    with os.fdopen(fd, "w") as f:
        json.dump(data, f, indent=2, default=str)
    os.chmod(tmp, 0o600)
    os.replace(tmp, path)
