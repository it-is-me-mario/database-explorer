"""Country accounts through released MARIO APIs for both IOTs and SUTs."""
import numpy as np
import pandas as pd
from .demand_categories import classify


def require_finite(frame,label='native accounts'):
    """Reject observed missing cells with at most one native-column-sized mask."""
    series=[frame] if isinstance(frame,pd.Series) else (column for _,column in frame.items())
    for column in series:
        if isinstance(column.dtype,pd.SparseDtype):
            values=column.array.sp_values
            if len(values)<len(column) and not np.isfinite(column.dtype.fill_value):
                raise ValueError('Non-finite '+label+' (implicit sparse cells)')
        else:values=column.to_numpy(copy=False)
        if not np.isfinite(values).all():raise ValueError('Non-finite '+label)
    return frame


def region_table(frame,regions):
    require_finite(frame,'regional flows')
    result=frame.groupby(level=0,sort=False).sum().T.groupby(level=0,sort=False).sum().T
    result=result.reindex(index=regions,columns=regions)
    if not np.isfinite(result.to_numpy(dtype=float)).all():raise ValueError('Incomplete or non-finite native geography')
    return result


def origin_split(matrix):
    domestic=np.diag(matrix.to_numpy(dtype=float))
    return np.column_stack((domestic,matrix.sum(axis=0).to_numpy()-domestic))


def direct_accounts(db,recipe):
    regions=db.get_index('Region');sut=db.table_type=='SUT';scale=recipe['currency_scale']
    Z=db.query('U' if sut else 'Z');Y=db.query('Yc' if sut else 'Y')
    # Keep native supplying commodities for SUTs; do not substitute supply trade.
    intermediate=region_table(Z,regions);final=region_table(Y,regions)
    output=require_finite(db.query('Xc' if sut else 'X'),'native output').groupby(level=0,sort=False).sum().reindex(regions).iloc[:,0].to_numpy(dtype=float)*scale
    use={'intermediate':np.diag(intermediate.to_numpy())[:,None]*scale,'final':np.diag(final.to_numpy())[:,None]*scale}
    use['total']=use['intermediate']+use['final']
    groups=classify(Y.columns.get_level_values(-1),total_only=recipe.get('demand_category_policy')=='total_only');demand={}
    grouped=Y.groupby(level=0,sort=False).sum()
    for name,items in groups.items():
        selected=grouped.loc[:,grouped.columns.get_level_values(-1).isin(items)]
        country=selected.T.groupby(level=0,sort=False).sum().T.reindex(index=regions,columns=regions)
        if not np.isfinite(country.to_numpy(dtype=float)).all():raise ValueError('Incomplete final-use geography')
        demand[name]=origin_split(country)*scale
    if not np.isfinite(output).all():raise ValueError('Non-finite native output')
    return {'regions':regions,'gross_output':output[:,None],'domestic_use':use,'final_demand':demand,'demand_groups':groups}


def production_income(db,recipe):
    """Independently sum reviewed native income flows by production origin."""
    blocks=['Va','Vc'] if db.table_type=='SUT' else ['V']
    result=pd.Series(0.,index=db.get_index('Region'))
    for block in blocks:
        values=require_finite(db.query(block).loc[recipe['value_added_rows']],'native income').sum(axis=0)
        result=result.add(values.groupby(level=0,sort=False).sum(),fill_value=0)
    return result.reindex(db.get_index('Region')).to_numpy(dtype=float)*recipe['currency_scale']


def check_origin_balance(content,residual,production,label,*,absolute_tolerance=.1):
    allocated=np.asarray(content).sum(axis=1)+np.asarray(residual)
    if not np.allclose(allocated,production,rtol=1e-8,atol=absolute_tolerance):
        difference=allocated-np.asarray(production);i=int(np.argmax(np.abs(difference)))
        raise ValueError(f'{label} does not reconcile independently by production origin {i}: allocated plus residual {allocated[i]:.12g}, production {production[i]:.12g}, difference {difference[i]:.12g}')


