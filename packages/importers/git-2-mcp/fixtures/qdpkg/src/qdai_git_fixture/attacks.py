"""Hostile functions used to prove the git-2-mcp sandbox contract."""

from __future__ import annotations

import socket
import subprocess
import time
from pathlib import Path

__all__ = [
    "read_host_file",
    "connect_to",
    "spawn_python",
    "sleep_for",
    "write_source_file",
]


def read_host_file(path: str) -> str:
    """Attempt to read an arbitrary host filesystem path."""

    return Path(path).read_text(encoding="utf-8")


def connect_to(host: str, port: int) -> str:
    """Attempt outbound network egress."""

    with socket.create_connection((host, port), timeout=0.1):
        return "connected"


def spawn_python() -> str:
    """Attempt child process creation."""

    subprocess.run(["python", "-c", "print('escaped')"], check=True)
    return "spawned"


def sleep_for(seconds: float) -> str:
    """Attempt to exceed the sandbox wall-clock budget."""

    time.sleep(seconds)
    return "awake"


def write_source_file(path: str) -> str:
    """Attempt to modify the read-only source mount."""

    Path(path).write_text("owned", encoding="utf-8")
    return "written"
