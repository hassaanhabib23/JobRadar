from __future__ import annotations

from scoring.defaults import DEFAULT_LEVEL_BONUS, DEFAULT_LEVEL_PENALTY, apply_seniority


class TestApplySeniority:
    def test_unknown_seniority_is_a_no_op(self):
        bonus, penalty = apply_seniority(DEFAULT_LEVEL_BONUS, DEFAULT_LEVEL_PENALTY, "unknown")
        assert bonus == DEFAULT_LEVEL_BONUS
        assert penalty == DEFAULT_LEVEL_PENALTY

    def test_lead_candidate_is_not_penalised_for_senior_or_lead_titles(self):
        bonus, penalty = apply_seniority(DEFAULT_LEVEL_BONUS, DEFAULT_LEVEL_PENALTY, "lead")
        assert bonus["senior"] == 1.0
        assert bonus["lead"] == 1.0
        assert "senior" not in penalty
        assert "lead" not in penalty

    def test_junior_candidate_is_heavily_penalised_for_lead_titles(self):
        bonus, penalty = apply_seniority(DEFAULT_LEVEL_BONUS, DEFAULT_LEVEL_PENALTY, "junior")
        assert penalty["lead"] < 0.2
        assert bonus["junior"] == 1.0

    def test_a_term_further_above_the_candidates_tier_is_penalised_more(self):
        _, penalty = apply_seniority(DEFAULT_LEVEL_BONUS, DEFAULT_LEVEL_PENALTY, "junior")
        assert penalty["lead"] < penalty["senior"]

    def test_terms_outside_the_ladder_are_left_exactly_where_they_were(self):
        _bonus, penalty = apply_seniority(DEFAULT_LEVEL_BONUS, DEFAULT_LEVEL_PENALTY, "senior")
        # "specialist"/"consultant" describe a different job family, not a
        # seniority tier — apply_seniority must not touch them.
        assert penalty["specialist"] == DEFAULT_LEVEL_PENALTY["specialist"]
        assert penalty["consultant"] == DEFAULT_LEVEL_PENALTY["consultant"]

    def test_returns_new_dicts_not_the_originals(self):
        bonus, _penalty = apply_seniority(DEFAULT_LEVEL_BONUS, DEFAULT_LEVEL_PENALTY, "senior")
        bonus["junior"] = -1
        assert DEFAULT_LEVEL_BONUS["junior"] == 1.0