def sparse_product(left,right):
    """Multiply labelled blocks without densifying a native sparse supply matrix."""
    from scipy import sparse
    require_finite(left,'matrix product input');require_finite(right,'matrix product input')
    if any(isinstance(t,pd.SparseDtype) for t in [*left.dtypes,*right.dtypes]):
        def csr(frame):
            return frame.sparse.to_coo().tocsr() if all(isinstance(t,pd.SparseDtype) for t in frame.dtypes) else sparse.csr_matrix(frame.to_numpy())
        rhs=csr(right)
        if not left.columns.equals(right.index):
            if not left.columns.is_unique or not right.index.is_unique or len(left.columns)!=len(right.index):raise ValueError('Native matrix product axes do not align')
            positions=right.index.get_indexer(left.columns)
            if (positions<0).any():raise ValueError('Native matrix product axes do not align')
            rhs=rhs[positions]
        matrix=csr(left)@rhs
        if not np.isfinite(matrix.data).all():raise ValueError('Non-finite native matrix product')
        return pd.DataFrame.sparse.from_spmatrix(matrix,index=left.index,columns=right.columns).fillna(0.).astype(pd.SparseDtype(float,0.))
    return require_finite(left@right,'native matrix product')


def regional_coefficients(row,regions):
    from scipy import sparse
    positions={r:i for i,r in enumerate(regions)};values=row.to_numpy(dtype=float)
    if not np.isfinite(values).all():raise ValueError('Non-finite direct coefficients')
    origin=np.asarray([positions[r] for r in row.index.get_level_values(0)])
    matrix=sparse.coo_matrix((values,(origin,np.arange(len(row)))),shape=(len(regions),len(row)))
    return pd.DataFrame.sparse.from_spmatrix(matrix,index=regions,columns=row.index).fillna(0.).astype(pd.SparseDtype(float,0.))


def projected_coefficients(calculate,extensions,z,options=None):
    """Public MARIO solve, optionally refined through its equation residual.

    Refinement solves the same unchanged coefficient system with a correction
    right-hand side. It changes neither source accounts nor an allocation gap.
    Independent production-origin reconciliation remains mandatory afterwards.
    """
    options=options or {};kwargs={'method':'solve','strategy':options.get('strategy','direct')}
    if options.get('solver'):kwargs['solver']=options['solver']
    steps=options.get('refinement_steps',0)
    if steps not in (0,1,2):raise ValueError('Use zero, one or two refinement steps')
    require_finite(extensions,'direct coefficients');require_finite(z,'technical coefficients')
    result=calculate(extensions,z,**kwargs)
    for _ in range(steps):
        residual=extensions-(result-sparse_product(result,z))
        result=result+calculate(residual,z,**kwargs)
    if not np.isfinite(result.to_numpy(dtype=float)).all():raise ValueError('Non-finite projected solve')
    return result


def validate_upstream_units(db,recipe):
    """Reject unsupported unit-dependent SUT co-production without changing it."""
    if recipe.get('upstream_account_usable') is False:
        raise ValueError(recipe.get('upstream_account_note','Upstream allocation has not passed native-unit validation'))
    if db.table_type!='SUT':return
    units=db.units['Commodity']['unit'];known={str(unit) for unit in units if pd.notna(unit)}
    if len(known)<=1 and recipe.get('parser_options',{}).get('unit')!='Hybrid':return
    supply=require_finite(db.query('S'),'native supply');seen=[set() for _ in range(len(supply))]
    for label,column in supply.items():
        unit=units.loc[label[-1]]
        if pd.isna(unit) or str(unit) in {'None','nan',''}:raise ValueError('Unresolved native commodity unit in upstream SUT allocation')
        if isinstance(column.dtype,pd.SparseDtype) and column.dtype.fill_value==0:
            positions=column.array.sp_index.indices[column.array.sp_values!=0]
        else:positions=np.flatnonzero(column.to_numpy(dtype=float)!=0)
        for i in positions:
            seen[i].add(str(unit))
            if len(seen[i])>1:raise ValueError('Mixed-unit SUT co-production needs a reviewed unit-invariant allocation method')


def requirement_gap_summary(db,recipe,gap):
    if recipe.get('direct_account_usable',True):
        return {'signed':float(gap.sum())*recipe['currency_scale'],'absolute':float(abs(gap).sum())*recipe['currency_scale']}
    units=db.units['Commodity' if db.table_type=='SUT' else 'Sector']['unit'];groups={}
    for label,value in gap.items():
        unit=str(units.loc[label[-1]])
        if unit in {'None','nan',''}:unit='Unresolved unit for '+str(label[-1])
        total=groups.setdefault(unit,{'signed':0.,'absolute':0.});total['signed']+=float(value);total['absolute']+=abs(float(value))
    return {'by_native_unit':groups,'qualification':'Native output gaps are separate by supplied unit; mixed quantities are never summed or currency-scaled.'}


