"""RSS 2.0, Atom, and Google Alerts feeds."""

from __future__ import annotations

from datetime import date

import pytest
import responses

from sources import SourceError, fetch
from sources.base import SourceSpec

FEED_URL = "https://example.com/feed.xml"

RSS_FEED = """<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Jobs</title>
    <item>
      <title>Junior .NET Developer</title>
      <link>https://careers.example.com/jobs/1</link>
      <pubDate>Tue, 12 Aug 2026 09:14:03 +0000</pubDate>
      <description>&lt;p&gt;Work with &lt;b&gt;ASP.NET Core&lt;/b&gt;&lt;/p&gt;</description>
    </item>
    <item>
      <title>QA Engineer</title>
      <link>https://careers.example.com/jobs/2</link>
      <pubDate>Wed, 13 Aug 2026 09:14:03 +0000</pubDate>
      <description>Testing</description>
    </item>
  </channel>
</rss>"""

GOOGLE_ALERTS_FEED = """<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Google Alert - dotnet jobs islamabad</title>
  <entry>
    <title type="html">&lt;b&gt;.NET&lt;/b&gt; Developer at Acme</title>
    <link href="https://www.google.com/url?rct=j&amp;sa=t&amp;url=https://careers.acme.pk/jobs/42&amp;ct=ga&amp;usg=xyz"/>
    <updated>2026-08-14T10:00:00Z</updated>
    <summary type="html">&lt;b&gt;Acme&lt;/b&gt; is hiring a .NET developer in Islamabad</summary>
  </entry>
</feed>"""


def spec(**overrides) -> SourceSpec:
    defaults = {"kind": "rss", "url": FEED_URL, "label": "Example feed"}
    defaults.update(overrides)
    return SourceSpec(**defaults)  # type: ignore[arg-type]


class TestRss20:
    @responses.activate
    def test_parses_items(self) -> None:
        responses.add(responses.GET, FEED_URL, body=RSS_FEED, status=200)

        postings = fetch(spec())

        assert len(postings) == 2
        assert postings[0].title == "Junior .NET Developer"
        assert postings[0].posted_at == date(2026, 8, 12)

    @responses.activate
    def test_html_is_stripped_from_the_description(self) -> None:
        responses.add(responses.GET, FEED_URL, body=RSS_FEED, status=200)

        description = fetch(spec())[0].description

        assert "<p>" not in description and "<b>" not in description
        assert "ASP.NET Core" in description

    @responses.activate
    def test_the_link_is_the_external_id(self) -> None:
        """It is the only stable identifier a feed offers."""
        responses.add(responses.GET, FEED_URL, body=RSS_FEED, status=200)

        assert fetch(spec())[0].external_id == "https://careers.example.com/jobs/1"

    @responses.activate
    def test_the_location_hint_is_applied(self) -> None:
        """A feed rarely states a location, so the source says what it is about."""
        responses.add(responses.GET, FEED_URL, body=RSS_FEED, status=200)

        assert fetch(spec(location_hint="Islamabad, Pakistan"))[0].location == (
            "Islamabad, Pakistan"
        )


class TestGoogleAlerts:
    @responses.activate
    def test_the_redirect_is_unwrapped_to_the_real_url(self) -> None:
        """Stored as-is, every job from an alerts feed points at google.com — and
        two unrelated jobs look like the same URL."""
        responses.add(responses.GET, FEED_URL, body=GOOGLE_ALERTS_FEED, status=200)

        assert fetch(spec())[0].url == "https://careers.acme.pk/jobs/42"

    @responses.activate
    def test_html_is_stripped_from_the_title(self) -> None:
        """Google Alerts bolds the matched term inside the title."""
        responses.add(responses.GET, FEED_URL, body=GOOGLE_ALERTS_FEED, status=200)

        title = fetch(spec())[0].title

        assert title == ".NET Developer at Acme"
        assert "<b>" not in title

    @responses.activate
    def test_atom_entries_are_read_when_there_are_no_rss_items(self) -> None:
        responses.add(responses.GET, FEED_URL, body=GOOGLE_ALERTS_FEED, status=200)

        postings = fetch(spec())

        assert len(postings) == 1
        assert postings[0].posted_at == date(2026, 8, 14)


class TestFailureModes:
    @responses.activate
    def test_malformed_xml_raises_a_source_error(self) -> None:
        """Never an XML parse error escaping into the run."""
        responses.add(responses.GET, FEED_URL, body="<rss><channel>", status=200)

        with pytest.raises(SourceError, match="not valid XML"):
            fetch(spec())

    @responses.activate
    def test_an_empty_feed_is_not_an_error(self) -> None:
        responses.add(
            responses.GET, FEED_URL, body='<?xml version="1.0"?><rss><channel/></rss>', status=200
        )

        assert fetch(spec()) == []

    @responses.activate
    def test_an_item_without_a_title_is_skipped(self) -> None:
        responses.add(
            responses.GET,
            FEED_URL,
            body='<?xml version="1.0"?><rss><channel><item><link>x</link></item></channel></rss>',
            status=200,
        )

        assert fetch(spec()) == []

    def test_a_missing_url_is_rejected_before_any_request(self) -> None:
        with pytest.raises(SourceError, match="url"):
            fetch(SourceSpec(kind="rss"))

    @responses.activate
    def test_a_server_error_becomes_a_source_error(self) -> None:
        responses.add(responses.GET, FEED_URL, body="", status=500)

        with pytest.raises(SourceError):
            fetch(spec())


class TestAdditiveOnly:
    def test_rss_is_marked_additive(self) -> None:
        """A feed is a rolling window, not a full listing. Absence from today's
        fetch proves nothing, so it must never close a job."""
        assert spec().is_additive
