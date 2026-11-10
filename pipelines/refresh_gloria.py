"""Refresh numeric GLORIA aggregates in float64 without loading full transactions.

Keep classifications frozen. Verify source tax-component identities and independently
read every final-demand valuation before retaining its GDP bridge.
"""
from pathlib import Path
from types import SimpleNamespace
from dataclasses import replace
from datetime import datetime,timezone
import argparse,copy,hashlib,importlib.util,json,sys,zipfile
import numpy as np
import pandas as pd
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'doc/source/_static/reproduce'))
from recipes.indicators.production import aggregate
from .trade_streams.gloria import polars_csv_batches
from .public_accounts import write


def module(name,path):
    spec=importlib.util.spec_from_file_location(name,path);result=importlib.util.module_from_spec(spec);spec.loader.exec_module(result);return result


def inventory(path):
    with zipfile.ZipFile(path) as archive:
        return [{'name':i.filename,'size':i.file_size,'compressed':i.compress_size,'crc32':f'{i.CRC:08x}'} for i in archive.infolist() if not i.is_dir() and not i.filename.startswith('__MACOSX')]


def refresh(source,year,*,publish=False):
    import mario
    from mario.parsers import gloria as G
    from mario.parsers.specs import GLORIA_MONETARY_UNIT
    if mario.__version__!='1.3.4':raise RuntimeError('Use mariopy==1.3.4')
    identifier=f'gloria-060-{year}-sut';out=ROOT/'doc/source/_static/data/economy';target=out/(identifier+'.json');previous=target.read_bytes();old=json.loads(previous);recipe=copy.deepcopy(old['recipe'])
    economic=source/f'GLORIA_MRIO_Loop060_part_I_MRIOdatabase/GLORIA_MRIOs_60_{year}.zip';satellite=source/f'GLORIA_MRIO_Loop060_part_III_satelliteaccounts/GLORIA_SatelliteAccounts_060_{year}.zip'
    items=inventory(economic);sat_items=inventory(satellite);layout,metadata=G.detect_gloria_layout(economic,year=year)
    tq=next(i for i in sat_items if '_TQ-Results_' in i['name']);yq=next(i for i in sat_items if '_YQ-Results_' in i['name'])
    layout=replace(layout,TQ_path=G.GloriaResource(satellite,tq['name']),YQ_path=G.GloriaResource(satellite,yq['name']))
    codes=list(metadata.region_codes);nr,ns,nf=len(codes),len(metadata.sector_names),len(metadata.final_demand_names)
    if recipe['sectors']!=list(metadata.sector_names) or [r['code'] for r in old['regions']]!=codes:raise ValueError('Native classifications changed; review them separately')
    positions=list(range(nr));ac=G._activity_positions(positions,ns);cc=G._commodity_positions(positions,ns);fd=G._final_demand_positions(positions,nf)
    selected,accounts,units=G._select_gloria_satellites(metadata,'Emissions');aa,ca,fa,va_axis,sa=G._build_axes(codes,metadata.sector_names,metadata.factor_names,metadata.final_demand_names,tuple(accounts))
    for axis in [aa,ca,fa]:axis.names=['Region','Level','Item']
    print('READ',identifier,'native indicator blocks float64',flush=True)
    vd,vc=G._read_value_added_blocks(layout.V_path,activity_columns=ac,commodity_columns=cc,factor_count=len(va_axis),selected_positions=positions,va_shape=(len(va_axis),len(aa)),vc_shape=(len(va_axis),len(ca)),dtype=np.dtype('float64'))
    ea,ec=G._read_satellite_transaction_blocks(layout.TQ_path,activity_columns=ac,commodity_columns=cc,row_map={raw:i for i,raw in enumerate(selected)},dtype=np.dtype('float64'))
    ey=G._read_sparse_all_rows(layout.YQ_path,columns=fd,row_map={raw:i for i,raw in enumerate(selected)},dtype=np.dtype('float64'))
    blocks={'Va':pd.DataFrame(vd,index=va_axis,columns=aa),'Vc':G._sparse_dataframe(vc,va_axis,ca),'Ea':G._sparse_dataframe(ea,sa,aa),'Ec':G._sparse_dataframe(ec,sa,ca),'EY':G._sparse_dataframe(ey,sa,fa)}
    if np.abs(blocks['Vc'].loc[recipe['value_added_rows']].to_numpy()).sum()!=0:raise ValueError('Commodity income is nonzero; review the production definition before refresh')
    if np.abs(blocks['Ec'].loc[list(recipe['ghg_factors'])].to_numpy()).sum()!=0:raise ValueError('Commodity GHG is nonzero; review the production definition before refresh')
    temporary=copy.deepcopy(recipe);temporary.update(gdp_bridge_verified=False,tax_bridge=None)
    db=SimpleNamespace(table_type='SUT',get_block=blocks.__getitem__)
    rows=aggregate(db,temporary)
    bridge_path=ROOT/f'doc/scripts/gloria/gdp-bridge{"" if year==2024 else "-"+str(year)}.json';bridge=json.loads(bridge_path.read_text());by_member={i['name']:i for i in items}
    if bridge['region_codes']!=codes:raise ValueError('GDP bridge geography changed')
    for expected in bridge['sources']:
        if any(by_member[expected['name']][key]!=expected[key] for key in ['size','crc32']):raise ValueError('GDP tax-component source changed')
    stage=ROOT/'_cache/gloria-refresh'/identifier;stage.mkdir(parents=True,exist_ok=True);fingerprints={};expenditure=0.;summaries={}
    for markup in range(1,6):
        member=next(i for i in items if f'_Y-Results_{year}_060_Markup00{markup}' in i['name']);cache=stage/f'Y{markup}.json'
        cached=json.loads(cache.read_text()) if cache.exists() else {}
        if cached.get('member')==member:
            totals=np.asarray(cached['totals']);fingerprints.update(cached['fingerprints'])
        else:
            print('READ final valuation',markup,flush=True);totals=np.zeros((2,nr*nf));seen=0;current={}
            for raw,values in polars_csv_batches(G.GloriaResource(economic,member['name']),columns=np.arange(nr*nf),dtype=np.dtype('float64'),batch_size=1024,input_digests=current):
                if not np.isfinite(values).all():raise ValueError('Non-finite final-demand valuation')
                mask=raw%(2*ns)<ns;totals[0]+=values[mask].sum(axis=0);totals[1]+=values[~mask].sum(axis=0);seen+=len(raw)
            if seen!=nr*ns*2:raise ValueError('Incomplete native final-demand rows')
            write(cache,{'member':member,'totals':totals,'fingerprints':current});fingerprints.update(current)
        summaries[markup]=totals;expenditure+=float(totals[1].sum())*recipe['currency_scale']
        if markup in (4,5):
            kind='product_taxes' if markup==4 else 'product_subsidies'
            np.testing.assert_allclose(totals[1].reshape(nr,nf).sum(axis=1),bridge['components_native'][kind]['final'],rtol=1e-11,atol=1e-5)
    np.testing.assert_allclose(expenditure,bridge['validation']['world_gdp_expenditure'],rtol=1e-12,atol=.1)
    va=np.asarray([sum(r['value_added']) for r in rows]);tax=np.asarray(bridge['net_product_taxes']);gdp=va+tax;residual=float(gdp.sum()-expenditure);tolerance=bridge['validation']['tolerance']
    if abs(residual)>abs(expenditure)*tolerance:raise ValueError('World GDP identity exceeds its existing tolerance')
    bridge['gdp']=gdp.tolist();bridge['validation'].update(world_value_added=float(va.sum()),world_gdp_income=float(gdp.sum()),world_gdp_expenditure=expenditure,income_minus_expenditure=residual,relative_residual=residual/expenditure)
    recipe['parser_options']['dtype']='float64';recipe['economic_vintage']=min(i['name'][:8] for i in items if i['name'][:8].isdigit());recipe['satellite_vintage']=tq['name'][:8]
    provenance=copy.deepcopy(old['provenance']);provenance.update(mario_version=mario.__version__,previous_snapshot_sha256=hashlib.sha256(previous).hexdigest(),options=copy.deepcopy(recipe['parser_options']),reading_scope='Native Va/Vc/Ea/Ec/EY in float64; full transactions and inverses are not loaded.',economic_members=items,satellite_members=sat_items,readme_sha256=hashlib.sha256(layout.readme_path.read_bytes()).hexdigest(),numeric_refresh_reason='The previous full-parser numeric snapshot used float32 monetary aggregates. Native float64 blocks now match other annual readings; GDP tax-component identities and every final-demand valuation were rechecked.',final_valuation_inputs=list(fingerprints.values()))
    snapshot={'schema_version':1,'recipe':recipe,'regions':rows,'provenance':provenance,'generated_at':datetime.now(timezone.utc).isoformat()};taxes=module('gloria_product_taxes',ROOT/'doc/scripts/gloria/product_taxes.py');taxes.apply(snapshot,bridge)
    validation={'world_value_added_delta':float(va.sum()-sum(sum(r['value_added']) for r in old['regions'])),'world_ghg_delta':sum(sum(r['ghg'])+r['household_ghg'] for r in rows)-sum(sum(r['ghg'])+r['household_ghg'] for r in old['regions']),'gdp':bridge['validation']}
    write(stage/'snapshot.json',snapshot);write(stage/'gdp-bridge.json',bridge);write(stage/'validation.json',validation)
    if publish:
        builder=module('economy_builder',ROOT/'doc/scripts/build_economy_browser.py');builder.publish(recipe,rows,provenance,out);write(bridge_path,bridge)
        path=ROOT/'doc/economy_browser.recipes.json';catalogue=json.loads(path.read_text());next(r for r in catalogue['recipes'] if r['id']==identifier)['parser_options']['dtype']='float64';write(path,catalogue)
        account_path=ROOT/'doc/source/_static/data/accounts'/(identifier+'.json');data=json.loads(account_path.read_text());data['recipe']=recipe;write(account_path,data)
    print('PUBLISHED' if publish else 'VERIFIED',identifier,json.dumps(validation),flush=True)
    return snapshot


def main():
    cli=argparse.ArgumentParser(description=__doc__);cli.add_argument('--source-root',type=Path,required=True,help='GLORIA/060 directory');cli.add_argument('--year',type=int,default=2024);cli.add_argument('--publish',action='store_true');args=cli.parse_args();refresh(args.source_root,args.year,publish=args.publish)

if __name__=='__main__':main()