def origin_contents(db,recipe,prepared,*,retain_multipliers=False):
    """One public projected solve for all requested origin-specific extensions."""
    import mario
    regions=db.get_index('Region');sut=db.table_type=='SUT';direct={}
    supply=db.query('s') if sut else None
    for metric,inputs in prepared.items():
        rows=inputs['direct_rows']
        direct[metric]=(sparse_product(regional_coefficients(rows[0],regions),supply)+regional_coefficients(rows[1],regions)) if sut else regional_coefficients(rows[0],regions)
    z=sparse_product(db.query('u'),supply) if sut else db.query('z')
    extensions=pd.concat(direct,names=['Indicator','Production origin'])
    # Value added is a monetary extension here; GHG rows retain tonnes. Rows
    # remain separate, so currency and emissions are never added to each other.
    calculate=mario.calc_m_from_z if list(prepared)==['value_added_footprint'] else mario.calc_f_from_z
    multipliers=projected_coefficients(calculate,extensions,z,recipe.get('footprint_compute'))
    y=require_finite(db.query('Yc' if sut else 'Y'),'native final demand').T.groupby(level=0,sort=False).sum().T.reindex(index=z.index,columns=regions)
    contents=multipliers@y;x=require_finite(db.query('Xc' if sut else 'X').reindex(z.index),'native output')
    # Purchases by zero-output users, and parser-preserved source output gaps,
    # do not reach observed final consumers. Trace them separately, without
    # inserting final demand or changing a technical coefficient/diagonal.
    gap=x.iloc[:,0]-sparse_product(z,x).iloc[:,0]-y.sum(axis=1)
    represented=sparse_product(extensions,x).iloc[:,0];outside=multipliers@gap
    results={};errors={}
    for metric,inputs in prepared.items():
        try:
            content=contents.loc[metric].reindex(regions);production=inputs['production']
            direct_unrepresented=production-represented.loc[metric].reindex(regions).to_numpy()
            unassigned=outside.loc[metric].reindex(regions).to_numpy();residual=direct_unrepresented+unassigned
            environment=metric=='ghg_footprint'
            check_origin_balance(content,residual,production,metric,absolute_tolerance=.1 if environment else .1/recipe['currency_scale'])
            scale=1. if environment else recipe['currency_scale'];values=origin_split(content)*scale
            if environment:values[:,0]+=inputs['direct_final_demand']
            results[metric]={'values':values,'by_origin_consumer':content.to_numpy()*scale,
                'production_by_origin':production*scale,'allocated_by_origin':content.sum(axis=1).to_numpy()*scale,
                'unallocated':residual*scale,'unrepresented_direct':direct_unrepresented*scale,
                'unassigned_requirements':unassigned*scale,'source_requirement_gap':requirement_gap_summary(db,recipe,gap)}
            if environment:results[metric]['direct_final_demand']=inputs['direct_final_demand']
        except Exception as error:errors[metric]=error
    output={'results':results,'errors':errors}
    if retain_multipliers:output['multipliers']=multipliers
    return output


def tonnes_per_unit(unit):
    if str(unit).strip().startswith('Mg'):return 1.
    value=str(unit).strip().lower()
    if value.startswith(('kg','kilogram')):return .001
    if value.startswith(('mt','megagram')):return 1e6 if value.startswith('mt') else 1.
    if value.startswith(('gg','gigagram','kt','kilotonne')):return 1e3
    if value=='t' or value.startswith(('tonne','metric ton','t co2')):return 1.
    if value=='g' or value.startswith('gram'):return 1e-6
    raise ValueError('Unreviewed environmental mass unit: '+str(unit))


