"""WIOD source adapter; parser and fiscal exceptions stay together."""
from pathlib import Path
import zipfile
import numpy as np
import pandas as pd
from ..common.validation import strict_sum

def load(recipe, path):
    import mario
    if recipe["parser"] not in ['parse_wiod']:
        raise ValueError("Parser does not belong to this database adapter")
    return getattr(mario,recipe["parser"])(path=str(path),calc_all=False,**recipe["parser_options"])


def final_demand_taxes(path, recipe):
    kind=recipe.get("tax_bridge")
    if kind == "wiod_iot":
        from mario.parsers.wiod import _read_wiod_workbook
        from mario.parsers.specs import WIOD_FINAL_DEMAND_CODES
        frame = _read_wiod_workbook(path)
        rows = frame.loc[frame.iloc[:, 0].eq("TXSP")]
        if len(rows) != 1:
            raise ValueError("Cannot identify the WIOD net product-tax row")
        values = pd.to_numeric(rows.iloc[0, 4:], errors="raise")
        result = {r["label"]: 0.0 for r in recipe["regions"]}
        for value, code, region in zip(values, frame.iloc[2, 4:], frame.iloc[4, 4:]):
            if code in WIOD_FINAL_DEMAND_CODES and region in result:
                result[region] += 0.0 if pd.isna(value) else float(value)
        return result
    raise ValueError("Unknown WIOD tax bridge: "+str(kind))
