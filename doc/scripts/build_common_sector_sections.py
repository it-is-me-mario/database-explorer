"""Build qualified, atomic NACE Rev. 2 producing-section groups for numerical views.

Read reviewed classification metadata only. Never allocate a native category across
sections or substitute an Activity concordance for a same-named Commodity axis.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path
import re

DOC = Path(__file__).resolve().parents[1]
CLASSIFICATION_ID = "nace-2-common"
CLASSIFICATION = "NACE Rev. 2"
# Eurostat NACE Rev. 2 division-to-section hierarchy; gaps are not divisions.
DIVISIONS = {**dict.fromkeys(range(1, 4), "A"), **dict.fromkeys(range(5, 10), "B"),
             **dict.fromkeys(range(10, 34), "C"), 35: "D", **dict.fromkeys(range(36, 40), "E"),
             **dict.fromkeys(range(41, 44), "F"), **dict.fromkeys(range(45, 48), "G"),
             **dict.fromkeys(range(49, 54), "H"), **dict.fromkeys(range(55, 57), "I"),
             **dict.fromkeys(range(58, 64), "J"), **dict.fromkeys(range(64, 67), "K"), 68: "L",
             **dict.fromkeys(range(69, 76), "M"), **dict.fromkeys(range(77, 83), "N"), 84: "O", 85: "P",
             **dict.fromkeys(range(86, 89), "Q"), **dict.fromkeys(range(90, 94), "R"),
             **dict.fromkeys(range(94, 97), "S"), **dict.fromkeys(range(97, 99), "T"), 99: "U"}


def read(path):
    return json.loads(path.read_text())


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def section_for_code(code):
    """Resolve only numeric NACE Rev. 2 / CPA 2.1 codes, never newer letters."""
    if re.fullmatch(r"[A-U]", code):
        return code
    if not re.fullmatch(r"\d{2}(?:\.\d{1,2}){0,2}", code):
        raise ValueError(f"Not an explicit NACE Rev. 2 / CPA 2.1 code: {code!r}")
    if int(code[:2]) not in DIVISIONS:
        raise ValueError(f"Unknown NACE Rev. 2 division: {code}")
    return DIVISIONS[int(code[:2])]


def family(value):
    return {"Asian Development Bank": "ADB"}.get(value, value)


def axis_dimension(recipe):
    return recipe.get("dimension") if recipe.get("dimension") in {"Activity", "Commodity"} else "Sector"


def mapping_dimension(mapping, recipe):
    if mapping.get("dimension") in {"Activity", "Commodity", "Sector"}:
        return mapping["dimension"]
    if recipe.get("table") == "SUT":
        return "Commodity" if mapping.get("classification_id", "").startswith("cpa") else "Activity"
    return "Sector"


def kind_for_axis(recipe, dimension, old=None):
    if dimension in {"Activity", "Commodity"}:
        return dimension.lower()
    options = recipe.get("parser_options", {})
    if (options.get("system") == "pxp" or options.get("iot_mode") == "product"
            or (old or {}).get("classification_id", "").startswith("cpa")
            or family(recipe.get("source")) == "EMERGING"
            or (family(recipe.get("source")) == "EXIOBASE" and options.get("unit") == "Hybrid")):
        return "commodity"
    return "activity"


class Compiler:
    def __init__(self, doc=DOC):
        self.doc = Path(doc)
        self.data = self.doc / "source/_static/data/economy"
        self.paths = {
            "native_sections": self.data / "sector-sections.json",
            "reviewed_graph": self.data / "sectoral-scope.json",
            "official_activity_bridges": self.doc / "classifications/sectoral/official-activity-bridges.json",
            "native_axes": self.data / "country-scope.json",
            "production_inventory": self.data / "manifest.json",
            "account_recipes": self.doc / "account-source-recipes.json",
            "macro_reviews": self.doc / "classifications/sectoral/common-nace2-macro-reviews.json",
            "proxy_reviews": self.doc / "classifications/sectoral/common-nace2-proxy-reviews.json",
        }
        self.old = read(self.paths["native_sections"])["mappings"]
        self.graph = read(self.paths["reviewed_graph"])
        self.bridges = read(self.paths["official_activity_bridges"])
        self.profiles = read(self.paths["native_axes"])["profiles"]
        self.reviews = read(self.paths["macro_reviews"])
        self.proxies = read(self.paths["proxy_reviews"])["entries"]
        self.sections = next(m["sections"] for m in self.old.values() if m["classification_id"] == "nace-2").copy()
        self.reverse = {"NACE2.1": defaultdict(set), "CPA2.2": defaultdict(set)}
        for edge in self.bridges["edges"]:
            left, right = edge["left"], edge["right"]
            if left[0] == "NACE2" and right[0] == "NACE2.1":
                self.reverse["NACE2.1"][right[1]].add(left[1])
        for step in self.graph["route_steps"].values():
            left, right = step["source_left"], step["source_right"]
            if left[0] == "CPA2.1" and right[0] == "CPA2.2" and step["source"] == "P05":
                self.reverse["CPA2.2"][right[1]].add(left[1])
        self.names = {**self.bridges["node_names"], **self.graph["node_names"]}
        for key in self.names:
            if key.startswith("NACE2:"):
                section_for_code(key.split(":", 1)[1])
        for review in self.reviews["entries"]:
            for code in review["reference_codes"]:
                if f"NACE2:{code}" not in self.names:
                    raise ValueError(f"Macro review lacks an official NACE Rev. 2 reference: {code}")
                if section_for_code(code) not in review["section_codes"]:
                    raise ValueError("Contradictory macro review section")
        self.cached = {}

    def reverse_codes(self, namespace, codes):
        found, missing = set(), []
        for code in codes:
            targets = self.reverse[namespace].get(code, set())
            if not targets:
                missing.append(f"{namespace}:{code}")
            found.update(targets)
        return found, missing

    def route_nodes(self, route):
        if route.get("nodes"):
            return route["nodes"]
        result = []
        for step_id in route.get("steps", []):
            step = self.graph["route_steps"][step_id]
            result.extend([step["source_left"], step["source_right"]])
        return result

    def native_result(self, column, native):
        key = (column["id"], native.get("code"), native["name"])
        if key in self.cached:
            return self.cached[key]
        codes, methods, sources, statuses, missing = set(), set(), set(), set(), []
        links = native.get("links", {})
        for own in links.values():
            link = {**native.get("link_defaults", {}), **own}
            routes = [link, *link.get("alternatives", []), *({"steps": steps} for steps in link.get("alternative_steps", []))]
            statuses.add(link.get("status", "unspecified"))
            for route in routes:
                nodes = self.route_nodes(route)
                prefix = [(ns, code) for ns, code in nodes if ns in {"NACE2", "CPA2.1"}]
                sources.update(self.graph["route_steps"][sid]["source"] for sid in route.get("steps", []))
                if prefix:
                    codes.update(code for _, code in prefix)
                    methods.add("reviewed_route_prefix")
                else:
                    current = [(ns, code) for ns, code in nodes if ns in self.reverse]
                    if not current:
                        missing.append("route without a reviewed common-classification anchor")
                    for namespace, code in current:
                        found, absent = self.reverse_codes(namespace, [code])
                        codes.update(found); missing.extend(absent)
                        methods.add("official_class_reverse")
                        sources.add("S07" if namespace == "NACE2.1" else "P05")
        if not links and native.get("pending", {}).get("references"):
            found, absent = self.reverse_codes("NACE2.1", native["pending"]["references"])
            # Pending fine identities establish a macro group only when all candidates agree.
            if not absent and len({section_for_code(code) for code in found}) == 1:
                codes.update(found); methods.add("bounded_pending_candidates"); statuses.add("fine_identity_pending")
                sources.update(["S07", *(self.graph["route_steps"][sid]["source"] for sid in native["pending"].get("steps", []))])
        if not links and native.get("production_review"):
            review = native["production_review"]
            namespace, producer_codes = review["producer_scope"]
            found, absent = self.reverse_codes(namespace, producer_codes)
            if not absent:
                codes.update(found); methods.add("reviewed_producing_scope"); statuses.add("qualified_producing_scope")
                sources.update([review["source"], "S07"])
        editorial = next((r for r in self.reviews["entries"] if column["family"] == r["family"] and column["kind"] == r["kind"] and native.get("code") == r["native_code"] and native["name"] == r["native_label"]), None)
        if editorial:
            reviewed = set(editorial["section_codes"])
            if codes and {section_for_code(code) for code in codes} != reviewed:
                raise ValueError(f"Macro review contradicts a graph route: {key}")
            if not codes:
                codes.update(editorial["reference_codes"]); methods.add("reviewed_macro_producing_section")
                statuses.add("reviewed_macro_only"); sources.update(editorial["sources"])
        sections = sorted({section_for_code(code) for code in codes}) if not missing else []
        qualification = (
            "Possible native scope from reviewed routes, not exhaustive membership of target sections. "
            "The native category remains whole; section unions do not allocate values or establish fine-class equivalence. "
            "Partial and revision correspondence routes remain qualified."
            if sections else "No complete reviewed common-section anchor; native category remains unassigned."
        )
        if "bounded_pending_candidates" in methods:
            qualification += " Fine identity is pending; all explicitly bounded candidates have the same section."
        if "reviewed_producing_scope" in methods:
            qualification += " Uses the separately reviewed producer-scope constraint, not a product equivalence."
        if editorial:
            qualification += " " + editorial["qualification"]
        result = {"section_codes": sections, "evidence": {"column": column["id"], "native_code": native.get("code", ""), "methods": sorted(methods), "sources": sorted(sources), "route_statuses": sorted(statuses)}, "qualification": qualification}
        if missing:
            result["evidence"]["unresolved"] = sorted(set(missing))
        self.cached[key] = result
        return result

    def match_column(self, recipe, dimension, entries, old):
        kind = kind_for_axis(recipe, dimension, old)
        units = recipe.get("parser_options", {}).get("unit", "Monetary")
        candidates = []
        for column in self.graph["columns"][kind]:
            if column.get("variant")=="REX3" and recipe.get("release")!="REX3":
                continue
            if column["family"] != family(recipe.get("source")) or column.get("units", "Monetary") != units or len(column["native"]) != len(entries):
                continue
            matches = []
            for entry in entries:
                # Exact native names and explicit published codes only, with no fuzzy matching.
                found = [n for n in column["native"] if n["name"] == entry["native_label"]]
                if not found and family(recipe.get("source")) == "EXIOBASE" and recipe.get("release") == "REX3":
                    # REX retains literal CSV quote wrappers on ten semicolon-bearing labels.
                    # This exact, release-specific equivalence still requires a full native bijection.
                    found = [n for n in column["native"] if entry["native_label"] == '"' + n["name"] + '"']
                if not found:
                    code = entry.get("native_code") or entry["native_label"]
                    if kind == "commodity" and family(recipe.get("source")) == "FIGARO":
                        code = code.removeprefix("CPA_")
                    found = [n for n in column["native"] if n.get("code") == code]
                if len(found) != 1:
                    break
                matches.append(found[0])
            if len(matches) == len(entries) and len({id(n) for n in matches}) == len(entries):
                candidates.append((column, matches))
        if len(candidates)>1 and recipe.get('release')=='REX3':
            candidates=[c for c in candidates if c[0].get('variant')=='REX3']
        if len(candidates) > 1:
            raise ValueError(f"Ambiguous native classification: {recipe.get('id')} {dimension}")
        return candidates[0] if candidates else (None, [])

    def compile_axis(self, recipe, dimension, labels, old=None):
        original = {e["native_label"]: e for e in (old or {}).get("entries", [])}
        entries = [{"index": i, "native_label": label, "native_code": original.get(label, {}).get("native_code", "")} for i, label in enumerate(labels)]
        if len(set(labels)) != len(labels):
            raise ValueError(f"Duplicate native labels: {recipe['id']} / {dimension}")
        column, matched = self.match_column(recipe, dimension, entries, old)
        is_emerging = family(recipe.get("source")) == "EMERGING" and (old or {}).get("classification_id") == "nace-2-emerging"
        is_e3 = family(recipe.get("source")) == "FIGARO" and recipe.get("release") == "E3"
        for i, entry in enumerate(entries):
            label = entry["native_label"]
            if is_emerging:
                native = original[label]
                codes = native["section"].split("+") if native.get("section") and all(s in self.sections for s in native["section"].split("+")) else []
                result = {"section_codes": sorted(codes), "evidence": {"methods": ["reviewed_native_rev2_product_group"], "review_sha256": old.get("review_sha256")}, "qualification": "Reviewed native producing-section group retained exactly; no finer equivalence or split is inferred."}
            elif is_e3:
                code = label.removeprefix("CPA_")
                if not re.fullmatch(r"[A-U](?:\d[\dA-Z_]*)?(?:_[A-Z])?", code):
                    raise ValueError(f"Unrecognised published FIGARO E3 code: {label}")
                if len(code) > 2 and code[1:3].isdigit() and section_for_code(code[1:3]) != code[0]:
                    raise ValueError(f"FIGARO E3 code contradicts NACE Rev. 2: {label}")
                entry["native_code"] = label
                result = {"section_codes": [code[0]], "evidence": {"methods": ["published_figaro_e3_broad_code"], "sources": ["FIGARO_E3_CLASSIFICATIONS"]}, "qualification": "Published FIGARO-E3 broad classification code; ad-hoc native disaggregations remain intact. No fine NACE/CPA equivalence or numerical allocation is inferred."}
            elif column:
                entry["native_code"] = entry["native_code"] or matched[i].get("code", "")
                result = self.native_result(column, matched[i])
                if recipe.get("release") == "REX3" and label == '"' + matched[i]["name"] + '"':
                    result = {**result, "evidence": {**result["evidence"], "identity_rule": "Exact single outer CSV quote pair; original native label retained"}}
            else:
                result = {"section_codes": [], "evidence": {"methods": []}, "qualification": "Native axis has no exact reviewed common-section correspondence; retained as unassigned."}
            proxy = next((p for p in self.proxies if p['family']==family(recipe.get('source')) and p['kind']==kind_for_axis(recipe,dimension,old) and p['native_code']==entry['native_code'] and (p['native_label']==label or recipe.get('release')=='REX3' and label=='\"'+p['native_label']+'\"') and p['concordance_section_codes']==result['section_codes']),None)
            if proxy:
                if result['section_codes']!=proxy['concordance_section_codes']:
                    raise ValueError(f"Proxy native scope changed: {recipe['id']} / {label}")
                result={**result,'concordance_section_codes':result['section_codes'],'section_codes':proxy['section_codes'],
                        'qualification':proxy['qualification'],'proxy_note':proxy['qualification'],
                        'evidence':{**result['evidence'],'methods':[*result['evidence']['methods'],'reviewed_main_activity_proxy']}}
            entry.update(result)
            entry["section"] = "+".join(entry["section_codes"]) or "unassigned"
        sections = self.sections.copy()
        for entry in entries:
            section = entry["section"]
            sections.setdefault(section, "Unassigned native categories" if section == "unassigned" else " + ".join(self.sections[code] for code in entry["section_codes"]))
        return {"family": family(recipe.get("source")), "version": recipe.get("release", ""), "classification_id": CLASSIFICATION_ID, "classification": CLASSIFICATION,
                "dimension": dimension, "kind": kind_for_axis(recipe, dimension, old), "sections": sections, "entries": entries,
                "source_url": recipe.get("source_url") or (old or {}).get("source_url"), "classification_url": "https://ec.europa.eu/eurostat/web/nace",
                "basis": "NACE Rev. 2 macrosector proxies based on native main activities/products. Each native category enters once, with boundary differences documented and no numerical split.",
                "coverage_interpretation": "native_main_activity_proxy",
                "complete": all(entry["section_codes"] for entry in entries)}

    def build(self):
        manifest = read(self.paths["production_inventory"])
        recipes = {row["id"]: {**manifest["templates"][row["template"]]["recipe"], **row} for row in manifest["datasets"]}
        for rid in set(self.old) - set(recipes):
            source = self.data / f"{rid}.json"
            if source.exists():
                recipes[rid] = read(source)["recipe"]
        recipes.update({row["recipe"]["id"]: row["recipe"] for row in read(self.paths["account_recipes"])["readings"]})
        profile_for = {rid: profile for profile in self.profiles for rid in profile.get("reading_ids", [])}
        mappings = {}
        for rid, recipe in sorted(recipes.items()):
            old_main = self.old.get(rid)
            olds = [old_main, *old_main.get("additional_mappings", [])] if old_main else []
            dimension = axis_dimension(recipe)
            labels = recipe.get("sectors", [])
            if not labels:
                raise ValueError(f"No native recipe axis: {rid}")
            primary_old = next((m for m in olds if mapping_dimension(m, recipe) == dimension and {e["native_label"] for e in m["entries"]} == set(labels)), None)
            main = self.compile_axis(recipe, dimension, labels, primary_old)
            axes = [(dimension, set(labels))]
            additional = []
            profile = profile_for.get(rid)
            if not profile:
                options = recipe.get("parser_options", {})
                system = options.get("system") or {"industry": "ixi", "product": "pxp"}.get(options.get("iot_mode"))
                matches = [p for p in self.profiles if family(p["family"]) == family(recipe.get("source")) and p.get("release") == recipe.get("release") and p.get("format") == recipe.get("table") and (recipe.get("table") == "SUT" or p.get("system") == system)]
                profile = matches[0] if len(matches) == 1 else None
            source_axes = [(mapping_dimension(m, recipe), [e["native_label"] for e in m["entries"]], m) for m in olds]
            if recipe.get("table") == "SUT" and profile:
                source_axes.extend((dim, profile["sets"][dim], None) for dim in ["Activity", "Commodity"] if dim in profile["sets"])
            if recipe.get("ghg_sectors"):
                source_axes.append((recipe.get("ghg_dimension") or ("Commodity" if recipe.get("table") == "SUT" else dimension), recipe["ghg_sectors"], None))
            for dim, native_labels, old in source_axes:
                if (dim, set(native_labels)) in axes:
                    continue
                # Do not carry a legacy mapping whose labels contradict a known native axis.
                if profile and dim in profile["sets"] and set(native_labels) != set(profile["sets"][dim]):
                    raise ValueError(f"Native axis mismatch: {rid} {dim}")
                axes.append((dim, set(native_labels)))
                additional.append(self.compile_axis(recipe, dim, native_labels, old))
            if additional:
                main["additional_mappings"] = additional
            mappings[rid] = main
        evidence, qualifications = {}, {}
        for mapping in mappings.values():
            for axis in [mapping, *mapping.get("additional_mappings", [])]:
                for entry in axis["entries"]:
                    record = entry["evidence"]
                    eid = "e-" + hashlib.sha256(json.dumps(record, sort_keys=True).encode()).hexdigest()[:16]
                    evidence.setdefault(eid, record)
                    entry["evidence"] = eid
                    text = entry["qualification"]
                    qid = "q-" + hashlib.sha256(text.encode()).hexdigest()[:12]
                    qualifications.setdefault(qid, text)
                    entry["qualification"] = qid
        definitions = {}
        def reference(axis):
            specific = {key: axis[key] for key in ["family", "version", "source_url"]}
            definition = {key: value for key, value in axis.items() if key not in {*specific, "additional_mappings"}}
            did = "d-" + hashlib.sha256(json.dumps(definition, sort_keys=True).encode()).hexdigest()[:20]
            if did in definitions and definitions[did] != definition:
                raise ValueError("Native definition hash collision")
            definitions.setdefault(did, definition)
            ref = {"definition": did, **specific}
            if axis.get("additional_mappings"):
                ref["additional_mappings"] = [reference(other) for other in axis["additional_mappings"]]
            return ref
        mapping_refs = {rid: reference(mapping) for rid, mapping in mappings.items()}
        return {"schema_version": 2, "classification_id": CLASSIFICATION_ID, "classification": CLASSIFICATION, "sections": self.sections,
                "definitions": definitions, "evidence": evidence, "qualifications": qualifications,
                "note": "NACE Rev. 2 macrosector proxies. Native groups are assigned whole by main activity/product, with source boundary differences documented. Inseparable broad groups remain combined. The fine classification explorer retains its original concordances.",
                "input_checksums": {key: digest(path) for key, path in self.paths.items()},
                "sources": {**{key: value for key, value in self.graph["sources"].items()}, **self.reviews["sources"]}, "mappings": mapping_refs}


def resolve_mapping(document, reading_id):
    """Hydrate one reading and its native axes; fail on any broken reference."""
    def resolve(reference):
        definition = document["definitions"][reference["definition"]]
        result = {**definition, **{key: value for key, value in reference.items() if key not in {"definition", "additional_mappings"}}}
        if reference.get("additional_mappings"):
            result["additional_mappings"] = [resolve(ref) for ref in reference["additional_mappings"]]
        return result
    return resolve(document["mappings"][reading_id])


def audit(result):
    counts = defaultdict(Counter)
    unique = {}
    for rid in result["mappings"]:
        mapping = resolve_mapping(result, rid)
        for axis in [mapping, *mapping.get("additional_mappings", [])]:
            key = (axis["family"], axis["kind"], axis["dimension"], tuple((e["native_label"], e["section"]) for e in axis["entries"]))
            unique.setdefault(key, (rid, axis))
    rows = []
    for rid, axis in unique.values():
        counts[axis["family"]]["native_axes"] += 1
        counts[axis["family"]]["entries"] += len(axis["entries"])
        counts[axis["family"]]["unassigned"] += sum(not e["section_codes"] for e in axis["entries"])
        rows.append({"reading": rid, "family": axis["family"], "dimension": axis["dimension"], "kind": axis["kind"], "entries": len(axis["entries"]),
                     "unassigned": [e["native_label"] for e in axis["entries"] if not e["section_codes"]],
                     "mixed_groups": sorted({e["section"] for e in axis["entries"] if len(e["section_codes"]) > 1})})
    return {"readings": len(result["mappings"]), "definitions": len(result["definitions"]), "families": dict(sorted(counts.items())), "native_axes": rows}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DOC / "source/_static/data/economy/common-sector-sections.json")
    parser.add_argument("--audit", type=Path)
    args = parser.parse_args()
    result = Compiler().build()
    args.output.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")) + "\n")
    report = audit(result)
    if args.audit:
        args.audit.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps({key: value for key, value in report.items() if key != "native_axes"}, indent=2))


if __name__ == "__main__":
    main()
