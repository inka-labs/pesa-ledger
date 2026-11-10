"""Where the ledger keeps its state: ~/<brand.HOME_DIR> (override with the brand.HOME_ENV variable).

Everything in here is someone's finances, so the folder and every file are owner-only, and every
write goes to a temporary file first, is flushed to disk, and is then renamed into place: a crash
or a full disk mid-write never leaves half a file.
"""

import json
import os
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Any

from .. import brand


class DamagedFile(Exception):
    """A file that exists but can't be read as JSON. It has been moved aside to `kept`."""

    def __init__(self, path: Path, kept: Path):
        super().__init__(f"{path.name} couldn't be read and was set aside as {kept.name}.")
        self.path, self.kept = path, kept


def home() -> Path:
    path = Path(os.environ.get(brand.HOME_ENV) or Path.home() / brand.HOME_DIR)
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    return path


def read_json(path: Path, default: Any) -> Any:
    """The file's contents, or `default` when it's missing or unreadable (for caches)."""
    try:
        return json.loads(path.read_text())
    except (FileNotFoundError, ValueError):
        return default


def read_json_strict(path: Path, default: Any) -> Any:
    """Like read_json, for someone's figures: a file that exists but won't parse is never read as
    'nothing here' (the next save would overwrite it). It's renamed to <name>.damaged-<time> so
    nothing is lost, and DamagedFile says where it went."""
    try:
        text = path.read_text()
    except FileNotFoundError:
        return default
    try:
        return json.loads(text)
    except ValueError:
        kept = path.with_name(f"{path.name}.damaged-{datetime.now().strftime('%Y-%m-%d-%H%M%S')}")
        os.replace(path, kept)
        raise DamagedFile(path, kept)


def write_text_private(path: Path, text: str) -> None:
    """Write a file atomically, owner-only from the moment it exists."""
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.")  # mkstemp creates it 0600
    try:
        with os.fdopen(fd, "w") as f:
            f.write(text)
            f.flush()
            os.fsync(f.fileno())
        os.chmod(tmp, 0o600)
        os.replace(tmp, path)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise


def write_json(path: Path, data: Any) -> None:
    write_text_private(path, json.dumps(data, indent=2, default=str))
