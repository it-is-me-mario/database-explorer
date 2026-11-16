"""Finite, explicitly named native accounts; no missing-to-zero substitution."""
import numpy as np
import pandas as pd

def strict_sum(frame, rows):
    """Reject unknown/duplicated labels and missing values instead of guessing."""
    if not rows or len(rows) != len(set(rows)) or not frame.index.is_unique:
        raise ValueError("Expected non-empty, unique indicator rows")
    selected = frame.loc[rows]
    if not np.isfinite(selected.to_numpy(dtype=float)).all():
        raise ValueError("Indicator inputs contain missing or non-finite values")
    return selected.astype(float).sum(axis=0)

def characterise(frame, factors):
    selected = frame.loc[list(factors)]
    if not selected.index.is_unique or not np.isfinite(selected.to_numpy(dtype=float)).all():
        raise ValueError("Invalid GHG rows")
    # Factors include native mass -> tonnes conversion. Already characterised
    # CO2eq rows are scaled once; no second GWP is applied.
    return selected.mul(pd.Series(factors), axis=0).sum(axis=0)
