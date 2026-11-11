"""OECD source adapter; parser and fiscal exceptions stay together."""
from pathlib import Path
import zipfile
import numpy as np
import pandas as pd
from ..common.validation import strict_sum

def load(recipe, path):
    import mario
    if recipe["parser"] not in ['parse_oecd']:
        raise ValueError("Parser does not belong to this database adapter")
    return getattr(mario,recipe["parser"])(path=str(path),calc_all=False,**recipe["parser_options"])


def final_demand_taxes(path, recipe):
    kind=recipe.get("tax_bridge")
    if kind == "oecd_csv":
        frame = pd.read_csv(path, index_col=0)
        selected = strict_sum(frame, recipe["product_tax_rows"])
        result = {}
        for label, value in selected.items():
            if "_" not in label:
                continue
            region, item = label.split("_", 1)
            if item not in recipe["consumption_categories"]:
                continue
            region = {"CN1": "CHN", "CN2": "CHN", "MX1": "MEX", "MX2": "MEX"}.get(region, region)
            if not np.isfinite(value):
                raise ValueError("Missing final-demand tax value")
            result[region] = result.get(region, 0.0) + float(value)
        return result
    raise ValueError("Unknown OECD tax bridge: "+str(kind))


# Resident consumption includes separately recorded direct purchases abroad.
# OECD ICIO methodology: https://doi.org/10.1787/5a5d0665-en (harmonised Use tables).
DEMAND_GROUPS={'consumption': ['HFCE', 'NPISH', 'GGFC', 'DPABR'], 'investment': ['GFCF'], 'stocks': ['INVNT']}

def demand_groups(items):
    observed=set(items);known={x for values in DEMAND_GROUPS.values() for x in values}
    if observed!=known:raise ValueError('Unreviewed final-demand classification; retain the source categories')
    return {'total':list(observed),**DEMAND_GROUPS}
