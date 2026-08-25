from __future__ import annotations

import io

import pytest
from docx import Document
from pypdf import PdfWriter

from resumes.parsing import ParseError, extract_signals, extract_text


def _pdf_bytes() -> bytes:
    """A minimal valid PDF. pypdf's writer produces a real, parseable file;
    it carries no extractable text, which is exactly what the "no text
    could be extracted" test needs."""
    writer = PdfWriter()
    writer.add_blank_page(width=200, height=200)
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


def _docx_bytes(paragraphs: list[str]) -> bytes:
    document = Document()
    for paragraph in paragraphs:
        document.add_paragraph(paragraph)
    buf = io.BytesIO()
    document.save(buf)
    return buf.getvalue()


class TestExtractText:
    def test_extracts_docx_paragraphs(self):
        data = _docx_bytes(["Senior React Developer", "Skills: React, TypeScript, AWS"])
        text = extract_text(
            data, "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        )
        assert "Senior React Developer" in text
        assert "TypeScript" in text

    def test_rejects_unsupported_content_type(self):
        with pytest.raises(ParseError):
            extract_text(b"whatever", "image/png")

    def test_rejects_a_pdf_with_no_extractable_text(self):
        with pytest.raises(ParseError):
            extract_text(_pdf_bytes(), "application/pdf")

    def test_rejects_garbage_pdf_bytes(self):
        with pytest.raises(ParseError):
            extract_text(b"not a pdf at all", "application/pdf")


class TestExtractSignals:
    def test_detects_skills_with_weights(self):
        signals = extract_signals("Senior React Developer with React, TypeScript and Docker experience")
        assert signals.skills["react"] > 0
        assert signals.skills["typescript"] > 0
        assert signals.skills["docker"] > 0
        assert "python" not in signals.skills

    def test_detects_a_role_keyword_from_skill_overlap(self):
        signals = extract_signals("React TypeScript JavaScript frontend developer")
        assert "react" in signals.role_keywords

    def test_detects_seniority_lead_over_senior(self):
        signals = extract_signals("Senior Engineer, promoted to Lead Engineer in 2024")
        assert signals.seniority == "lead"

    def test_detects_seniority_senior(self):
        signals = extract_signals("Senior Software Engineer with 6 years experience")
        assert signals.seniority == "senior"

    def test_unknown_seniority_when_nothing_matches(self):
        signals = extract_signals("Software Engineer building web applications")
        assert signals.seniority == "unknown"

    def test_no_signals_from_empty_text(self):
        signals = extract_signals("")
        assert signals.skills == {}
        assert signals.role_keywords == ()
        assert signals.seniority == "unknown"
