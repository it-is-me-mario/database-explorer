"""EMERGING source adapter; parser and fiscal exceptions stay together."""
from pathlib import Path
import zipfile
import numpy as np
import pandas as pd
from ..common.validation import strict_sum

def load(recipe, path):
    import mario
    if recipe["parser"] not in ['parse_emerging']:
        raise ValueError("Parser does not belong to this database adapter")
    return getattr(mario,recipe["parser"])(path=str(path),calc_all=False,**recipe["parser_options"])


def unit_label_aliases(recipe,database):
    """The reviewed E workbook and built-in labels differ only in letter case."""
    if not (recipe.get('trade_only') or recipe.get('economic_accounts')) or recipe['parser_options'].get('variant')!='E':return {}
    expected=recipe['sectors'];actual=database.get_index('Sector')
    canonical=[str(x).casefold() for x in expected]
    if len(canonical)!=len(set(canonical)) or canonical!=[str(x).casefold() for x in actual]:
        raise ValueError('EMERGING-E native sector labels differ from the reviewed order')
    return {'Sector':dict(zip(expected,actual))}
