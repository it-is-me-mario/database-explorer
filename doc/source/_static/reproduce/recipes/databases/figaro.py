"""FIGARO source adapter; parser and fiscal exceptions stay together."""
from pathlib import Path
import zipfile
import numpy as np
import pandas as pd
from ..common.validation import strict_sum

def load(recipe, path):
    import mario
    if recipe["parser"] not in ['parse_figaro', 'parse_figaro_e3']:
        raise ValueError("Parser does not belong to this database adapter")
    return getattr(mario,recipe["parser"])(path=str(path),calc_all=False,**recipe["parser_options"])


def final_demand_taxes(path, recipe):
    kind=recipe.get("tax_bridge")
    if kind == "figaro_csv":
        from mario.parsers import figaro
        opts = recipe['parser_options'];year=recipe['year']
        mode=opts.get('iot_mode','product');sut=opts.get('table',recipe.get('table'))=='SUT'
        layout=figaro.detect_figaro_sut_layout(year) if sut else figaro.detect_figaro_iot_layout(year,mode=mode)
        metadata=figaro.load_figaro_metadata()
        factor_codes,_=figaro._label_map(metadata,level='f')
        fd_codes,_=figaro._label_map(metadata,level='n')
        _,region_labels=figaro._label_map(metadata,level='r')
        cache=figaro._figaro_cache_file(path,dataflow=layout.use_dataflow if sut else layout.dataflow,year=year,unit=opts.get('unit','MIO_EUR'),row_dim='prd_ava' if sut or layout.mode=='product' else 'ind_ava',col_dim='ind_use' if sut or layout.mode=='industry' else 'prd_use',countries=opts.get('countries'),include_dom=True,factor_codes=factor_codes)
        if cache is None or not cache.is_file():raise ValueError('The exact FIGARO source cache is required for the final-demand tax bridge')
        result={};cells=set()
        for chunk in pd.read_csv(cache,chunksize=500_000):
            taxes=chunk.loc[chunk.refArea.eq('W2') & chunk.rowCode.eq('D21X31') & chunk.colCode.isin(fd_codes)]
            for row in taxes.itertuples(index=False):
                cell=(row.counterpartArea,row.colCode)
                if cell in cells or not np.isfinite(row.obsValue):raise ValueError('Duplicate or missing FIGARO final-demand tax observation')
                cells.add(cell);label=figaro._resolve_figaro_region_label(row.counterpartArea,region_labels)
                result[label]=result.get(label,0.0)+float(row.obsValue)
        expected={region['label'] for region in recipe['regions']}
        if set(result)!=expected or len(cells)!=len(expected)*len(fd_codes):raise ValueError('Incomplete FIGARO final-demand tax bridge')
        return result
    raise ValueError("Unknown FIGARO tax bridge: "+str(kind))


DEMAND_GROUPS={'consumption': ['Final consumption expenditure of general government', 'Final consumption expenditure of households', 'Final consumption expenditure of non-profit institutions serving households'], 'investment': ['Gross fixed capital formation'], 'stocks': ['Changes in inventories and acquisition less disposals of valuables']}

def demand_groups(items):
    observed=set(items);known={x for values in DEMAND_GROUPS.values() for x in values}
    if observed!=known:raise ValueError('Unreviewed final-demand classification; retain the source categories')
    return {'total':list(observed),**DEMAND_GROUPS}
