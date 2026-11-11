"""GLORIA source adapter; parser and fiscal exceptions stay together."""
from pathlib import Path
import zipfile
import numpy as np
import pandas as pd
from ..common.validation import strict_sum

def load(recipe, path):
    import mario
    if recipe["parser"] not in ['parse_gloria']:
        raise ValueError("Parser does not belong to this database adapter")
    return getattr(mario,recipe["parser"])(path=str(path),calc_all=False,**recipe["parser_options"])


def final_demand_taxes(path, recipe):
    kind=recipe.get("tax_bridge")
    if kind == "gloria_valuations":
        from mario.parsers.gloria import detect_gloria_layout, _iter_csv_batches, _activity_positions
        total = None
        codes = None
        for valuation in ("taxes", "subsidies"):
            layout, metadata = detect_gloria_layout(Path(path), year=recipe["year"], valuation=valuation)
            current_codes = list(metadata.region_codes)
            if codes is not None and current_codes != codes: raise ValueError("Changed GLORIA valuation regions")
            codes = current_codes
            nr, ns, nf = len(codes), len(metadata.sector_names), len(metadata.final_demand_names)
            region_total = np.zeros(nr)
            for block, resource in (("U", layout.T_path), ("Yc", layout.Y_path)):
                columns = _activity_positions(list(range(nr)), ns) if block == "U" else np.arange(nr * nf)
                values_sum = np.zeros(len(columns)); seen = 0
                for rows, values in _iter_csv_batches(resource, columns=columns, dtype=np.dtype("float64"), batch_size=96):
                    if not np.isfinite(values).all(): raise ValueError("Invalid GLORIA product-tax values")
                    values_sum += values[rows % (2 * ns) >= ns].sum(axis=0); seen += len(rows)
                if seen != nr * ns * 2: raise ValueError("Changed GLORIA valuation axes")
                region_total += values_sum.reshape(nr, ns if block == "U" else nf).sum(axis=1)
            if valuation == "subsidies" and np.any(region_total > 1e-6): raise ValueError("Review changed GLORIA subsidy signs")
            total = region_total if total is None else total + region_total
        if set(codes) != {r["label"] for r in recipe["regions"]}: raise ValueError("Changed GLORIA tax coverage")
        return dict(zip(codes, total.tolist()))
    raise ValueError("Unknown GLORIA tax bridge: "+str(kind))
