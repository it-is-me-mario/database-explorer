"""Collect compact native bilateral totals from explicitly supplied local files.

Run one job at a time. No Leontief inverse, balancing, missing-year fallback or
aggregate-country disaggregation is performed. Output contains no local paths.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import gc
import hashlib
import json
import logging
import os
from pathlib import Path
import re
import time
import uuid

import numpy as np
import pandas as pd
import mario

ROOT = Path(__file__).resolve().parents[1]
ECONOMY = ROOT / 'doc/source/_static/data/economy'
OUTPUT = ROOT / 'doc/source/_static/data/trade'
import sys
sys.path.insert(0,str(ROOT/'doc/source/_static/reproduce'))
from recipes.indicators.trade import components


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + '.' + uuid.uuid4().hex + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False) + '\n')
    temporary.replace(path)


def digest(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for chunk in iter(lambda: stream.read(4 * 1024**2), b''):
            h.update(chunk)
    return h.hexdigest()


def existing_recipe(identifier):
    path = ECONOMY / (identifier + '.json')
    return json.loads(path.read_text())['recipe'] if path.is_file() else {}


def source_terms(job):
    registry=json.loads((ROOT/'doc/source/_static/data/database_licences.json').read_text())['guides']
    key=('exiobase-rex3' if job['version']=='REX3' else 'exiobase-monetary' if job['family']=='EXIOBASE'
         else 'figaro-e3' if job['version']=='E3' else job['family'].lower())
    records=registry[key]
    matches=[r for r in records if not r.get('releases') or job['version'] in r['releases']]
    if len(matches)!=1:raise ValueError('Ambiguous source licence: '+job['id'])
    return matches[0]


def geography(labels, recipe_id):
    import country_converter as coco
    logging.getLogger('country_converter').setLevel(logging.ERROR)
    converter=coco.CountryConverter()
    recognized=set(converter.data['ISO3'].dropna())
    known = {str(r.get('label', r.get('code'))): r for r in existing_recipe(recipe_id).get('regions', [])}
    result = []
    for label in labels:
        label = str(label)
        if label in known:
            original = known[label]
            result.append({'label': label, 'name': original.get('name', label),
                           'iso3': original.get('iso3'), 'kind': original.get('kind', 'unresolved')})
        else:
            aggregate = label.upper().startswith(('ROW', 'REST ')) or (label.startswith('X') and label not in recognized) or label in {'Global', 'W2'}
            iso = None if aggregate else converter.convert(names=label, to='ISO3', not_found='__unmapped__')
            if not isinstance(iso, str) or len(iso) != 3 or iso == 'not found':
                iso = None
            name = converter.convert(names=iso, to='name_short', not_found=label) if iso else label
            result.append({'label': label, 'name': name, 'iso3': iso,
                           'kind': 'country' if iso else ('aggregate' if aggregate else 'unresolved')})
    identified = [r['iso3'] for r in result if r['kind'] == 'country']
    if len(identified) != len(set(identified)):
        raise ValueError('Multiple native regions map to one country; review geography rather than collapsing them.')
    return result


def goods_labels(labels, recipe_id, *, e3=False):
    """An explicit producer-group proxy, never an exact goods/HS allocation."""
    mappings = json.loads((ECONOMY / 'sector-sections.json').read_text())['mappings']
    mapping = mappings.get(recipe_id)
    if mapping:
        from recipes.indicators.trade import producer_goods
        return producer_goods(mapping,labels)
    if e3:
        return [label for label in labels if re.match(r'^(?:CPA_)?[ABC]\d', str(label))]
    return None


def publish(job, labels, native_flows, native_unit, inputs, validation, *, method, input_digests=None):
    currency = job['currency']
    rate = 1. if currency == 'USD' else json.loads((ECONOMY / 'world-bank.json').read_text())['currency_rates'][currency]['years'].get(str(job['year']))
    if rate is None or not np.isfinite(rate) or rate <= 0:
        raise ValueError('No observed same-year exchange rate.')
    factor = job['scale'] * rate
    flows = {}
    for key, (intermediate, final) in native_flows.items():
        if intermediate.shape != (len(labels), len(labels)) or final.shape != intermediate.shape:
            raise ValueError('Trade axes do not match native region count.')
        if not np.isfinite(intermediate).all() or not np.isfinite(final).all():
            raise ValueError('Non-finite source trade values.')
        flows[key] = {'intermediate': (intermediate * factor).tolist(), 'final': (final * factor).tolist()}
    data = {k: job[k] for k in ('id', 'label', 'family', 'version', 'year', 'format', 'source_url', 'license')}
    terms=source_terms(job)
    data.update(license=terms['label'],license_url=terms['url'],attribution=terms.get('note',''))
    data.update(schema_version=1, recipe_id=job['recipe'], native_unit=native_unit, native_currency=currency,
                native_scale=job['scale'], usd_per_native_currency=rate,
                currency_conversion_source='Frozen World Bank annual exchange rates; doc/source/_static/data/economy/world-bank.json',
                price_basis='Source basic prices; no customs FOB/CIF bridge applied',
                regions=geography(labels, job['recipe']), flows=flows,
                goods_proxy_note='Source agriculture, mining and manufacturing producer groups; not an exact merchandise concordance. Unknown mappings remain unavailable.',
                provenance={'mario_version': mario.__version__, 'method': method,
                            'inputs': [*(input_digests or []), *[{'file': Path(p).name, 'sha256': digest(p)} for p in inputs]],
                            'validation': validation, 'generated_at': datetime.now(timezone.utc).isoformat()})
    write(OUTPUT / (job['id'] + '.json'), data)
    rebuild_manifest()
    return data


def rebuild_manifest():
    import fcntl
    lock = ROOT / '_cache/manifest.lock'
    lock.parent.mkdir(parents=True, exist_ok=True)
    with lock.open('w') as handle:
        fcntl.flock(handle, fcntl.LOCK_EX)
        _rebuild_manifest_locked()


def _rebuild_manifest_locked():
    datasets, countries = [], {}
    for path in sorted(OUTPUT.glob('*.json')):
        if path.name in {'manifest.json', 'comtrade.json'}:
            continue
        value = json.loads(path.read_text())
        if 'flows' not in value:
            continue
        datasets.append({k: value[k] for k in ('id', 'label', 'family', 'version', 'year', 'format') } | {'file': path.name, 'scopes': list(value['flows'])})
        for row in value['regions']:
            if row['kind'] == 'country':
                countries[row['iso3']] = {'iso3': row['iso3'], 'name': row['name']}
    write(OUTPUT / 'manifest.json', {'schema_version': 1, 'datasets': datasets,
                                    'countries': sorted(countries.values(), key=lambda r: r['name'])})


def ordinary(job, source):
    family, year = job['family'], job['year']
    if job.get('source_path'):
        from recipes.databases.loading import load_database
        from recipes.indicators.trade import source_recipe
        recipe=source_recipe(existing_recipe(job['recipe']))
        path=source/job['source_path']
        db=load_database(recipe,path)
    elif job['version'] == 'REX3':
        path = source / 'EXIOBASE/REX3'
        db = mario.parse_exiobase_rex(path=str(path), year=year, calc_all=False)
    elif job['version'] == 'E3':
        path = source / 'FIGARO/FIGARO E3'
        mode = job['format']
        db = mario.parse_figaro_e3(path=str(path), table='SUT' if mode == 'sut' else 'IOT',
                                    iot_mode='product' if mode == 'product' else 'industry',
                                    extensions=False, diagonal_correction=None, calc_all=False)
    elif family == 'FIGARO':
        path = source / f'FIGARO/IOT/{year}'
        db = mario.parse_figaro(path=str(path), table='IOT', year=year,
                                iot_mode='product', calc_all=False)
    else:
        raise ValueError('Unknown ordinary job')
    if int(db.meta.year) != job['year']:
        raise ValueError('Parsed source year does not match the requested observation year.')
    labels, a, b = components(db)
    flows = {'all': (a, b)}
    level = 'Commodity' if db.table_type == 'SUT' else 'Sector'
    goods = goods_labels(db.get_index(level), job['recipe'], e3=job['version'] == 'E3')
    if goods:
        _, ga, gb = components(db, goods)
        flows['goods_proxy'] = (ga, gb)
    unit_values = db.units[level]['unit'].dropna().astype(str).unique()
    if len(unit_values) != 1:
        raise ValueError('Monetary unit is not homogeneous.')
    native_unit = str(unit_values[0])
    # Independent native-block sums check the public region aggregation.
    native_intermediate = db.get_block('U' if db.table_type == 'SUT' else 'Z')
    native_final = db.get_block('Yc' if db.table_type == 'SUT' else 'Y')
    np.testing.assert_allclose(a.sum(), native_intermediate.to_numpy().sum(), rtol=1e-11, atol=1e-5)
    np.testing.assert_allclose(b.sum(), native_final.to_numpy().sum(), rtol=1e-11, atol=1e-5)
    inputs = [path] if path.is_file() else sorted({Path(p) for p in getattr(db, 'info', {}).get('figaro_e3', {}).get('input_files', {}).values()})
    if not inputs:
        inputs = sorted([*path.glob('*.csv'),*path.glob('*.json')]) if family == 'FIGARO' else sorted([*path.rglob('REX3_2022.zip'), *path.rglob('REX3_Labels.zip')])
    validation={'public_calc_trades':True,'native_intermediate_sum':float(a.sum()),'native_final_sum':float(b.sum())}
    if family=='ADB':
        reviewed=json.loads((ECONOMY/(job['recipe']+'.json')).read_text());r=reviewed['recipe'];v=db.get_block('V').loc[r['value_added_rows']];previous={row['code']:row for row in reviewed['regions']}
        for label in labels:
            mask=v.columns.get_level_values('Region')==label
            if list(v.columns.get_level_values(-1)[mask])!=r['sectors']:raise ValueError('ADB income axes differ from the reviewed recipe')
            np.testing.assert_allclose(v.iloc[:,mask].to_numpy().sum(axis=0)*job['scale'],previous[label]['value_added'],rtol=1e-9,atol=.1)
        validation['independent_income_reconciliation']=True
        if db.info.get('explorer_excel_reader'):validation['excel_reader']=db.info['explorer_excel_reader']
    account_path=ROOT/'doc/source/_static/data/accounts'/(job['recipe']+'.json')
    if account_path.is_file():
        accounts=json.loads(account_path.read_text());total=a+b;by_code={r['code']:r for r in accounts['regions']}
        for j,label in enumerate(labels):
            actual=np.array([total[j,j],total[:,j].sum()-total[j,j]])*job['scale']
            np.testing.assert_allclose(actual,by_code[label]['accounts']['domestic_use']['total'],rtol=1e-9,atol=.1)
        validation['independent_country_use_reconciliation']=True
    data = publish(job, labels, flows, native_unit, inputs,
                   validation,
                   method='MARIO Database.calc_trades, intermediate and final components separately; full native country scope')
    del db, native_intermediate, native_final, flows, a, b
    gc.collect()
    return data


def stream_gloria(job, source, *, reader=None, cache_dir=None):
    from mario.parsers import gloria as g
    from .trade_validation import sut_slice
    from .trade_streams.gloria import csv_batches
    reader=reader or csv_batches
    path=source/f'GLORIA/060/GLORIA_MRIO_Loop060_part_I_MRIOdatabase/GLORIA_MRIOs_60_{job["year"]}.zip'
    layout,meta=g.detect_gloria_layout(path,year=job['year'])
    labels=list(meta.region_codes);nr,ns,nf=len(labels),len(meta.sector_names),len(meta.final_demand_names)
    selected_goods=goods_labels(meta.sector_names,job['recipe']);goods_positions=np.array([x in set(selected_goods or []) for x in meta.sector_names])
    outputs={scope:[np.zeros((nr,nr)),np.zeros((nr,nr))] for scope in (('all','goods_proxy') if selected_goods else ('all',))}
    sample=[i for i,label in enumerate(labels) if label in {'CHN','ITA'}]
    if len(sample)!=2:raise ValueError('Source-slice validation countries unavailable')
    names=[labels[i] for i in sample];arows,crows=g._row_maps(sample,ns)
    activity=g._activity_positions(list(range(nr)),ns);sample_activity=g._activity_positions(sample,ns);commodity=g._commodity_positions(sample,ns)
    columns=np.unique(np.concatenate([activity,commodity]));activity_take=np.searchsorted(columns,activity);ua_take=np.searchsorted(columns,sample_activity);sc_take=np.searchsorted(columns,commodity)
    fd_take=g._final_demand_positions(sample,nf)
    blocks={'S':np.zeros((len(sample)*ns,)*2),'U':np.zeros((len(sample)*ns,)*2),'Ya':np.zeros((len(sample)*ns,len(sample)*nf)),'Yc':np.zeros((len(sample)*ns,len(sample)*nf))}
    cache=(cache_dir or ROOT/'_cache/gloria-aggregates')/(job['id']+'.npz')
    import zipfile
    with zipfile.ZipFile(path) as archive:stamp=json.dumps(['tracked-sut-slice-v1',[(r.name,archive.getinfo(r.name).CRC,archive.getinfo(r.name).file_size) for r in (layout.T_path,layout.Y_path)],labels,list(meta.sector_names),list(meta.final_demand_names),selected_goods])
    input_digests={}
    try:cached=np.load(cache) if cache.is_file() else None
    except (OSError,ValueError,EOFError,zipfile.BadZipFile):
        print('Rebuilding incomplete private aggregate cache',cache.name,flush=True);cached=None
    reader_backend=getattr(reader,'reader_backend',reader.__name__)
    if cached is not None and str(cached['identity'])==stamp and 'input_digests' in cached and all('slice_'+k in cached for k in blocks):
        for scope in outputs:outputs[scope]=[cached[scope+'_intermediate'],cached[scope+'_final']]
        blocks={k:cached['slice_'+k] for k in blocks};input_digests=json.loads(str(cached['input_digests']));reader_backend=str(cached['reader_backend']) if 'reader_backend' in cached else 'pandas (source-validated cache)'
    else:
        for part,resource,selected_columns,width in ((0,layout.T_path,columns,ns),(1,layout.Y_path,g._final_demand_positions(list(range(nr)),nf),nf)):
            count=0
            for rows,values in reader(resource,columns=selected_columns,dtype=np.dtype('float64'),batch_size=1024,input_digests=input_digests):
                count+=len(rows)
                if count//5000!=(count-len(rows))//5000:print(job['id'],'source rows',count,'/',nr*ns*2,flush=True)
                for i,row in enumerate(rows):
                    if int(row) in arows:blocks['S' if part==0 else 'Ya'][arows[int(row)]]=values[i,sc_take if part==0 else fd_take]
                    elif int(row) in crows:blocks['U' if part==0 else 'Yc'][crows[int(row)]]=values[i,ua_take if part==0 else fd_take]
                mask=rows%(2*ns)>=ns;selected=rows[mask]
                native=values[mask][:,activity_take] if part==0 else values[mask]
                sums=native.reshape(-1,nr,width).sum(axis=2);regions=selected//(2*ns)
                np.add.at(outputs['all'][part],regions,sums)
                if 'goods_proxy' in outputs:
                    use=goods_positions[selected%(2*ns)-ns];np.add.at(outputs['goods_proxy'][part],regions[use],sums[use])
            if count!=nr*ns*2:raise ValueError('GLORIA native row count changed')
            print(job['id'],'aggregated','intermediate' if part==0 else 'final',flush=True)
        cache.parent.mkdir(parents=True,exist_ok=True)
        reader_backend=getattr(reader,'reader_backend',reader.__name__)
        np.savez(cache,identity=stamp,reader_backend=reader_backend,input_digests=json.dumps(input_digests),**{'slice_'+k:v for k,v in blocks.items()},**{scope+'_'+part:values[i] for scope,values in outputs.items() for i,part in enumerate(('intermediate','final'))})
    check_labels,a,b=sut_slice(names,meta.sector_names,meta.final_demand_names,blocks);index=[labels.index(x) for x in check_labels]
    for original,actual in zip(outputs['all'],(a,b)):np.testing.assert_allclose(original[np.ix_(index,index)],actual,rtol=1e-11,atol=1e-5)
    return publish(job,labels,outputs,'Thousand USD',[layout.readme_path],{'public_calc_trades_source_slice':check_labels,'source_blocks':['S','U','Ya','Yc'],'csv_reader':reader_backend,'relative_tolerance':1e-11,'scope_note':'Exact source SUT cells, direct-flow aggregation only. No source-slice technology, production or footprint model.'},method='Complete native GLORIA U/Yc country aggregation in bounded batches; validated against public calc_trades on an exact source SUT slice; selected source members SHA256-hashed during extraction',input_digests=list(input_digests.values()))


def stream_emerging(job, source):
    import h5py
    from mario.parsers import emerging as e
    path = source / f'EMERGING/2.2/EMERGING_V2_{job["year"]}_m.mat'
    with h5py.File(path) as handle:
        group = e._resolve_emerging_container(handle)
        labels = e._read_hdf5_string_list(group, 'country_list')
        sectors = e._read_hdf5_string_list(group, 'sector_list')
        final = e._read_hdf5_string_list(group, 'final_list')
        nr, ns, nf = len(labels), len(sectors), len(final)
        a, b = np.zeros((nr, nr)), np.zeros((nr, nr))
        for start in range(0, nr * ns, 256):
            end = min(start + 256, nr * ns)
            # MATLAB stores destination × origin, matching the parser transpose.
            z = np.asarray(group['z'][:, start:end])
            y = np.asarray(group['f'][:, start:end])
            origins = np.arange(start, end) // ns
            np.add.at(a, origins, z.reshape(nr, ns, end - start).sum(axis=1).T)
            np.add.at(b, origins, y.reshape(nr, nf, end - start).sum(axis=1).T)
            if start % (256 * 20) == 0:
                print(job['id'], end, '/', nr * ns, flush=True)
    sample = [label for label in ('CHN', 'ITA') if label in labels]
    db = mario.parse_emerging(str(path), year=job['year'], regions=sample, load_co2=False, calc_all=False)
    check_labels, check_a, check_b = components(db)
    index = [labels.index(label) for label in check_labels]
    for original, actual in ((a, check_a), (b, check_b)):
        np.testing.assert_allclose(original[np.ix_(index, index)], actual, rtol=1e-11, atol=1e-5)
    return publish(job, labels, {'all': (a, b)}, str(db.units['Sector']['unit'].iloc[0]), [path],
                   {'public_calc_trades_country_subset': check_labels, 'relative_tolerance': 1e-11},
                   method='Native MATLAB v7.3 HDF5 batches, exact MARIO transpose and country order; validated against public calc_trades')


def stream_rex(job, source):
    """Aggregate the complete source T/Y in bounded batches, retaining 189 regions."""
    import h5py
    from mario.parsers import exiobase_rex as rex
    source_root=source/'EXIOBASE/REX3'
    prepared=Path(os.environ.get('MARIO_REX3_PREPARED_ROOT',str(source_root)))
    layout=rex.detect_rex3_layout(prepared,year=job['year'])
    countries,sectors,transaction_labels=rex._read_labels(layout)
    nr,ns=len(countries),len(sectors)
    a,b=np.zeros((nr,nr)),np.zeros((nr,nr))
    with h5py.File(layout.year_dir/'T_REX3.mat') as tf,h5py.File(layout.year_dir/'Y_REX3.mat') as yf:
        t,y=tf['T_REX3'],yf['Y_REX3']
        if t.shape!=(nr*ns,nr*ns) or y.shape!=(nr,nr*ns):raise ValueError('Unexpected source REX3 axes')
        for start in range(0,nr*ns,128):
            end=min(start+128,nr*ns)
            origin=np.arange(start,end)//ns
            np.add.at(a,origin,np.asarray(t[:,start:end]).reshape(nr,ns,end-start).sum(axis=1).T)
            np.add.at(b,origin,np.asarray(y[:,start:end]).T)
        # A direct source slice is an aggregation fixture, not an open REX3
        # technology model. No production/output/GHG reconstruction uses it.
        geo=geography(countries,'')
        sample=[i for i,r in enumerate(geo) if r['iso3'] in ('CHN','ITA')]
        if len(sample)!=2:raise ValueError('Pilot countries are not individually resolved')
        positions=np.concatenate([np.arange(i*ns,(i+1)*ns) for i in sample])
        raw_t=np.asarray(t[:,positions])[positions,:].T
        raw_y=np.asarray(y[:,positions])[sample,:].T
    names=[countries[i] for i in sample]
    axis=pd.MultiIndex.from_product([names,['Sector'],sectors])
    fd=pd.MultiIndex.from_product([names,['Consumption category'],['Households']])
    db=mario.Database(table='IOT',Z=pd.DataFrame(raw_t,index=axis,columns=axis),
        Y=pd.DataFrame(raw_y,index=axis,columns=fd),
        E=pd.DataFrame(0.,index=['not loaded'],columns=axis),
        V=pd.DataFrame(0.,index=['not loaded'],columns=axis),
        EY=pd.DataFrame(0.,index=['not loaded'],columns=fd),
        units={name:pd.DataFrame({'unit':unit},index=labels) for name,unit,labels in
               [('Sector','M.EUR',sectors),('Satellite account','None',['not loaded']),('Factor of production','None',['not loaded'])]},calc_all=False)
    labels,check_a,check_b=components(db)
    selected=[countries.index(name) for name in labels]
    np.testing.assert_allclose(a[np.ix_(selected,selected)],check_a,rtol=1e-11,atol=1e-5)
    np.testing.assert_allclose(b[np.ix_(selected,selected)],check_b,rtol=1e-11,atol=1e-5)
    inputs=[layout.year_dir/'T_REX3.mat',layout.year_dir/'Y_REX3.mat',
            *[layout.labels_dir/name for name in rex._LABEL_FILES]]
    return publish(job,countries,{'all':(a,b)},'million EUR',inputs,
        {'public_calc_trades_source_slice':labels,'complete_source_regions':nr,'relative_tolerance':1e-11,
         'scope_note':'The small source slice validates only direct trade aggregation. It is never solved as an MRIO or used for emissions.'},
        method='Complete native REX3 T/Y country aggregation in HDF5 batches; MARIO label ordering and transpose checks; direct source-slice calc_trades validation')


def jobs():
    from .trade_jobs import exiobase,figaro,gloria,emerging,oecd,wiod,adb
    return [job for source in (exiobase,figaro,gloria,emerging,oecd,wiod,adb) for job in source.jobs()]


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-root', type=Path, required=True)
    parser.add_argument('--only', help='Substring selecting one job')
    parser.add_argument('--family',choices=['EXIOBASE','FIGARO','GLORIA','EMERGING','OECD','WIOD','ADB'])
    parser.add_argument('--years',type=int,nargs='+',help='Observed years to collect')
    parser.add_argument('--resume', action='store_true')
    parser.add_argument('--gloria-reader',choices=['pandas','polars'],default='pandas',help='Optional validated CSV reader; polars stages only one selected member at a time')
    args = parser.parse_args()
    if mario.__version__ != '1.3.4':
        raise RuntimeError('Use the pinned MARIO 1.3.4 runtime.')
    reports = []
    for job in jobs():
        if args.family and job['family']!=args.family:continue
        if args.years and job['year'] not in args.years:continue
        if args.only and args.only not in job['id']:
            continue
        if args.resume and (OUTPUT / (job['id'] + '.json')).is_file():
            print('CACHED', job['id'], flush=True)
            continue
        start = time.monotonic()
        print('START', job['id'], flush=True)
        try:
            collector = stream_gloria if job['family'] == 'GLORIA' else stream_emerging if job['family'] == 'EMERGING' else stream_rex if job['version']=='REX3' else ordinary
            if job['family']=='GLORIA' and args.gloria_reader=='polars':
                from .trade_streams.gloria import polars_csv_batches
                stream_gloria(job,args.source_root,reader=polars_csv_batches)
            else:collector(job, args.source_root)
            reports.append({'id': job['id'], 'status': 'passed', 'seconds': time.monotonic() - start})
            print('PASSED', job['id'], flush=True)
        except Exception as error:
            import traceback
            traceback.print_exc()
            reports.append({'id': job['id'], 'status': 'failed', 'error': str(error)})
        write(ROOT / '_cache/trade-runs' / (job['id'] + '.json'), reports[-1])
        gc.collect()
    if any(report['status'] == 'failed' for report in reports):
        raise SystemExit(1)
