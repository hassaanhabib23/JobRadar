"""Shared sources every user gets.

Each entry was verified live: the endpoint returned HTTP 200 in the documented
shape, and the board contained at least one Pakistan-based or remote role. The
`verified` date says when — feeds do disappear, and a source that starts failing
should be visible as a change rather than a mystery.

Adding more is a normal operation, not a code change: FR11 exists so a new
Greenhouse company can be added from Django admin, tested, and picked up by the
next run without a redeploy. This list is only the starting point.
"""

from __future__ import annotations

from typing import Any

#: Verified 2026-08-16 unless noted otherwise.
SHARED_SOURCES: list[dict[str, Any]] = [
    # --- From the specification (section 10) ---
    {"kind": "greenhouse", "slug": "careem", "company": "Careem", "label": "Careem"},
    {
        "kind": "greenhouse",
        "slug": "invisibletech",
        "company": "Invisible Technologies",
        "label": "Invisible Technologies",
    },
    {
        "kind": "lever",
        "slug": "smart-working-solutions",
        "company": "Smart Working Solutions",
        "label": "Smart Working Solutions",
    },
    {
        "kind": "workable",
        "slug": "pakistan-mobile-communication-limited-pmcl",
        "company": "Jazz",
        "label": "Jazz (PMCL)",
    },
    {
        "kind": "workable",
        "slug": "bayutdubizzle",
        "company": "Bayut | dubizzle",
        "label": "Bayut | dubizzle",
    },
    {
        "kind": "breezy",
        "slug": "dubizzlelabs",
        "company": "Dubizzle Labs",
        "label": "Dubizzle Labs",
    },
    {"kind": "smartrecruiters", "slug": "nagarro1", "company": "Nagarro", "label": "Nagarro"},
    {
        "kind": "smartrecruiters",
        "slug": "freshworks",
        "company": "Freshworks",
        "label": "Freshworks",
    },
    {
        "kind": "workday",
        "company": "Contour Software",
        "label": "Contour Software",
        "host": "talentmanagementsolution.wd3.myworkdayjobs.com",
        "tenant": "talentmanagementsolution",
        "site": "ContourSoftware-Careers",
    },
    # --- Found by probing Pakistani employers across all five vendors ---
    # The specification's nine yielded only a couple of junior Islamabad roles on
    # any given day. These widen the net considerably; Motive and Zameen alone
    # carry more Pakistan-based postings than the original list combined.
    {"kind": "greenhouse", "slug": "gomotive", "company": "Motive", "label": "Motive"},
    {"kind": "breezy", "slug": "zameen", "company": "Zameen", "label": "Zameen"},
    {"kind": "lever", "slug": "kwanso", "company": "Kwanso", "label": "Kwanso"},
    {"kind": "lever", "slug": "educative", "company": "Educative", "label": "Educative"},
    {"kind": "smartrecruiters", "slug": "devsinc", "company": "Devsinc", "label": "Devsinc"},
    # --- Scraped, best-effort -------------------------------------------
    # The ATS feeds above are the reliable backbone. Most local employers post
    # to Indeed or Bayt instead, which is the gap this closes — at the cost of
    # being blockable. Its cities come from user demand at run time, not from
    # here, so this row is a template rather than a specific search.
    {
        "kind": "jobspy",
        "label": "Job boards",
        "company": "",
        "config": {
            # Indeed and Bayt are considerably more tolerant than LinkedIn.
            "sites": ["indeed", "bayt", "google"],
            "query": "software engineer",
            "country": "pakistan",
            "limit": 40,
        },
    },
]
