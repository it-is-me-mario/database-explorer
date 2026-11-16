"""Regression evidence for the shared numerical NACE Rev. 2 classification."""
import importlib.util
import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("common_sections", ROOT / "doc/scripts/build_common_sector_sections.py")
COMMON = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(COMMON)
DATA = ROOT / "doc/source/_static/data/economy/common-sector-sections.json"


@pytest.fixture(scope="module")
def compiled():
    return json.loads(DATA.read_text())


@pytest.fixture(scope="module")
def compiler():
    return COMMON.Compiler()


def axis(document, reading, dimension=None):
    mapping = COMMON.resolve_mapping(document, reading)
    return next(m for m in [mapping, *mapping.get("additional_mappings", [])] if dimension is None or m["dimension"] == dimension)


def entry(mapping, code):
    return next(e for e in mapping["entries"] if e["native_code"] == code)


def test_generated_asset_is_reproducible_and_compact(compiled, compiler):
    assert compiled == compiler.build()
    assert compiled["schema_version"] == 2
    assert compiled["classification_id"] == "nace-2-common"
    assert len(compiled["definitions"]) < 40
    assert DATA.stat().st_size < 2_000_000


def test_all_readings_and_original_native_axes_are_retained(compiled, compiler):
    manifest = json.loads(compiler.paths["production_inventory"].read_text())
    for row in manifest["datasets"]:
        recipe = {**manifest["templates"][row["template"]]["recipe"], **row}
        mapping = axis(compiled, row["id"])
        assert [e["native_label"] for e in mapping["entries"]] == recipe["sectors"]
        assert mapping["dimension"] == COMMON.axis_dimension(recipe)
    for row in json.loads(compiler.paths["account_recipes"].read_text())["readings"]:
        recipe = row["recipe"]
        assert [e["native_label"] for e in axis(compiled, recipe["id"])["entries"]] == recipe["sectors"]
    for definition in compiled["definitions"].values():
        assert len({e["native_label"] for e in definition["entries"]}) == len(definition["entries"])
        assert [e["index"] for e in definition["entries"]] == list(range(len(definition["entries"])))
        for item in definition["entries"]:
            assert item["section_codes"] == sorted(set(item["section_codes"]))
            assert set(item["section_codes"]) <= set(compiled["sections"])
            assert item["section"] == ("+".join(item["section_codes"]) or "unassigned")
            assert item["section"] in definition["sections"]
            assert item["evidence"] in compiled["evidence"]
            assert item["qualification"] in compiled["qualifications"]
            assert "weight" not in item


def test_exact_target_is_rev2_without_letter_shift(compiled):
    assert COMMON.section_for_code("58.10") == "J"
    assert COMMON.section_for_code("64.11") == "K"
    assert COMMON.section_for_code("68.10") == "L"
    for rid in ["figaro-2024-ixi", "figaro-2024-pxp", "figaro-e3-2015-industry", "figaro-e3-2015-product"]:
        mapping = axis(compiled, rid)
        prefix = "CPA_" if mapping["kind"] == "commodity" else ""
        assert entry(mapping, prefix + "J58")["section"] == "J"
        assert entry(mapping, prefix + "K64")["section"] == "K"
        assert entry(mapping, prefix + "L")["section"] == "L"
    e3 = axis(compiled, "figaro-e3-2015-industry")
    for code in ["F_A", "F_B", "I", "L", "T", "U"]:
        assert entry(e3, code)["section"] == code[0]


def test_rex_quote_equivalence_preserves_source_identity_and_bijection(compiled):
    rex = axis(compiled, "exiobase-rex3-2022-ixi")
    standard = axis(compiled, "exiobase-3112-2024-ixi")
    assert len(rex["entries"]) == 163
    assert len({e["native_code"] for e in rex["entries"]}) == 163
    assert sum(e["native_label"].startswith('"') and e["native_label"].endswith('"') for e in rex["entries"]) == 10
    assert {e["native_code"]: e["section"] for e in rex["entries"]} == {e["native_code"]: e["section"] for e in standard["entries"]}