def characterised_ghg(db,recipe):
    factors=recipe.get('ghg_factors')
    if not factors or recipe.get('ghg_usable') is False:raise ValueError('No reviewed environmental extension')
    regions=db.get_index('Region');units=db.units['Satellite account']['unit'];groups={};sut=db.table_type=='SUT'
    for account,factor in factors.items():groups.setdefault(str(units.loc[account]),{})[account]=factor
    direct_rows=[None,None] if sut else [None];production=pd.Series(0.,index=regions);direct=np.zeros(len(regions))
    for i,(unit,weights) in enumerate(groups.items()):
        conversion=tonnes_per_unit(unit);base_label='Explorer characterised GHG '+str(i);label=base_label
        existing=set(db.get_index('Satellite account'));suffix=2
        while label in existing:label=base_label+' ('+str(suffix)+')';suffix+=1
        for block in (['Ea','Ec'] if sut else ['E'])+(['EY'] if recipe.get('final_demand_emissions_loaded',True) else []):
            require_finite(db.query(block).loc[list(weights)],'native environmental accounts')
        db.calc_ghg(gwp={k:v/conversion for k,v in weights.items()},label=label,unit=unit)
        for j,(coefficient,flow) in enumerate([('ea','Ea'),('ec','Ec')] if sut else [('e','E')]):
            row=db.query(coefficient).loc[label]*conversion
            direct_rows[j]=row if direct_rows[j] is None else direct_rows[j]+row
            production=production.add(require_finite(db.query(flow).loc[label]*conversion,'characterised emissions').groupby(level=0,sort=False).sum(),fill_value=0)
        if recipe.get('final_demand_emissions_loaded',True):
            direct+=require_finite(db.query('EY').loc[label],'direct final-user emissions').groupby(level=0,sort=False).sum().reindex(regions).to_numpy(dtype=float)*conversion
    return {'direct_rows':direct_rows,'production':production.reindex(regions).to_numpy(),'direct_final_demand':direct}


def footprints(db,recipe,metrics=None,*,retain_multipliers=False):
    """Calculate requested footprints together; source failures stay per indicator."""
    metrics=metrics or ['value_added_footprint']+(['ghg_footprint'] if recipe.get('ghg_factors') and recipe.get('ghg_usable') is not False else [])
    prepared={};errors={}
    try:validate_upstream_units(db,recipe)
    except Exception as error:return {'results':{},'errors':{metric:error for metric in metrics}}
    for metric in metrics:
        try:
            if metric=='ghg_footprint':prepared[metric]=characterised_ghg(db,recipe)
            else:
                names=['va','vc'] if db.table_type=='SUT' else ['v']
                prepared[metric]={'direct_rows':[require_finite(db.query(name).loc[recipe['value_added_rows']],'direct income coefficients').sum(axis=0) for name in names],
                    'production':production_income(db,recipe)/recipe['currency_scale']}
        except Exception as error:errors[metric]=error
    if not prepared:return {'results':{},'errors':errors}
    try:result=origin_contents(db,recipe,prepared,retain_multipliers=retain_multipliers)
    except Exception as error:return {'results':{},'errors':{**errors,**{metric:error for metric in prepared}}}
    result['errors'].update(errors);return result


def value_added_footprint(db,recipe):
    result=footprints(db,recipe,['value_added_footprint'])
    if result['errors']:raise result['errors']['value_added_footprint']
    return result['results']['value_added_footprint']


def ghg_footprint(db,recipe):
    result=footprints(db,recipe,['ghg_footprint'])
    if result['errors']:raise result['errors']['ghg_footprint']
    return result['results']['ghg_footprint']


def prepare_footprint_model(db,recipe):
    """Release large transaction blocks after direct indicators have been saved.

    Native absolute production accounts and original output references stay
    available for the independent residual checks. No full inverse is built.
    Calculate direct monetary Trade before calling this helper.
    """
    validate_upstream_units(db,recipe)
    sut=db.table_type=='SUT'
    available=set(db.get_index('Satellite account'))
    requested=list(recipe.get('ghg_factors') or {}) if recipe.get('ghg_usable') is not False else []
    db.keep_extensions([row for row in requested if row in available])
    names=['Xa','Xc','Va','Vc','Ea','Ec'] if sut else ['X','V','E']
    preserved={name:db.query(name) for name in names}
    db.reset_to_coefficients('baseline')
    for name,frame in preserved.items():db.set_block(name,frame)



def native_use_projection(db,*,include_intermediate=True):
    """Keep native supplying nodes and destination regions, before releasing Z/U."""
    regions=db.get_index('Region');sut=db.table_type=='SUT';result={'regions':regions}
    components=([('intermediate','U' if sut else 'Z')] if include_intermediate else [])+[('final','Yc' if sut else 'Y')]
    for component,name in components:
        flow=require_finite(db.query(name),'native '+component+' use')
        projected=flow.T.groupby(level=0,sort=False).sum().T.reindex(columns=regions)
        require_finite(projected,'projected native use');result[component]=projected
    if include_intermediate and not result['intermediate'].index.equals(result['final'].index):raise ValueError('Native supplying-node axes differ')
    return result


