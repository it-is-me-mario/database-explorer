"""Compatibility entry point for the shared, modular explorer recipes.

The source adapters and indicator recipes in ``recipes/`` are also included in
Download MARIO code. This file retains imports used by historical collectors.
"""
from __future__ import annotations
import argparse,csv,hashlib,json
from pathlib import Path
from recipes.common.validation import strict_sum, characterise
from recipes.common.quality import annotate_source_quality, annotate_ghg_method
from recipes.common.units import usd_factor
from recipes.indicators.production import aggregate
from recipes.databases.loading import load_database, final_demand_taxes
CONFIG=None  # BROWSER_CONFIG

def selected_rows(snapshot, config, wb):
    recipe = config["recipe"]
    metric = config.get("metric", "value_added")
    per_capita = config.get("per_capita", False)
    native_sectors = recipe.get("ghg_sectors", recipe["sectors"]) if metric == "ghg" else recipe["sectors"]
    sectors = config.get("sectors", native_sectors)
    if not sectors:
        raise ValueError("Select at least one industry")
    indices = [native_sectors.index(s) for s in sectors]
    if metric == "gdp" and len(indices) != len(recipe["sectors"]):
        raise ValueError("GDP is available for the whole economy only")
    if config.get("breakdown") and metric in ("value_added", "ghg"):
        yield from selected_rows(snapshot, {**config, "breakdown": False}, wb)
        for sector in sectors:
            yield from selected_rows(snapshot, {**config, "breakdown": False, "sectors": [sector], "industry_row": True}, wb)
        if metric == "ghg" and len(indices) == len(native_sectors) and recipe.get("final_demand_emissions_loaded", True):
            yield from selected_rows(snapshot, {**config, "breakdown": False, "final_demand_row": True}, wb)
        return
    rate = usd_factor(recipe, wb)
    for region in snapshot:
        if config.get("country") and region["code"] != config["country"]:
            continue
        reference = wb["countries"].get(region.get("iso3"), {}).get("years", {}).get(str(recipe["year"]), {})
        value = (sum(region[metric][i] for i in indices) if metric in ("value_added", "ghg") and metric in region
                 else region.get(metric))
        if metric == "ghg" and recipe.get("final_demand_emissions_loaded", True):
            if config.get("final_demand_row"):
                if region.get("household_ghg") is None: continue
                value = region["household_ghg"]
            elif not config.get("industry_row") and len(indices) == len(native_sectors) and value is not None:
                value += region.get("household_ghg", 0)
        if metric == "ghg" and recipe.get("ghg_usable") is False:
            value = None
        if metric in ("gdp", "value_added"):
            value = value * rate if value is not None and rate is not None else None
        if per_capita:
            population = reference.get("population")
            value = value / population if value is not None and population and population > 0 else None
        benchmark = reference.get("gdp_per_capita" if per_capita else "gdp") if metric == "gdp" and recipe.get("price_basis") != "Previous year prices" else None
        yield {"database": recipe["label"], "year": recipe["year"], "region": region["name"],
               "iso3": region.get("iso3"), "indicator": metric,
               "basis": recipe.get("gdp_basis", "GDP") if metric == "gdp" else recipe.get("ghg_basis", "Industry production accounts") if metric == "ghg" else "Industry production accounts",
               "gwp_basis": recipe.get("gwp_basis", "") if metric == "ghg" else "",
               "note": recipe.get("gdp_note", "") if metric == "gdp" else recipe.get("ghg_unavailable_reason", recipe.get("ghg_note", "")) if metric == "ghg" else "",
               "unit": ("t CO2eq" if metric == "ghg" else "previous-year US$" if recipe.get("price_basis") == "Previous year prices" else "current US$") + (" / person" if per_capita else ""),
               "value": value, "world_bank": benchmark,
               "difference_percent": 100 * (value / benchmark - 1) if value is not None and benchmark else None,
               "scope": "Direct final demand" if config.get("final_demand_row") else "Industry" if config.get("industry_row") else "Whole economy" if metric == "gdp" else "Whole economy including direct final demand" if metric == "ghg" and len(indices) == len(native_sectors) and recipe.get("final_demand_emissions_loaded", True) and "household_ghg" in region else "Selected industries total",
               "sectors": "Whole economy" if metric == "gdp" else " | ".join(sectors)}


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("--path", required=True, help="Local input for the selected MARIO parser")
    cli.add_argument("--world-bank", type=Path, help="Optional local copy of the pinned World Bank snapshot")
    cli.add_argument("--output", type=Path, default=Path("mario-browser-selection.csv"))
    args = cli.parse_args()
    if CONFIG is None:
        cli.error("Download this script from a database selection in the MARIO browser")
    import mario
    recipe = CONFIG["recipe"]
    print("Recipe expects MARIO revision:", CONFIG["mario_revision"])
    database = load_database(recipe, args.path)
    tax_fd = final_demand_taxes(args.path, recipe)
    result = aggregate(database, recipe, tax_fd)
    if args.world_bank:
        raw = args.world_bank.read_bytes()
        if hashlib.sha256(raw).hexdigest() != CONFIG["world_bank_sha256"]:
            raise ValueError("World Bank snapshot differs from the reference used in the browser.")
        reference = json.loads(raw)
    else:
        reference = CONFIG["world_bank_reference"]
    rows = list(selected_rows(result, CONFIG, reference))
    if not rows:
        raise ValueError("No rows match the selected filters")
    with args.output.open("w", newline="", encoding="utf-8-sig") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    print(f"Saved {len(rows)} observations to {args.output}")


if __name__=="__main__":
    main()
