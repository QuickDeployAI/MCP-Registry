"""Small public surface used by the git-2-mcp."""

from __future__ import annotations

__all__ = ["add", "slugify", "summarize", "guess_kind", "TextTools"]


def add(left: int, right: int) -> int:
    """Return the sum of two integers."""

    return left + right


def slugify(value: str) -> str:
    """Normalize a title into a lowercase hyphen-separated slug."""

    return "-".join(value.strip().lower().split())


def summarize(items: list[str]) -> dict[str, int]:
    """Count items and total characters for a list of strings."""

    return {"count": len(items), "characters": sum(len(item) for item in items)}


def guess_kind(value):
    """Return a coarse kind for an untyped value."""

    return type(value).__name__


class TextTools:
    """Fixture class whose public methods should become tool manifest entries."""

    @staticmethod
    def initials(value: str) -> str:
        """Return uppercase initials from a phrase."""

        return "".join(part[0].upper() for part in value.split() if part)

    def repeat(self, value: str, count: int = 2) -> str:
        """Repeat a value a bounded number of times."""

        return value * count

    def _hidden_method(self) -> str:
        """Private methods must not be exposed as MCP tools."""

        return "hidden"


def _private_helper() -> str:
    """Private names must not be exposed as MCP tools."""

    return "hidden"
