"""RSS 2.0 and Atom feeds, including Google Alerts.

One adapter handles both dialects: RSS puts the link in the element text,
Atom puts it in a `href` attribute. Sniffing the shape is less code than two
adapters and means a feed that changes dialect keeps working.

Results are **additive only**. A feed is a rolling window, not a full listing, so
a job's absence from today's fetch proves nothing about whether it is still open
and must never trigger closed-detection.
"""

from __future__ import annotations

from datetime import date
from xml.etree import ElementTree

from scoring.domain import RawPosting
from sources import http
from sources.base import SourceError, SourceSpec, register
from sources.coerce import strip_html, to_date, unwrap_redirect

ATOM_NS = "{http://www.w3.org/2005/Atom}"


@register("rss")
def fetch_rss(spec: SourceSpec) -> list[RawPosting]:
    if not spec.url:
        raise SourceError("rss source needs a url")

    body = http.get_text(spec.url)
    try:
        root = ElementTree.fromstring(body)
    except ElementTree.ParseError as exc:
        raise SourceError(f"rss feed is not valid XML: {exc}") from exc

    postings = [
        posting for item in root.iter("item") if (posting := _from_rss_item(item, spec)) is not None
    ]
    if postings:
        return postings

    # No RSS items — try Atom.
    return [
        posting
        for entry in root.iter(f"{ATOM_NS}entry")
        if (posting := _from_atom_entry(entry, spec)) is not None
    ]


def _from_rss_item(item, spec: SourceSpec) -> RawPosting | None:
    title = strip_html(_find(item, "title"))
    if not title:
        return None

    link = unwrap_redirect(_find(item, "link"))
    published = to_date(_find(item, "pubDate") or _find(item, "date"))

    return _build(spec, title, link, published, strip_html(_find(item, "description")))


def _from_atom_entry(entry, spec: SourceSpec) -> RawPosting | None:
    title = strip_html(_find(entry, f"{ATOM_NS}title"))
    if not title:
        return None

    # Atom puts the target in an attribute, not the element text.
    link = ""
    for candidate in entry.iter(f"{ATOM_NS}link"):
        href = candidate.attrib.get("href", "")
        if href and candidate.attrib.get("rel", "alternate") == "alternate":
            link = href
            break

    published = to_date(_find(entry, f"{ATOM_NS}updated") or _find(entry, f"{ATOM_NS}published"))
    summary = strip_html(_find(entry, f"{ATOM_NS}summary") or _find(entry, f"{ATOM_NS}content"))

    return _build(spec, title, unwrap_redirect(link), published, summary)


def _build(
    spec: SourceSpec, title: str, link: str, published: date | None, description: str
) -> RawPosting:
    return RawPosting(
        source="rss",
        # A feed rarely names the employer in a machine-readable way, so the
        # source's label stands in. Reconciliation can still merge it with an
        # ATS posting once a real company name is known.
        company=spec.company or spec.label or spec.slug or "RSS feed",
        title=title,
        location=spec.location_hint,
        url=link,
        # The link is the only stable identifier a feed offers.
        external_id=link or None,
        posted_at=published,
        description=description,
    )


def _find(element, tag: str) -> str:
    found = element.find(tag)
    return (found.text or "") if found is not None else ""
