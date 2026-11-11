"""BONSAI source adapter; parser and fiscal exceptions stay together."""
from pathlib import Path
import zipfile
import numpy as np
import pandas as pd
from ..common.validation import strict_sum

def load(recipe, path):
    import mario
    if recipe["parser"] not in ['parse_bonsai']:
        raise ValueError("Parser does not belong to this database adapter")
    options=dict(recipe["parser_options"])
    options.setdefault("year",recipe["year"])
    return getattr(mario,recipe["parser"])(path=str(path),calc_all=False,**options)
