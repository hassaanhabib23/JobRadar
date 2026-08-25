"""Turning a CV into the same signals a job posting is scored against.

No AI: skills, role focus and seniority are all detected with the identical
substring-matching rule `scoring.text` already applies to job postings
(`scoring/text.py`'s tokenise-pad-substring-match), against the same
vocabulary (`scoring/defaults.py`). What a CV says and what a job posting says
are judged the same way.
"""

from __future__ import annotations

import io
from dataclasses import dataclass

from scoring import defaults
from scoring.text import find_terms, find_weighted


class ParseError(Exception):
    """The file could not be read at all — wrong type, corrupt, or empty."""


_PDF_CONTENT_TYPE = "application/pdf"
_DOCX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


def extract_text(data: bytes, content_type: str) -> str:
    """Plain text from a PDF or DOCX. Raises `ParseError` on anything unreadable."""
    if content_type == _PDF_CONTENT_TYPE:
        text = _extract_pdf_text(data)
    elif content_type == _DOCX_CONTENT_TYPE:
        text = _extract_docx_text(data)
    else:
        raise ParseError(f"Unsupported file type: {content_type}")

    if not text.strip():
        raise ParseError("No text could be extracted from this file.")
    return text


def _extract_pdf_text(data: bytes) -> str:
    from pypdf import PdfReader
    from pypdf.errors import PdfReadError

    try:
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted:
            raise ParseError("This PDF is password-protected.")
        return "\n".join(page.extract_text() or "" for page in reader.pages)
    except PdfReadError as exc:
        raise ParseError("Could not read this PDF.") from exc


def _extract_docx_text(data: bytes) -> str:
    from docx import Document
    from docx.opc.exceptions import PackageNotFoundError

    try:
        document = Document(io.BytesIO(data))
    except PackageNotFoundError as exc:
        raise ParseError("Could not read this document.") from exc
    return "\n".join(paragraph.text for paragraph in document.paragraphs)


#: Checked highest tier first — a CV mentioning both "senior" and "lead" is a
#: lead's CV, not a senior's, so the strongest signal anywhere in the text wins.
_SENIORITY_LADDER: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("lead", ("lead", "principal", "staff", "architect", "head of", "director", "vp", "chief")),
    ("senior", ("senior", "sr", "expert", "manager")),
    (
        "junior",
        (
            "junior",
            "jr",
            "entry",
            "fresh",
            "fresher",
            "associate",
            "graduate",
            "trainee",
            "apprentice",
            "intern",
        ),
    ),
)


@dataclass(frozen=True)
class ResumeSignals:
    skills: dict[str, float]
    role_keywords: tuple[str, ...]
    seniority: str


def extract_signals(text: str) -> ResumeSignals:
    """Pure: no Django, no I/O, testable with plain strings."""
    skills = dict(find_weighted(text, defaults.DEFAULT_SKILLS))
    return ResumeSignals(
        skills=skills,
        role_keywords=_detect_role_keywords(skills),
        seniority=_detect_seniority(text),
    )


def _detect_role_keywords(skills: dict[str, float]) -> tuple[str, ...]:
    """A role preset is suggested once at least half its skill list (rounded
    down, minimum 1) was found in the CV."""
    detected = []
    for role, preset_skills in defaults.ROLE_PRESETS.items():
        threshold = max(1, len(preset_skills) // 2)
        matched = sum(1 for skill in preset_skills if skill in skills)
        if matched >= threshold:
            detected.append(role)
    return tuple(detected)


def _detect_seniority(text: str) -> str:
    for tier, terms in _SENIORITY_LADDER:
        if find_terms(text, terms):
            return tier
    return "unknown"