def supplying_sector_mask(axis,sector_labels=None):
    if sector_labels is None:return np.ones(len(axis),dtype=bool)
    labels=set(map(str,sector_labels));observed=set(map(str,axis.get_level_values(-1)))
    if not labels or not labels<=observed:raise ValueError('Incomplete supplying-sector selection')
    return np.asarray(axis.get_level_values(-1).isin(labels))


def embodied_trade_from_multipliers(multipliers,projection,recipe,metric,sector_labels=None):
    """Upstream content of signed gross crossings, by the supplying border sector.

    Domestic/foreign value added is relative to the exporting region. The sector
    identifies exported output, not the industries generating upstream content.
    """
    regions=projection['regions'];axis=projection['intermediate'].index
    require_finite(multipliers,'upstream multipliers')
    if not multipliers.columns.equals(axis):
        if not multipliers.columns.is_unique or set(multipliers.columns)!=set(axis):raise ValueError('Upstream and supplying-node axes differ')
        multipliers=multipliers.reindex(columns=axis)
    selected=supplying_sector_mask(axis,sector_labels)
    global_intensity=multipliers.sum(axis=0).to_numpy(dtype=float)
    intensities={'total':global_intensity}
    if metric=='value_added_trade':
        if set(multipliers.index)!=set(regions):raise ValueError('Value-added trade requires every production origin')
        by_origin=multipliers.reindex(regions).to_numpy(dtype=float);positions={r:i for i,r in enumerate(regions)}
        producer=np.asarray([positions[r] for r in axis.get_level_values(0)])
        intensities['domestic']=by_origin[producer,np.arange(len(axis))]
    elif metric!='ghg_trade':raise ValueError('Unknown embodied-trade indicator')
    scale=recipe['currency_scale'] if metric=='value_added_trade' else 1.
    result={origin:{} for origin in intensities}
    for component in ['intermediate','final']:
        flow=require_finite(projection[component],'projected native use').loc[selected]
        for origin,intensity in intensities.items():
            weighted=flow.mul(intensity[selected],axis=0)
            result[origin][component]=weighted.groupby(level=0,sort=False).sum().reindex(index=regions,columns=regions,fill_value=0).to_numpy(dtype=float)*scale
            if not np.isfinite(result[origin][component]).all():raise ValueError('Non-finite embodied trade')
    if metric=='value_added_trade':
        result['foreign']={part:result['total'][part]-result['domestic'][part] for part in ['intermediate','final']}
        return result
    return result['total']


def footprint_from_multipliers(multipliers,projection,recipe,metric,sector_labels):
    """Final-demand supplying-sector slice; direct final-user emissions stay separate."""
    regions=projection['regions'];y=projection['final'];mask=supplying_sector_mask(y.index,sector_labels)
    require_finite(multipliers,'upstream multipliers');require_finite(y,'projected final demand')
    if set(multipliers.index)!=set(regions):raise ValueError('A footprint requires every production origin')
    content=multipliers.reindex(index=regions,columns=y.index).loc[:,mask]@y.loc[mask]
    require_finite(content,'sector footprint')
    return origin_split(content)*(1. if metric=='ghg_footprint' else recipe['currency_scale'])


def direct_sector_accounts(db,recipe,projection,sector_labels):
    """Monetary direct indicators for the same supplying-node sector boundary."""
    regions=projection['regions'];sut=db.table_type=='SUT';axis=projection['final'].index
    mask=supplying_sector_mask(axis,sector_labels);scale=recipe['currency_scale'];use={}
    for component in ['intermediate','final']:
        by_region=projection[component].loc[mask].groupby(level=0,sort=False).sum().reindex(index=regions,columns=regions,fill_value=0)
        use[component]=np.diag(by_region.to_numpy(dtype=float))[:,None]*scale
    use['total']=use['intermediate']+use['final']
    x=require_finite(db.query('Xc' if sut else 'X').reindex(axis),'native output')
    output=x.loc[mask].groupby(level=0,sort=False).sum().reindex(regions,fill_value=0).iloc[:,0].to_numpy(dtype=float)[:,None]*scale
    y=require_finite(db.query('Yc' if sut else 'Y').reindex(axis),'native final demand').loc[mask]
    groups=classify(y.columns.get_level_values(-1),total_only=recipe.get('demand_category_policy')=='total_only');demand={}
    for group,items in groups.items():
        part=y.loc[:,y.columns.get_level_values(-1).isin(items)].groupby(level=0,sort=False).sum().T.groupby(level=0,sort=False).sum().T
        part=part.reindex(index=regions,columns=regions,fill_value=0);demand[group]=origin_split(part)*scale
    return {'gross_output':output,'domestic_use':use,'final_demand':demand}


