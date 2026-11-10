"""Run one selected source/indicator recipe from local MARIO inputs."""
from __future__ import annotations
import argparse,csv,json,math
from pathlib import Path
import numpy as np
from .databases.loading import load_database,final_demand_taxes
from .common.units import usd_factor
from .indicators.production import aggregate


def checked(actual, expected, label):
    if expected is not None and not np.isclose(actual,expected,rtol=1e-8,atol=1e-7):
        raise ValueError(f'{label}: local result {actual!r} differs from the selected published result {expected!r}; review the exact release, year and source vintage')
    if not math.isfinite(float(actual)):raise ValueError(label+': non-finite result')
    return float(actual)


def point_value(regions, point, recipe, metric, world_bank):
    codes=point['region_codes'];by_code={r['code']:r for r in regions}
    if not codes or any(c not in by_code for c in codes):raise ValueError('Incomplete selected native geography')
    total=0.
    for code in codes:
        r=by_code[code]
        if point.get('households'):
            value=r.get('household_ghg')
            if value is None:raise ValueError('Direct final-demand emissions are unavailable')
        elif metric=='gdp':
            value=r.get('gdp')
            if value is None:raise ValueError('GDP bridge is unavailable')
        else:
            if metric not in r:raise ValueError('Indicator accounts are unavailable')
            value=sum(r[metric][i] for i in point['sector_indices'])
            if metric=='ghg' and point.get('whole_economy') and recipe.get('final_demand_emissions_loaded') is not False and r.get('household_ghg') is not None:
                value+=r['household_ghg']
        total+=value
    if metric!='ghg':
        rate=usd_factor(recipe,world_bank)
        if rate is None:raise ValueError('No observed same-year exchange rate')
        total*=rate
    if point.get('population') is not None:
        if point['population']<=0:raise ValueError('Population must be positive')
        total/=point['population']
    elif metric=='ghg':total/=point['ghg_tonnes_per_unit']
    return checked(total,point['expected_value'],recipe['id'])


def compute(config, path, overrides=None):
    """Recompute source values; pinned chart values are only validation targets."""
    import copy,mario
    if mario.__version__!='1.3.4':raise RuntimeError('These recipes require mariopy==1.3.4')
    config=copy.deepcopy(config);recipe=config['recipe'];metric=config['metric']
    for key,value in (overrides or {}).items():
        if value is not None:recipe['parser_options'][key]=str(value)
    if not any(p['available'] for p in config['points']):return [p['row'] for p in config['points']]
    if metric=='trade':
        from .indicators.trade import source_recipe
        recipe=source_recipe(recipe,config.get('native_pairs'))
    if metric in {'gross_output','domestic_use','final_demand','value_added_footprint','ghg_footprint','ghg_trade'}:
        recipe['economic_accounts']=True
        recipe['expected_units']={k:v for k,v in recipe.get('expected_units',{}).items() if k in {'Sector','Activity','Commodity'}}
        if recipe['source'] in {'ADB','WIOD','EXIOBASE'} and metric not in {'ghg_footprint','ghg_trade'}:recipe['parser_options'].pop('add_extensions',None)
        if recipe['source']=='EMERGING':
            recipe['parser_options']['load_co2']=metric in {'ghg_footprint','ghg_trade'}
            if not recipe['parser_options']['load_co2']:recipe['parser_options'].pop('co2_path',None)
        if recipe['source']=='GLORIA' and metric not in {'ghg_footprint','ghg_trade'}:recipe['parser_options']['satellites']=False
    db=load_database(recipe,path)
    from .indicators.account_selection import METRICS,compute as compute_account
    if metric in METRICS:
        if metric in {'value_added_footprint','ghg_footprint'}:
            from .indicators.public_accounts import prepare_footprint_model
            prepare_footprint_model(db,recipe)
        result=compute_account(db,config)
        for row,point in zip(result,config['points']):
            if point['available']:
                checked(row['value'],point['expected_value'],recipe['id'])
                if metric=='ghg_trade':
                    for key in ('intermediate','final','total'):checked(row[key],point['expected_components'][key],recipe['id']+' '+key)
        return result
    if metric=='trade':
        from .indicators.trade import selected
        values=selected(db,config)
        result=[]
        for point in config['points']:
            row=point['row']
            if point['available']:
                for key in ('intermediate','final','total'):row[key]=checked(values[key],point['expected_components'][key],recipe['id']+' '+key)
                row['value']=row[config['selection']['tradeUse']]
            result.append(row)
        return result
    taxes=final_demand_taxes(path,recipe) if metric=='gdp' else None
    regions=aggregate(db,recipe,taxes)
    result=[]
    for point in config['points']:
        row=point['row']
        if point['available']:
            row['value']=point_value(regions,point,recipe,metric,config['world_bank'])
            if row.get('world_bank'):
                row['difference_percent']=100*(row['value']/row['world_bank']-1)
        result.append(row)
    return result


def write_csv(path, rows):
    fields=list(dict.fromkeys(k for row in rows for k in row))
    with Path(path).open('w',newline='',encoding='utf-8-sig') as stream:
        writer=csv.DictWriter(stream,fieldnames=fields);writer.writeheader();writer.writerows(rows)


def main(config_file):
    cli=argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--path',required=True,type=Path,help='Exact local source file or directory')
    cli.add_argument('--extensions-path',type=Path)
    cli.add_argument('--co2-path',type=Path)
    cli.add_argument('--output',type=Path,default=Path('reproduced-reading.csv'))
    args=cli.parse_args();config=json.loads(Path(config_file).read_text())
    rows=compute(config,args.path,{'add_extensions':args.extensions_path,'co2_path':args.co2_path})
    write_csv(args.output,rows);print('Saved',len(rows),'recomputed observations to',args.output)