def test_coarse_reviews_do_not_claim_pending_fine_equivalence(compiled):
    products = axis(compiled, "exiobase-3112-2024-pxp")
    for code in ["p24.b", *[f"p90.5.{letter}" for letter in "abcdef"]]:
        item = entry(products, code)
        assert item["section"] == ("C" if code == "p24.b" else "E")
        evidence = compiled["evidence"][item["evidence"]]
        assert evidence["methods"] == ["reviewed_macro_producing_section"]
        assert "separate from the pending fine product correspondence" in compiled["qualifications"][item["qualification"]]
    activities = axis(compiled, "exiobase-3112-2024-ixi")
    for code in ["i40.11.g", "i40.11.l"]:
        item = entry(activities, code)
        assert item["section"] == "D"
        assert "fine_identity_pending" in compiled["evidence"][item["evidence"]]["route_statuses"]


def test_sut_activity_and_commodity_stay_distinct_despite_shared_labels(compiled):
    activity = axis(compiled, "gloria-060-2024-sut", "Activity")
    commodity = axis(compiled, "gloria-060-2024-sut", "Commodity")
    assert set(e["native_label"] for e in activity["entries"]) == set(e["native_label"] for e in commodity["entries"])
    assert len(activity["entries"]) == len(commodity["entries"]) == 120
    assert activity["kind"] == "activity" and commodity["kind"] == "commodity"
    # Repair/installation uses its separately reviewed product producing-scope union.
    assert entry(activity, "89")["section"] == entry(commodity, "89")["section"] == "C"
    assert "proxy_note" in entry(commodity, "89")
    assert "reviewed_producing_scope" in compiled["evidence"][entry(commodity, "89")["evidence"]]["methods"]
    e3 = axis(compiled, "figaro-e3-2015-sut")
    assert e3["dimension"] == "Commodity" and len(e3["entries"]) == 213
    assert len(axis(compiled, "figaro-e3-2015-sut", "Activity")["entries"]) == 176


def test_emerging_native_rev2_groups_are_not_expanded_through_current_revision(compiled, compiler):
    for rid, old in compiler.old.items():
        if old["family"] != "EMERGING":
            continue
        mapping = axis(compiled, rid)
        original = {e["native_label"]: e["section"] for e in old["entries"]}
        for item in mapping["entries"]:
            expected = original[item["native_label"]]
            if expected and all(code in compiled["sections"] for code in expected.split("+")):
                assert ("+".join(item.get("concordance_section_codes",item["section_codes"]))) == "+".join(sorted(expected.split("+")))
            else:
                assert item["section"] == "unassigned" and item["section_codes"] == []
    assert any(e["section"] == "C" for e in axis(compiled, "emerging-20-2018")["entries"])
    assert any(e.get("concordance_section_codes") == ["A","C"] for e in axis(compiled, "emerging-20-2018")["entries"])


def test_unsupported_native_axes_remain_explicit(compiled):
    for rid in ["bea-2024-summary-sut", "useeio-25-2022-kingbird", "bonsai-b2-2016-hiot-20261021"]:
        mapping = axis(compiled, rid)
        assert not mapping["complete"]
        assert mapping["entries"]
        assert all(e["section"] == "unassigned" and not e["section_codes"] for e in mapping["entries"])


def test_native_match_requires_complete_exact_bijection(compiler):
    recipe = {"id": "fixture", "source": "GLORIA", "release": "060", "table": "SUT", "dimension": "Commodity", "parser_options": {}}
    column = next(c for c in compiler.graph["columns"]["commodity"] if c["family"] == "GLORIA")
    labels = [n["name"] for n in column["native"]]
    assert compiler.compile_axis(recipe, "Commodity", labels)["complete"]
    altered = labels.copy(); altered[0] += " (invented)"
    rejected = compiler.compile_axis(recipe, "Commodity", altered)
    assert all(e["section"] == "unassigned" for e in rejected["entries"])
    with pytest.raises(ValueError, match="Duplicate native labels"):
        compiler.compile_axis(recipe, "Commodity", [labels[0], labels[0]])
    with pytest.raises(KeyError):
        COMMON.resolve_mapping({"mappings": {"missing": {"definition": "absent"}}, "definitions": {}}, "missing")


def test_main_activity_proxies_make_manufacturing_comparable_without_splitting(compiled):
    adb=axis(compiled,"adb-2023-62-economies")
    for code in ["c3","c7","c12","c14","c16"]:
        item=entry(adb,code)
        assert item["section"]=="C" and item["concordance_section_codes"]
        assert "complete native group" in compiled["qualifications"][item["qualification"]]
    assert entry(adb,"c17")["section"]=="D+E"
    for rid in ["emerging-20-2018","exiobase-3112-2024-ixi","wiod-2016-2014-sut"]:
        assert axis(compiled,rid)["coverage_interpretation"]=="native_main_activity_proxy"
