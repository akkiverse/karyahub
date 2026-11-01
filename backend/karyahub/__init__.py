"""KaryaHub API: the Python back end behind the KaryaHub web app (CR-0002).

The version comes from studio.json (the file the showcase and the release records use) when it is
next to the code, so /api/health can't fall behind a release again (CR-0010). The Vercel function
bundles only backend/, so the value below is the fallback there; a test keeps the two equal.
"""

import json
from pathlib import Path

_VERSION = "0.7.0"


def _read_version() -> str:
    try:
        return str(json.loads((Path(__file__).resolve().parents[2] / "studio.json").read_text())["version"])
    except (OSError, ValueError, KeyError):
        return _VERSION


__version__ = _read_version()
