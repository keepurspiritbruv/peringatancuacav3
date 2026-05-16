import pytest


class TestTrustedSignFiltering:

    def test_untrusted_codes_are_dropped(self, engine):
        data = {
            "lik_codes": ["wn-10", "wn-11", "wn-1"],
            "active_warning": [],
            "rules": engine.pantai_lampuuk_rules,
        }
        result = engine.predict(data)
        assert result["triggered_lik_codes"] == ["Wn-1"]

    def test_all_trusted_codes_pass_through(self, engine):
        data = {
            "lik_codes": ["wn-1", "wn-3", "wn-9"],
            "active_warning": [],
            "rules": engine.pantai_lampuuk_rules,
        }
        result = engine.predict(data)
        assert set(result["triggered_lik_codes"]) == {"Wn-1", "Wn-3", "Wn-9"}

    def test_active_warning_merged_with_input(self, engine):
        data = {
            "lik_codes": ["wn-1"],
            "active_warning": ["wn-8"],
            "rules": engine.pantai_lampuuk_rules,
        }
        result = engine.predict(data)
        assert set(result["triggered_lik_codes"]) == {"Wn-1", "Wn-8"}

    def test_duplicate_codes_deduplicated(self, engine):
        data = {
            "lik_codes": ["wn-1"],
            "active_warning": ["wn-1"],
            "rules": engine.pantai_lampuuk_rules,
        }
        result = engine.predict(data)
        assert result["triggered_lik_codes"] == ["Wn-1"]


class TestActionEscalation:

    def test_highest_action_wins(self, engine):
        data = {
            "lik_codes": ["wn-1", "wn-2", "wn-3"],
            "active_warning": [],
            "rules": engine.pantai_lampuuk_rules,
        }
        result = engine.predict(data)
        assert "Sesuaikan Jadwal Melaut" in result["action_recommendation"]

    def test_single_code_returns_its_action(self, engine):
        data = {
            "lik_codes": ["wn-4"],
            "active_warning": [],
            "rules": engine.pantai_lampuuk_rules,
        }
        result = engine.predict(data)
        assert "Siaga Penuh" in result["action_recommendation"]

    def test_empty_input_returns_safe_message(self, engine):
        data = {
            "lik_codes": [],
            "active_warning": [],
            "rules": engine.pantai_lampuuk_rules,
        }
        result = engine.predict(data)
        assert result["triggered_lik_codes"] == []
        assert "Tidak ada rekomendasi" in result["action_recommendation"]


class TestResponseShape:

    def test_response_has_all_five_fields(self, engine):
        data = {
            "lik_codes": ["wn-3"],
            "active_warning": [],
            "rules": engine.pantai_lampuuk_rules,
        }
        result = engine.predict(data)
        expected_keys = {"active_warning", "sign_description", "community_characteristics", "action_recommendation", "triggered_lik_codes"}
        assert set(result.keys()) == expected_keys

    def test_triggered_lik_codes_matches_active_warning(self, engine):
        data = {
            "lik_codes": ["wn-3", "wn-7"],
            "active_warning": [],
            "rules": engine.pantai_lampuuk_rules,
        }
        result = engine.predict(data)
        assert result["triggered_lik_codes"] == result["active_warning"]


class TestBeachCommunityCharacteristics:

    def test_depok_is_unsafe(self, engine):
        data = {
            "lik_codes": ["wn-3"],
            "active_warning": [],
            "rules": engine.pantai_depok_rules,
        }
        result = engine.predict(data)
        assert result["community_characteristics"] == "Low Actionable"

    def test_lampuuk_is_safe(self, engine):
        data = {
            "lik_codes": ["wn-3"],
            "active_warning": [],
            "rules": engine.pantai_lampuuk_rules,
        }
        result = engine.predict(data)
        assert result["community_characteristics"] == "Actionable"


class TestSignDescriptions:

    def test_valid_code_returns_info(self, engine):
        descs = engine.get_lik_sign_info(["wn-1"])
        assert len(descs) == 1
        assert descs[0]["code"] == "WN-1"
        assert "Awan tampak turun" in descs[0]["detail_id"]
        assert descs[0]["label_id"] == "Awan Turun"
        assert descs[0]["label_en"] == "Falling Clouds"
        assert descs[0]["detail_en"] == "Clouds appear to descend forming clusters 3 times"

    def test_invalid_code_returns_empty(self, engine):
        descs = engine.get_lik_sign_info(["wn-99"])
        assert descs == []

    def test_mixed_valid_invalid(self, engine):
        descs = engine.get_lik_sign_info(["wn-1", "wn-99", "wn-3"])
        assert len(descs) == 2
        codes = {d["code"] for d in descs}
        assert codes == {"WN-1", "WN-3"}
