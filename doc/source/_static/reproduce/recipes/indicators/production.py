"""Collect the production-account indicators without an inverse."""
import numpy as np
import pandas as pd
from ..common.validation import characterise
from ..common.quality import annotate_ghg_method
from . import value_added, ghg_production, gdp

def aggregate(db, recipe, tax_fd=None):
    """Aggregate named V/E rows without calculating a Leontief inverse."""
    annotate_ghg_method(recipe)
    if recipe.get("value_added_available") is False:
        # Native hybrid systems can publish emissions without any income accounts.
        # Do not interpret MARIO's zero-filled factor placeholders as observations.
        ghg = characterise(db.get_block(recipe.get("emissions_block", "E")), recipe["ghg_factors"])
        totals = ghg.groupby(level="Region").sum()
        if set(totals.index) != {r["label"] for r in recipe["regions"]}:
            raise ValueError("The source geographic coverage changed; review the recipe")
        return [{"code": r["label"], "name": r["name"], "iso3": r.get("iso3"),
                 "kind": r["kind"], "gdp": None, "value_added": None,
                 "ghg": [float(totals.loc[r["label"]])]} for r in recipe["regions"]]
    block = recipe.get("value_added_block", "V")
    V = db.get_block(block)
    if not V.columns.is_unique:
        raise ValueError("Duplicated regional industry columns")
    if set(V.columns.get_level_values("Region")) != {r["label"] for r in recipe["regions"]}:
        raise ValueError("The source geographic coverage changed; review the recipe")
    va = value_added.values(db, recipe)
    sector_level = recipe.get("sector_level", "Item")
    sector_names = list(recipe["sectors"])
    observed = list(dict.fromkeys(V.columns.get_level_values(sector_level)))
    if set(observed) != set(sector_names):
        raise ValueError("The source economic classification changed; review the recipe")
    ghg = None
    household = None
    ghg_sectors = recipe.get("ghg_sectors", sector_names)
    if recipe.get("ghg_factors"):
        extension = db.get_block(recipe.get("emissions_block", "E"))
        if set(extension.columns.get_level_values(sector_level)) != set(ghg_sectors):
            raise ValueError("The source emissions classification changed; review the recipe")
        ghg = ghg_production.values(db, recipe)
        if recipe.get("final_demand_emissions_loaded", True):
            household = ghg_production.direct(db, recipe)
    taxes, tax_fd = gdp.taxes(db, recipe, tax_fd)
    output = []
    for region in recipe["regions"]:
        code = region["label"]
        series = va.xs(code, level="Region").groupby(level=sector_level).sum()
        entry = {"code": code, "name": region["name"], "iso3": region.get("iso3"),
                 "kind": region["kind"], "value_added": [float(series[s]) for s in sector_names]}
        if ghg is not None:
            gas = ghg.xs(code, level="Region").groupby(level=sector_level).sum()
            entry["ghg"] = [float(gas[s]) for s in ghg_sectors]
            if household is not None:
                entry["household_ghg"] = float(household[code])
        if taxes is not None:
            if code not in tax_fd:
                raise ValueError(f"Missing final-demand tax bridge for {code}")
            entry["net_product_taxes"] = float((taxes[code] + tax_fd[code]) * recipe["currency_scale"])
            entry["gdp"] = float(series.sum() + entry["net_product_taxes"])
        elif recipe.get("gdp_proxy") == "native_value_added":
            entry["gdp"] = sum(entry["value_added"])
        output.append(entry)
    return output
