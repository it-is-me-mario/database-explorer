"""ADB source adapter; parser and fiscal exceptions stay together."""
from pathlib import Path
import zipfile
import numpy as np
import pandas as pd
from ..common.validation import strict_sum

def load(recipe, path):
    import mario
    if recipe["parser"] not in ['parse_adb']:
        raise ValueError("Parser does not belong to this database adapter")
    return getattr(mario,recipe["parser"])(path=str(path),calc_all=False,**recipe["parser_options"])


def final_demand_taxes(path, recipe):
    kind=recipe.get("tax_bridge")
    if kind == "adb_excel":
        from mario.parsers.adb import detect_adb_layout, _find_header_rows
        from mario.parsers.specs import ADB_FACTOR_LABELS
        layout = detect_adb_layout(path)
        frame = pd.read_excel(layout.data_path, sheet_name=layout.sheet_name, header=None)
        _, region_row, _, sector_start, _, fd_start, fd_end = _find_header_rows(frame.iloc[:12])
        code = next(k for k, v in ADB_FACTOR_LABELS.items() if v == recipe["product_tax_rows"][0])
        rows = frame[frame.iloc[:, sector_start - 1] == code]
        if len(rows) != 1:
            raise ValueError("Cannot identify the ADB product-tax row")
        taxes = rows.iloc[0, fd_start:fd_end].astype(float)
        if not np.isfinite(taxes).all():
            raise ValueError("Missing ADB final-demand tax value")
        regions = frame.iloc[region_row, fd_start:fd_end].astype(str)
        return taxes.groupby(regions).sum().to_dict()
    raise ValueError("Unknown ADB tax bridge: "+str(kind))
