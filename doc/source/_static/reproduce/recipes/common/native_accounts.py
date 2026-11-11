"""Native IOT accounting arrays; keep producer and final-consumer geography."""
import numpy as np
from .validation import strict_sum,characterise

def from_database(db,recipe):
    if db.table_type!='IOT':raise ValueError('This native account recipe currently requires an IOT')
    Z=db.get_block('Z');Y=db.get_block('Y')
    if not Z.index.equals(Z.columns) or not Y.index.equals(Z.index):raise ValueError('Unaligned production/final-demand axes')
    z=Z.to_numpy(dtype=float);y=Y.to_numpy(dtype=float)
    if not np.isfinite(z).all() or not np.isfinite(y).all():raise ValueError('Non-finite native transactions')
    va=strict_sum(db.get_block(recipe.get('value_added_block','V')),recipe['value_added_rows']).to_numpy(dtype=float)
    gases=recipe.get('ghg_factors') if recipe.get('ghg_usable') is not False else None
    ghg=characterise(db.get_block(recipe.get('emissions_block','E')),gases).to_numpy(dtype=float) if gases else None
    ey=characterise(db.get_block('EY'),gases).to_numpy(dtype=float) if gases and recipe.get('final_demand_emissions_loaded',True) else None
    return {'Z':z,'Y':y,'x':z.sum(axis=1)+y.sum(axis=1),'va':va,'ghg':ghg,'ey':ey,
        'producer_regions':Z.index.get_level_values('Region').tolist(),'producer_items':Z.index.get_level_values(-1).tolist(),
        'fd_regions':Y.columns.get_level_values('Region').tolist(),'fd_items':Y.columns.get_level_values(-1).tolist(),'recipe':recipe}

def geography(native):
    labels=list(dict.fromkeys(native['producer_regions']))
    if set(native['fd_regions'])!=set(labels):raise ValueError('Incomplete native final-consumer geography')
    producer=np.array([labels.index(x) for x in native['producer_regions']]);consumer=np.array([labels.index(x) for x in native['fd_regions']])
    return labels,producer,consumer

def regional_flows(native):
    labels,producer,consumer=geography(native);n=len(labels)
    intermediate=np.zeros((len(producer),n));final=np.zeros_like(intermediate)
    for j in range(n):
        intermediate[:,j]=native['Z'][:,producer==j].sum(axis=1)
        final[:,j]=native['Y'][:,consumer==j].sum(axis=1)
    a,b=np.zeros((n,n)),np.zeros((n,n));np.add.at(a,producer,intermediate);np.add.at(b,producer,final)
    return labels,a,b,intermediate,final
