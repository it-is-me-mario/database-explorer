"""EXIOBASE source adapter; parser and fiscal exceptions stay together."""
from pathlib import Path
import zipfile
import numpy as np
import pandas as pd
from ..common.validation import strict_sum

def load(recipe, path):
    import mario
    if recipe["parser"] not in ['parse_exiobase', 'parse_exiobase_rex']:
        raise ValueError("Parser does not belong to this database adapter")
    return getattr(mario,recipe["parser"])(path=str(path),calc_all=False,**recipe["parser_options"])


def final_demand_taxes(path, recipe):
    kind=recipe.get("tax_bridge")
    if kind == "source_activity_taxes":
        # The source publishes net product taxes only as a row of the value-added
        # block (EXIOBASE Hybrid). It has no final-use tax row, so none is added.
        return {region["label"]: 0.0 for region in recipe["regions"]}
    if kind == "exiobase_matching_iot":
        matching = recipe.get("parser_options", {}).get("add_extensions")
        if not matching or str(matching).startswith("/path/to/"):
            raise ValueError("Supply the exact same-year EXIOBASE IOT via --extensions-path")
        values = final_demand_taxes(matching, {**recipe, "tax_bridge": "exiobase_satellite"})
        # The paired IOT's F_Y is in million EUR; SUT Va is already EUR.
        return {region: value * 1e6 for region, value in values.items()}
    if kind in {"exiobase_factor_inputs", "exiobase_satellite"}:
        relative = ("satellite" if kind == "exiobase_satellite" else "factor_inputs") + "/F_Y.txt"
        if Path(path).is_dir():
            frame = pd.read_csv(Path(path) / relative, sep="\t", index_col=0, header=[0, 1])
        else:
            with zipfile.ZipFile(path) as archive:
                matches = [n for n in archive.namelist() if n.endswith(relative)]
                if len(matches) != 1:
                    raise ValueError("Cannot identify factor_inputs/F_Y.txt in this release")
                with archive.open(matches[0]) as stream:
                    frame = pd.read_csv(stream, sep="\t", index_col=0, header=[0, 1])
        return strict_sum(frame, recipe["product_tax_rows"]).groupby(level=0).sum().to_dict()
    raise ValueError("Unknown EXIOBASE tax bridge: "+str(kind))


DEMAND_GROUPS={
 'consumption':['Final consumption expenditure by households','Final consumption expenditure by non-profit organisations serving households (NPISH)','Final consumption expenditure by government'],
 'investment':['Gross fixed capital formation'],
 'stocks':['Changes in inventories','Changes in valuables'],
}

def demand_groups(items):
    observed=set(items);known={x for values in DEMAND_GROUPS.values() for x in values}|{'Exports: Total (fob)'}
    if not observed<=known:raise ValueError('Unreviewed EXIOBASE final-demand category')
    if not all(set(values)<=observed for values in DEMAND_GROUPS.values()):raise ValueError('Incomplete EXIOBASE final-demand classification')
    return {'total':list(observed),**DEMAND_GROUPS}
