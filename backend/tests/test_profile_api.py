"""The profile endpoint, the locations catalogue and the live score preview."""

from __future__ import annotations

import pytest
from rest_framework.test import APIClient

pytestmark = pytest.mark.django_db


@pytest.fixture
def client(api_client: APIClient, user_factory) -> APIClient:
    api_client.force_authenticate(user=user_factory())
    return api_client


class TestLocations:
    def test_lists_the_selectable_cities(self, api_client: APIClient) -> None:
        body = api_client.get("/api/locations/").json()

        keys = [entry["key"] for entry in body]
        assert "islamabad" in keys
        assert "rawalpindi" in keys
        assert len(keys) == 12

    def test_country_wide_is_not_offered(self, api_client: APIClient) -> None:
        """`pakistan` exists for profiles, not for the picker."""
        keys = [entry["key"] for entry in api_client.get("/api/locations/").json()]

        assert "pakistan" not in keys

    def test_aliases_are_exposed_for_the_ui(self, api_client: APIClient) -> None:
        body = api_client.get("/api/locations/").json()
        rawalpindi = next(entry for entry in body if entry["key"] == "rawalpindi")

        assert "pindi" in rawalpindi["aliases"]


class TestProfileEndpoint:
    def test_returns_a_seeded_profile(self, client: APIClient) -> None:
        body = client.get("/api/profile/").json()

        assert body["skills"]
        assert body["locationsAllowed"] == ["islamabad", "rawalpindi"]
        assert body["freshness"]["maxAgeDays"] == 7

    def test_weights_can_be_tuned(self, client: APIClient) -> None:
        response = client.patch("/api/profile/", {"skills": {"rust": 7}}, format="json")

        assert response.status_code == 200
        assert response.json()["skills"] == {"rust": 7.0}

    def test_cities_can_be_changed(self, client: APIClient) -> None:
        response = client.patch("/api/profile/", {"locationsAllowed": ["lahore"]}, format="json")

        assert response.status_code == 200
        assert response.json()["locationsAllowed"] == ["lahore"]

    def test_an_empty_city_list_is_rejected(self, client: APIClient) -> None:
        """Allowing none would silently filter out every posting in existence."""
        response = client.patch("/api/profile/", {"locationsAllowed": []}, format="json")

        assert response.status_code == 400

    def test_an_unknown_city_is_rejected(self, client: APIClient) -> None:
        response = client.patch("/api/profile/", {"locationsAllowed": ["atlantis"]}, format="json")

        assert response.status_code == 400

    def test_a_non_numeric_weight_is_rejected(self, client: APIClient) -> None:
        response = client.patch("/api/profile/", {"skills": {"rust": "loads"}}, format="json")

        assert response.status_code == 400

    def test_a_blank_skill_term_is_rejected(self, client: APIClient) -> None:
        """An empty term would otherwise match every posting."""
        response = client.patch("/api/profile/", {"skills": {"  ": 5}}, format="json")

        assert response.status_code == 400

    def test_a_zero_saturation_is_rejected(self, client: APIClient) -> None:
        response = client.patch("/api/profile/", {"stackSaturation": 0}, format="json")

        assert response.status_code == 400

    def test_an_unknown_freshness_key_is_rejected(self, client: APIClient) -> None:
        response = client.patch(
            "/api/profile/", {"freshness": {"maxAgeDays": 30, "nonsense": 1}}, format="json"
        )

        assert response.status_code == 400


class TestScorePreview:
    def test_scores_a_hypothetical_posting(self, client: APIClient) -> None:
        response = client.post(
            "/api/profile/preview/",
            {
                "title": "Associate Software Engineer",
                "location": "Islamabad, Pakistan",
                "description": "ASP.NET Core, C#, Azure",
            },
            format="json",
        )

        assert response.status_code == 200
        body = response.json()
        assert body["filtered"] is False
        assert body["score"] > 0
        assert body["tier"] in {"High", "Medium", "Stretch"}
        assert body["detail"]["skillsHit"]

    def test_explains_why_a_posting_was_filtered_out(self, client: APIClient) -> None:
        """ "It scored nothing" and "it was excluded" are different answers."""
        response = client.post(
            "/api/profile/preview/",
            {"title": "Software Engineer", "location": "Karachi", "description": ""},
            format="json",
        )

        body = response.json()
        assert body["filtered"] is True
        assert body["score"] is None
        assert "location not allowed" in body["filteredReason"]

    def test_reflects_a_weight_change_immediately(self, client: APIClient) -> None:
        """Tuning weights blind is miserable — this is what makes it interactive."""
        payload = {"title": "Rust Engineer", "location": "Islamabad", "description": "Rust"}

        before = client.post("/api/profile/preview/", payload, format="json").json()
        client.patch("/api/profile/", {"skills": {"rust": 45}}, format="json")
        after = client.post("/api/profile/preview/", payload, format="json").json()

        assert after["score"] > before["score"]

    def test_an_empty_posting_still_returns_a_breakdown(self, client: APIClient) -> None:
        response = client.post("/api/profile/preview/", {"location": "Islamabad"}, format="json")

        assert response.status_code == 200
        assert response.json()["detail"]["stack"] == 0


class TestProfileResilience:
    """A profile is user-editable JSON. One bad value must not break a run."""

    def test_malformed_stored_values_do_not_raise(self, user_factory) -> None:
        user = user_factory()
        profile = user.profile
        profile.skills = {"react": "not-a-number", "django": 5}
        profile.locations_allowed = "islamabad"  # a string, not a list
        profile.freshness = {"maxAgeDays": 30, "unexpected": True}
        profile.save()

        domain = profile.to_domain()

        assert domain.skills == {"django": 5.0}
        assert domain.locations_allowed == ()
        assert domain.freshness.max_age_days == 7  # unknown keys ignored, default kept

    def test_a_null_freshness_block_falls_back_to_defaults(self, user_factory) -> None:
        """The column is NOT NULL, but `to_domain` is the last line of defence
        for anything that reaches it from outside the ORM."""
        profile = user_factory().profile
        profile.freshness = None

        assert profile.to_domain().freshness.ghost_points == 1
        assert profile.to_domain().freshness.unknown_date_points == 4
