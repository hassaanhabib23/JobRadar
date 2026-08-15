"""`scoring/` must not import Django.

That constraint is what keeps this package fast to test, independent of the web
framework, and reusable from a Celery task without dragging the ORM in. It is
also the kind of rule that erodes one convenient import at a time, so it is
enforced rather than documented.
"""

from __future__ import annotations

import ast
from pathlib import Path

import scoring

SCORING_DIR = Path(scoring.__file__).parent

FORBIDDEN_ROOTS = {"django", "rest_framework", "celery"}


def _imported_roots(source: Path) -> set[str]:
    tree = ast.parse(source.read_text(encoding="utf-8"), filename=str(source))
    roots: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            roots.update(alias.name.split(".")[0] for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module and node.level == 0:
            roots.add(node.module.split(".")[0])
    return roots


def test_the_package_has_modules_to_check() -> None:
    """Guards the test itself — an empty glob would pass silently."""
    assert len(list(SCORING_DIR.glob("*.py"))) >= 5


def test_no_module_imports_django_or_any_framework() -> None:
    offenders: dict[str, set[str]] = {}

    for module in sorted(SCORING_DIR.glob("*.py")):
        forbidden = _imported_roots(module) & FORBIDDEN_ROOTS
        if forbidden:
            offenders[module.name] = forbidden

    assert not offenders, f"scoring/ must stay framework-free, but found: {offenders}"


def test_scoring_needs_no_database() -> None:
    """No database marker anywhere in this directory — these are pure tests.

    Skips this file, which necessarily names the marker it is looking for.
    """
    here = Path(__file__).parent
    marker = "django" + "_db"

    for test_module in sorted(here.glob("test_*.py")):
        if test_module.name == Path(__file__).name:
            continue
        text = test_module.read_text(encoding="utf-8")
        assert marker not in text, f"{test_module.name} should not need a database"