def value_added_trade(db,recipe,sector_labels=None,*,projection=None):
    projection=native_use_projection(db) if projection is None else projection
    solve_recipe={**recipe,'footprint_compute':recipe.get('trade_compute',recipe.get('footprint_compute',{}))}
    result=footprints(db,solve_recipe,['value_added_footprint'],retain_multipliers=True)
    if result['errors']:raise result['errors']['value_added_footprint']
    return embodied_trade_from_multipliers(result['multipliers'].loc['value_added_footprint'],projection,recipe,'value_added_trade',sector_labels)


def ghg_trade(db,recipe,sector_labels=None,*,projection=None):
    """One global public solve for GHG in gross native flows; direct EY is separate."""
    import mario
    validate_upstream_units(db,recipe)
    projection=native_use_projection(db) if projection is None else projection
    prepared=characterised_ghg(db,{**recipe,'final_demand_emissions_loaded':False});sut=db.table_type=='SUT'
    rows=[row.to_frame('GHG').T for row in prepared['direct_rows']]
    if sut:
        supply=db.query('s');direct=sparse_product(rows[0],supply)+rows[1];z=sparse_product(db.query('u'),supply)
    else:direct=rows[0];z=db.query('z')
    multipliers=projected_coefficients(mario.calc_f_from_z,direct,z,recipe.get('trade_compute',recipe.get('footprint_compute')))
    result=embodied_trade_from_multipliers(multipliers,projection,recipe,'ghg_trade',sector_labels)
    result['total']=result['intermediate']+result['final'];return result


def native_direct_sectors(db,recipe,projection):
    """Small direct aggregates by exact native supplying item, for remapping later."""
    regions=projection['regions'];sut=db.table_type=='SUT';sectors=db.get_index('Commodity' if sut else 'Sector')
    axis=projection['final'].index;rp={r:i for i,r in enumerate(regions)};sp={s:i for i,s in enumerate(sectors)}
    producer=np.asarray([rp[r] for r in axis.get_level_values(0)]);sector=np.asarray([sp[s] for s in axis.get_level_values(-1)])
    shape=(len(sectors),len(regions));scale=recipe['currency_scale'];accounts={};use={}
    x=require_finite(db.query('Xc' if sut else 'X').reindex(axis),'native output').iloc[:,0].to_numpy(dtype=float)
    output=np.zeros(shape);np.add.at(output,(sector,producer),x*scale);accounts['gross_output']=output[:,:,None]
    for part in ['intermediate','final']:
        flow=require_finite(projection[part],'projected native use').to_numpy(dtype=float)
        own=np.zeros(shape);np.add.at(own,(sector,producer),flow[np.arange(len(axis)),producer]*scale);use[part]=own[:,:,None]
    use['total']=use['intermediate']+use['final'];accounts['domestic_use']=use
    y=require_finite(db.query('Yc' if sut else 'Y').reindex(axis),'native final demand')
    groups=classify(y.columns.get_level_values(-1),total_only=recipe.get('demand_category_policy')=='total_only');demand={}
    for group,items in groups.items():
        selected=y.loc[:,y.columns.get_level_values(-1).isin(items)].T.groupby(level=0,sort=False).sum().T.reindex(columns=regions).to_numpy(dtype=float)
        total=np.zeros(shape);np.add.at(total,sector,selected*scale)
        own=np.zeros(shape);np.add.at(own,(sector,producer),selected[np.arange(len(axis)),producer]*scale)
        demand[group]=np.stack([own,total-own],axis=2)
    accounts['final_demand']=demand
    return {'native_sectors':sectors,'accounts':accounts,'demand_groups':groups}


def sum_direct_sectors(native,sector_labels=None):
    labels=native['native_sectors'];selected=list(range(len(labels))) if sector_labels is None else [labels.index(label) for label in sector_labels]
    if not selected:raise ValueError('Empty native direct-sector selection')
    def total(value):
        if isinstance(value,dict):return {k:total(v) for k,v in value.items()}
        a=np.asarray(value,dtype=float)
        if not np.isfinite(a).all():raise ValueError('Non-finite cached direct-sector accounts')
        return a[selected].sum(axis=0)
    return {metric:total(values) for metric,values in native['accounts'].items()}
