"""Apply frozen chart selections to the small native accounting recipes."""
import numpy as np
from ..common.units import usd_factor

METRICS={'gross_output','domestic_use','final_demand','value_added_footprint','ghg_footprint','ghg_trade','value_added_trade'}

def compute(db,config):
    metric=config['metric'];recipe=config['recipe'];selection=config['selection']
    from . import public_accounts as public
    labels=db.get_index('Region')
    sector_labels=config.get('sector_labels')
    if metric in {'ghg_trade','value_added_trade'}:
        projection=public.native_use_projection(db)
        public.prepare_footprint_model(db,recipe)
    if metric=='ghg_trade':values=public.ghg_trade(db,recipe,sector_labels,projection=projection)
    elif metric=='value_added_trade':
        origin=selection.get('tradeOrigin','total')
        if origin not in {'total','domestic','foreign'}:raise ValueError('Unknown value-added production-origin component')
        values=public.value_added_trade(db,recipe,sector_labels,projection=projection)[origin]
    elif metric in {'gross_output','domestic_use','final_demand'}:
        values=(public.direct_sector_accounts(db,recipe,public.native_use_projection(db),sector_labels) if sector_labels is not None else public.direct_accounts(db,recipe))[metric]
    elif sector_labels is not None:
        projection=public.native_use_projection(db,include_intermediate=False);solved=public.footprints(db,recipe,[metric],retain_multipliers=True)
        if solved['errors']:raise solved['errors'][metric]
        values=public.footprint_from_multipliers(solved['multipliers'].loc[metric],projection,recipe,metric,sector_labels)
    elif metric=='value_added_footprint':values=public.value_added_footprint(db,recipe)['values']
    else:values=public.ghg_footprint(db,recipe)['values']
    if metric=='domestic_use':values=values[selection.get('accountUse','total')]
    elif metric=='final_demand':values=values[selection.get('demandGroup','total')]
    result=[]
    for point in config['points']:
        row=point['row']
        if point['available']:
            if metric in {'ghg_trade','value_added_trade'}:
                pairs=config['native_pairs']
                if not pairs or any(a==b or a not in labels or b not in labels for a,b in pairs):raise ValueError('Incomplete international country pairs')
                rate=config.get('native_to_usd') if metric=='value_added_trade' else 1.
                if metric=='value_added_trade' and rate is None:rate=usd_factor(recipe,config['world_bank'])
                if rate is None:raise ValueError('No observed exchange rate')
                for part in ('intermediate','final'):row[part]=float(sum(values[part][labels.index(a),labels.index(b)] for a,b in pairs))*rate
                row['total']=row['intermediate']+row['final'];row['value']=row[selection.get('tradeUse','total')]
            else:
                codes=point['region_codes']
                if not codes or any(c not in labels for c in codes):raise ValueError('Incomplete selected geography')
                component=point.get('account_component');selected=values[[labels.index(c) for c in codes]]
                value=float(selected.sum() if component is None else selected[:,component].sum())
                if metric not in {'ghg_footprint'}:
                    rate=usd_factor(recipe,config['world_bank'])
                    if rate is None:raise ValueError('No observed exchange rate')
                    value*=rate
                if point.get('population') is not None:value/=point['population']
                elif metric=='ghg_footprint':value/=point['ghg_tonnes_per_unit']
                row['value']=value
        result.append(row)
    return result
