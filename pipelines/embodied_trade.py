"""Collect native embodied trade and supplying-sector accounts from one projected solve."""
from pathlib import Path
from datetime import datetime,timezone
import argparse,copy,gc,hashlib,inspect,json,platform,sys,time,uuid
import numpy as np
import pandas as pd
from .public_accounts import ROOT,serialise,write,NOTES
from .account_jobs.catalogue import jobs
from recipes.databases.loading import load_database
from recipes.indicators import public_accounts as api
from recipes.indicators.demand_categories import consumption_note
OUTPUT=ROOT/'doc/source/_static/data/embodied-trade'
CACHE=ROOT/'_cache/embodied-trade'
SCOPE=ROOT/'doc/embodied-trade-scope.json'
MAPPING=ROOT/'doc/source/_static/data/economy/common-sector-sections.json'
METRICS={'value_added_footprint':'value_added_trade','ghg_footprint':'ghg_trade'}
TRADE_NOTES={
'value_added_trade':'Upstream value added embodied in signed gross intermediate and final-use crossings. Domestic and Foreign identify value added generated inside or outside the exporting native region. Total includes both and can closely match gross monetary trade in balanced systems. Repeated border crossings can count the same value added again; this is not value-added exports measured by ultimate foreign final absorption.',
'ghg_trade':'Upstream production GHG embodied in signed gross intermediate and final-use crossings. Repeated border crossings can count the same emissions again. Direct final-user emissions and unrepresented production accounts are not allocated to traded output.'}
SECTOR_NOTE='The selected sector identifies the supplying industry/product at the border or in final demand; upstream value added and emissions can arise in every industry. Mixed native groups are indivisible. Unassigned native groups remain separate; named sections show the identified mapped portion when an unassigned group exists.'


def source_jobs(source_root):
    yield from jobs(source_root)
    for table in ['iot','sut']:
        identifier='exiobase-hybrid-3318-2011-'+table
        original=json.loads((ROOT/'doc/source/_static/data/economy'/(identifier+'.json')).read_text())
        recipe=copy.deepcopy(original['recipe']);recipe['economic_accounts']=True;recipe['direct_account_usable']=False
        recipe['expected_units']={k:v for k,v in recipe.get('expected_units',{}).items() if k in {'Sector','Activity','Commodity'}}
        yield {'id':identifier,'path':Path(source_root)/'EXIOBASE/3.3.18','recipe':recipe,'original':original}


def current_scope():
    readings=[]
    for row in json.loads((ROOT/'doc/account-collection-scope.json').read_text())['readings']:
        extra=row.get('upstream_metrics',[])
        if set(extra)-set(METRICS.values()):raise ValueError('Unknown approved upstream metric: '+row['id'])
        required=list(dict.fromkeys([*[METRICS[m] for m in row['metrics'] if m in METRICS],*extra]))
        if required:readings.append({'id':row['id'],'required_metrics':required,'sector_phase':row.get('upstream_phase','latest supplied readings first')})
    for table in ['iot']:
        readings.append({'id':'exiobase-hybrid-3318-2011-'+table,'required_metrics':['value_added_trade','ghg_trade'],'sector_phase':'unit-aware native validation required','direct_account_usable':False})
    return {'schema_version':1,'readings':readings,'deferred':[{'source':'EXIOBASE Hybrid SUT','reason':'The native supply system contains activities co-producing energy and mass outputs; the current upstream allocation changes when those unit scales change. A reviewed unit-invariant method is required.','source_audit':{'member':'MR_HSUP_2011_v3_3_18.csv','observed_sha256':'2120fd942535561e32764da21722424603b36af08ca0feaaedef470c5ad42f88','activities':7872,'cross_physical_unit_activities':315,'fingerprint_status':'Newly observed source audit; not a prior frozen economic-input pin.'}},{'source':'EXIOBASE REX3','reason':'Upstream collection deferred by explicit user request; do not restart automatically.'},{'source':'BONSAI','reason':'Exact frozen technology and environmental input bundle unavailable.'},{'source':'EORA','reason':'Excluded from this numerical publication.'}],'policy':'Latest compatible readings and explicitly approved historical batches; uncollected years remain separate. Hybrid content requires native-unit-aware validation and never sums mixed outputs as money.'}


def fingerprint_inputs(job):
    roots=[('economic',Path(job['path']))]
    for key,value in job['recipe'].get('parser_options',{}).items():
        if key.endswith('path') or key=='add_extensions':
            if isinstance(value,(str,Path)):roots.append((key,Path(value)))
    records=[];seen=set()
    for role,root in roots:
        if not root.exists():raise FileNotFoundError(str(root))
        files=sorted(p for p in root.rglob('*') if p.is_file() and not any(part.startswith('.') for part in p.relative_to(root).parts)) if root.is_dir() else [root]
        for path in files:
            if path.resolve() in seen:continue
            seen.add(path.resolve());sha=hashlib.sha256();md5=hashlib.md5()
            with path.open('rb') as stream:
                for chunk in iter(lambda:stream.read(8*1024*1024),b''):sha.update(chunk);md5.update(chunk)
            records.append({'role':role,'file':str(path.relative_to(root)) if root.is_dir() else path.name,'bytes':path.stat().st_size,'sha256':sha.hexdigest(),'md5':md5.hexdigest()})
    provenance=job['original'].get('provenance',{})
    expected=provenance.get('input_sha256');name=provenance.get('input_filename')
    source_files=provenance.get('source_files',[])
    if source_files:
        for source in source_files:
            matches=[r for r in records if r['role']=='economic' and (r['file']==source['filename'] or ('/' not in source['filename'] and Path(r['file']).name==source['filename']))]
            if len(matches)!=1 or matches[0]['sha256']!=source['sha256'] or matches[0]['bytes']!=source.get('bytes',matches[0]['bytes']):raise ValueError('Economic source member differs from frozen production fingerprint: '+source['filename'])
    elif expected:
        matches=[r for r in records if r['role']=='economic' and Path(r['file']).name==name]
        if len(matches)!=1 or matches[0]['sha256']!=expected:raise ValueError('Economic source differs from frozen production fingerprint')
    emissions=provenance.get('emissions',{})
    if emissions.get('sha256') and (job['recipe']['parser_options'].get('load_co2') or job['recipe']['parser_options'].get('add_extensions')):
        matches=[r for r in records if Path(r['file']).name==emissions.get('filename')]
        if len(matches)!=1 or matches[0]['sha256']!=emissions['sha256']:raise ValueError('Environmental companion differs from frozen production fingerprint')
    published=provenance.get('archive_checksum','')
    if published.startswith('md5:') and Path(job['path']).is_file():
        match=next(r for r in records if r['role']=='economic')
        if match['md5']!=published[4:]:raise ValueError('Source archive differs from its published checksum')
    companion_pin=provenance.get('matched_iot',{}).get('source_provenance',{}).get('archive_checksum','')
    if companion_pin and job['recipe']['parser_options'].get('add_extensions'):
        companion=Path(job['recipe']['parser_options']['add_extensions']);matches=[r for r in records if r['role']=='add_extensions' and r['file']==companion.name]
        if not companion.is_file() or len(matches)!=1:raise ValueError('Matching IOT archive checksum cannot be established from a directory companion')
        algorithm,expected=companion_pin.split(':',1)
        if algorithm not in {'md5','sha256'} or matches[0][algorithm]!=expected:raise ValueError('Matching IOT companion archive checksum differs from its frozen pin')
    pins=provenance.get('source_sha256',{})
    members=provenance.get('ghg_recharacterisation',{}).get('source_members',[])
    checks=[{'name':name,'sha256':sha} for name,sha in pins.items()] if isinstance(pins,dict) else []
    checks+=members if job['recipe']['parser_options'].get('unit')=='Hybrid' else []
    for pin in checks:
        name=pin['name'];matches=[r for r in records if r['file']==name or ('/' not in name and Path(r['file']).name==name)]
        if len(matches)!=1:raise ValueError('Cannot uniquely identify frozen source member: '+name)
        actual=matches[0]
        if actual['sha256']!=pin['sha256'] or pin.get('size',actual['bytes'])!=actual['bytes']:raise ValueError('Frozen source member differs: '+name)
        if pin.get('published_md5') and actual['md5']!=pin['published_md5'].removeprefix('md5:'):raise ValueError('Published source-member checksum differs: '+name)
    return records


def cache_identity(job,inputs,options):
    import mario
    recipe=copy.deepcopy(job['recipe'])
    for key in recipe.get('parser_options',{}):
        if key.endswith('path') or key=='add_extensions':recipe['parser_options'][key]='input fingerprint above'
    code=hashlib.sha256(Path(api.__file__).read_bytes()).hexdigest();tree=hashlib.sha256()
    recipe_root=Path(api.__file__).parents[1]
    for path in sorted(recipe_root.rglob('*.py')):
        tree.update(str(path.relative_to(recipe_root)).encode()+b'\0');tree.update(path.read_bytes())
    producer=hashlib.sha256(''.join(inspect.getsource(f) for f in [cache_identity,fingerprint_inputs,solve_source,save_cache,read_cache,validate_source_results]).encode()).hexdigest()
    identity={'cache_schema_version':1,'inputs':inputs,'recipe':recipe,'compute':options,'helper_sha256':code,'recipe_tree_sha256':tree.hexdigest(),'producer_sha256':producer,'runtime':{'mario':mario.__version__,'python':platform.python_version(),'numpy':np.__version__,'pandas':pd.__version__}}
    return hashlib.sha256(json.dumps(identity,sort_keys=True,separators=(',',':')).encode()).hexdigest(),identity


def save_cache(folder,data,identity):
    arrays={}
    def pack(value,key='data'):
        if isinstance(value,np.ndarray):arrays[key]=value;return {'__array__':key}
        if isinstance(value,dict):return {k:pack(v,key+'/'+k) for k,v in value.items()}
        if isinstance(value,(list,tuple)):return [pack(v,key+'/'+str(i)) for i,v in enumerate(value)]
        return value
    temporary=folder.parent/('.writing-'+uuid.uuid4().hex);temporary.mkdir(parents=True)
    payload=pack(data);np.savez(temporary/'arrays.npz',**arrays)
    digest=hashlib.sha256()
    with (temporary/'arrays.npz').open('rb') as stream:
        for chunk in iter(lambda:stream.read(8*1024*1024),b''):digest.update(chunk)
    write(temporary/'metadata.json',{'identity':identity,'arrays_sha256':digest.hexdigest(),'data':payload})
    temporary.rename(folder)


def read_cache(folder):
    metadata=json.loads((folder/'metadata.json').read_text());digest=hashlib.sha256()
    with (folder/'arrays.npz').open('rb') as stream:
        for chunk in iter(lambda:stream.read(8*1024*1024),b''):digest.update(chunk)
    if digest.hexdigest()!=metadata['arrays_sha256']:raise ValueError('Private projected-account cache checksum differs')
    with np.load(folder/'arrays.npz',allow_pickle=False) as arrays:
        def unpack(value):
            if isinstance(value,dict):
                if set(value)=={'__array__'}:return arrays[value['__array__']].copy()
                return {k:unpack(v) for k,v in value.items()}
            if isinstance(value,list):return [unpack(v) for v in value]
            return value
        return unpack(metadata['data'])


def validate_source_results(data,job):
    original={r.get('code',r.get('label')):r for r in job['original'].get('regions',[])}
    if not original:return
    for metric,field in [('value_added_footprint','value_added'),('ghg_footprint','ghg')]:
        if metric not in data['results']:continue
        expected=[sum(original[r][field]) for r in data['regions']]
        np.testing.assert_allclose(data['results'][metric]['production_by_origin'],expected,rtol=1e-8,atol=.1,err_msg=metric+' source differs from frozen production')
    if 'ghg_footprint' in data['results'] and all(original[r].get('household_ghg') is not None for r in data['regions']):
        np.testing.assert_allclose(data['results']['ghg_footprint']['direct_final_demand'],[original[r]['household_ghg'] for r in data['regions']],rtol=1e-8,atol=.1,err_msg='Direct final-user source differs from frozen production')


def solve_source(job,options):
    start=time.monotonic();recipe={**job['recipe'],'footprint_compute':options,'trade_compute':options}
    print('FINGERPRINT',job['id'],flush=True);inputs=fingerprint_inputs(job);key,identity=cache_identity(job,inputs,options);folder=CACHE/job['id']/key
    if (folder/'metadata.json').exists():
        print('CACHED SOLVE',job['id'],flush=True);data=read_cache(folder);validate_source_results(data,job);return data,identity
    print('PARSE',job['id'],flush=True);db=load_database(recipe,job['path']);regions=db.get_index('Region')
    income=api.production_income(db,recipe);previous={row['code']:sum(row['value_added']) for row in job['original']['regions']}
    if previous:np.testing.assert_allclose(income,[previous[r] for r in regions],rtol=1e-9,atol=.1,err_msg='Native income differs from frozen production')
    projection=api.native_use_projection(db);axis=projection['final'].index
    native_direct=api.native_direct_sectors(db,recipe,projection) if recipe.get('direct_account_usable',True) else None
    api.prepare_footprint_model(db,recipe);print('JOINT SOLVE',job['id'],flush=True)
    calculated=api.footprints(db,recipe,retain_multipliers=True)
    if not calculated['results']:raise ValueError('; '.join(str(e) for e in calculated['errors'].values()))
    multipliers=calculated['multipliers'];data={'regions':regions,'axis':list(map(list,axis)),'axis_names':list(axis.names),'multipliers':multipliers.to_numpy(dtype=float),'multiplier_index':list(map(list,multipliers.index)),'projection':{k:projection[k].to_numpy(dtype=float) for k in ['intermediate','final']},'native_direct':native_direct,'results':calculated['results'],'errors':{k:str(e) for k,e in calculated['errors'].items()},'inputs':inputs,'compute':options}
    validate_source_results(data,job)
    folder.parent.mkdir(parents=True,exist_ok=True);save_cache(folder,data,identity);del db;gc.collect()
    print('SOLVED',job['id'],'seconds',round(time.monotonic()-start,1),'errors',data['errors'],flush=True);return data,identity


def load_cached_source(job,options):
    """Replay an exact-current private cache without opening any source inputs."""
    from .recorded_inputs import validate_recorded_inputs
    matches=[]
    for path in sorted((CACHE/job['id']).glob('*/metadata.json')):
        metadata=json.loads(path.read_text());recorded=metadata.get('identity',{})
        inputs=recorded.get('inputs',[]);key,identity=cache_identity(job,inputs,options)
        if path.parent.name==key and recorded==identity:matches.append((path.parent,identity))
    if len(matches)!=1:raise ValueError('Expected one exact-current private cache; collect this source with the current recipe, code, runtime and compute options first')
    folder,identity=matches[0];validate_recorded_inputs(job,identity['inputs'])
    data=read_cache(folder)
    if data.get('inputs')!=identity['inputs'] or data.get('compute')!=options:raise ValueError('Private cached result differs from its identity')
    validate_source_results(data,job);print('REPLAY VERIFIED PRIVATE CACHE',job['id'],flush=True)
    return data,identity


def resolve_mapping(document,identifier):
    reference=document['mappings'][identifier]
    def resolve(ref):
        if 'definition' not in ref:return ref
        value={**document['definitions'][ref['definition']],**{k:v for k,v in ref.items() if k not in {'definition','additional_mappings'}}}
        value['additional_mappings']=[resolve(r) for r in ref.get('additional_mappings',[])];return value
    return resolve(reference)


def sector_metadata(document,job,native_labels):
    mapping=resolve_mapping(document,job['id']);dimension='Commodity' if job['recipe']['table']=='SUT' else 'Sector'
    choices=[mapping,*mapping.get('additional_mappings',[])]
    # Released EMERGING-E uses lower-case built-in labels; the retained publisher
    # metadata has title case. Accept only a complete one-to-one casefold match.
    if job['recipe']['source']=='EMERGING' and job['recipe']['parser_options'].get('variant')=='E':
        actual={label.casefold():label for label in native_labels}
        if len(actual)!=len(native_labels):raise ValueError('Ambiguous EMERGING-E native labels')
        choices=[{**m,'entries':[{**e,'native_label':actual.get(e['native_label'].casefold(),e['native_label'])} for e in m['entries']]} for m in choices]
    matching=[m for m in choices if m['dimension']==dimension and len(m['entries'])==len(native_labels) and {e['native_label'] for e in m['entries']}==set(native_labels)]
    if len(matching)!=1:raise ValueError('Common-sector mapping must match the exact native supplying axis')
    mapping=matching[0];groups={}
    for entry in mapping['entries']:
        codes=entry.get('section_codes') or [];atomic='+'.join(sorted(codes)) if codes else 'unassigned'
        groups.setdefault(atomic,[]).append(entry['native_label'])
    sections={**document['sections'],'unassigned':'Unassigned native groups'}
    classification={'id':document['classification_id'],'label':document['classification']+' macrosector proxies','coverage_interpretation':mapping['coverage_interpretation'],'sections':sections,'groups':list(groups)}
    return groups,classification,{'boundary':'Supplying industry/product of traded output or final demand','unassigned':groups.get('unassigned',[]),'qualification':SECTOR_NOTE,'mapping_sha256':hashlib.sha256(MAPPING.read_bytes()).hexdigest(),'native_dimension':dimension,'coverage_interpretation':mapping['coverage_interpretation'],'group_notes':{group:list(dict.fromkeys(e['proxy_note'] for e in mapping['entries'] if e['native_label'] in labels and e.get('proxy_note'))) for group,labels in groups.items()}}


def publish_result(job,data,identity,*,include_sectors=True,publication_mode="raw_input_fingerprint_validation"):
    validate_source_results(data,job);regions=data['regions'];axis=pd.MultiIndex.from_tuples(map(tuple,data['axis']),names=data['axis_names'])
    projection={'regions':regions,**{k:pd.DataFrame(data['projection'][k],index=axis,columns=regions) for k in ['intermediate','final']}}
    multipliers=pd.DataFrame(data['multipliers'],index=pd.MultiIndex.from_tuples(map(tuple,data['multiplier_index']),names=['Indicator','Production origin']),columns=axis)
    native_labels=list(dict.fromkeys(axis.get_level_values(-1)))
    if include_sectors:groups,classification,scope=sector_metadata(json.loads(MAPPING.read_text()),job,native_labels)
    else:groups={};classification={'id':'nace-2-common','label':'NACE Rev. 2','sections':{},'groups':[]};scope={'boundary':'Supplying industry/product','reason':'Sector publication awaits the reviewed common-classification policy.'}
    recipe=copy.deepcopy(job['original']['recipe']);recipe['footprint_compute']=data['compute'];recipe['trade_compute']=data['compute'];recipe['direct_account_usable']=job['recipe'].get('direct_account_usable',True)
    if recipe['source']=='EMERGING' and job['recipe']['parser_options'].get('load_co2'):
        recipe['parser_options']={**recipe['parser_options'],'load_co2':True,'co2_path':'/path/to/'+Path(job['recipe']['parser_options']['co2_path']).name}
    known={r.get('label',r.get('code')):r for r in recipe['regions']};rows=[{**known[r],'code':r} for r in regions]
    notes={**NOTES,**TRADE_NOTES};notes['final_demand']+=' '+consumption_note(recipe)
    if recipe.get('ghg_note'):notes['ghg_trade']+=' '+recipe['ghg_note'];notes['ghg_footprint']+=' '+recipe['ghg_note']
    result={'schema_version':1,'id':job['id'],'recipe':recipe,'regions':rows,'metrics':[],'accounts':api.sum_direct_sectors(data['native_direct']) if data['native_direct'] else {},'notes':notes,'residuals':{},'sector_groups':groups,'sector_classification':classification,'sector_scope':scope,'sector_files':{},'provenance':{'mario_version':identity['runtime']['mario'],'runtime':identity['runtime'],'helper_sha256':identity['helper_sha256'],'recipe_tree_sha256':identity['recipe_tree_sha256'],'producer_sha256':identity['producer_sha256'],'input_inventory_scope':'Explicit files, or every non-hidden file in the selected same-year/release directory bundle; directory inventories can include unused companions.','inputs':data['inputs'],'region_order':regions,'metric_compute':{},'footprint_boundaries':{},'generated_at':datetime.now(timezone.utc).isoformat(),'source_errors':data['errors'],'publication_mode':publication_mode}}
    if data['native_direct']:result['demand_groups']=data['native_direct']['demand_groups'];result['demand_schema_version']=2
    for metric,values in data['results'].items():
        trade=METRICS[metric];result['metrics']+=[metric,trade];result['accounts'][metric]=values['values'];result[trade]=api.embodied_trade_from_multipliers(multipliers.loc[metric],projection,recipe,trade)
        residual='value_added' if metric=='value_added_footprint' else 'ghg_tonnes';result['residuals'][residual]=values['unallocated']
        result['provenance']['footprint_boundaries'][metric]={k:values[k] for k in ['production_by_origin','allocated_by_origin','unrepresented_direct','unassigned_requirements','source_requirement_gap']}
        if metric=='ghg_footprint':result['direct_final_user_emissions']=values['direct_final_demand']
        for name in [metric,trade]:result['provenance']['metric_compute'][name]={'method':'solve',**data['compute']}
    result['metrics']=list(dict.fromkeys([*result['accounts'],*result['metrics']]))
    for atomic,labels in (groups.items() if include_sectors else []):
        shard={'id':job['id'],'section':atomic,'accounts':api.sum_direct_sectors(data['native_direct'],labels) if data['native_direct'] else {},'notes':{k:v+' '+SECTOR_NOTE for k,v in notes.items()}}
        for name in shard['notes']:shard['notes'][name]+=' '+' '.join(scope.get('group_notes',{}).get(atomic,[]))
        shard['notes']['ghg_footprint']+=' Direct final-user emissions have no observed supplying-sector split and are excluded from this sector slice; they remain in the full total.'
        for metric in data['results']:
            trade=METRICS[metric];shard[trade]=api.embodied_trade_from_multipliers(multipliers.loc[metric],projection,recipe,trade,labels)
            shard['accounts'][metric]=api.footprint_from_multipliers(multipliers.loc[metric],projection,recipe,metric,labels)
        filename=job['id']+'--'+atomic.lower().replace('+','_')+'.json';write(OUTPUT/filename,shard);result['sector_files'][atomic]=filename
    if not include_sectors:
        result['sector_groups']={};result['sector_classification']['groups']=[];result['sector_scope']['reason']='Sector publication awaits the reviewed common-classification policy.'
    write(OUTPUT/(job['id']+'.json'),result);rebuild_manifest();print('PUBLISHED',job['id'],len(groups),'atomic sector groups',flush=True)
    return result


def rebuild_manifest():
    readings=[]
    for path in sorted(OUTPUT.glob('*.json')):
        if path.name=='manifest.json' or '--' in path.stem:continue
        d=json.loads(path.read_text());readings.append({k:d[k] for k in ['id','metrics','sector_files','sector_classification','sector_groups','sector_scope']}|{'file':path.name})
    write(OUTPUT/'manifest.json',{'schema_version':1,'readings':readings})


def audit_coverage(scope=None,output=None):
    """Report published coverage without reading source matrices or changing files.

    Numeric conservation and provenance remain the responsibility of check_site;
    this audit establishes the declared latest-reading and sector publication gaps.
    """
    scope=json.loads(SCOPE.read_text()) if scope is None else scope
    output=OUTPUT if output is None else Path(output)
    manifest_path=output/'manifest.json'
    manifest=json.loads(manifest_path.read_text()) if manifest_path.exists() else {'readings':[]}
    entries={};issues=[]
    for entry in manifest['readings']:
        if entry['id'] in entries:issues.append({'id':entry['id'],'reason':'Duplicate manifest reading'})
        entries[entry['id']]=entry
    rows=[];required_counts={};published_counts={}
    for required in scope['readings']:
        identifier=required['id'];metrics=required['required_metrics'];entry=entries.get(identifier)
        row={'id':identifier,'required_metrics':metrics,'published_metrics':[],'missing_metrics':list(metrics),'sector_phase':required.get('sector_phase'),'sector_complete':False}
        for metric in metrics:required_counts[metric]=required_counts.get(metric,0)+1
        if entry is None:row['reason']='Reading not published'
        elif not (output/entry['file']).is_file():row['reason']='Manifest total file is missing'
        else:
            data=json.loads((output/entry['file']).read_text())
            if data.get('id')!=identifier:row['reason']='Manifest and total reading identities differ'
            else:
                declared=set(entry.get('metrics',[])) & set(data.get('metrics',[]))
                actual={metric for metric in metrics if metric in declared and data.get(metric) is not None}
                row['published_metrics']=sorted(actual);row['missing_metrics']=sorted(set(metrics)-actual)
                for metric in actual:published_counts[metric]=published_counts.get(metric,0)+1
                groups=data.get('sector_groups',{});files=data.get('sector_files',{})
                sector_issues=[]
                if not groups:sector_issues.append(data.get('sector_scope',{}).get('reason','Sector groups not published'))
                if set(groups)!=set(files):sector_issues.append('Sector groups and shard references differ')
                if entry.get('sector_files',{})!=files:sector_issues.append('Manifest and total sector references differ')
                for group,filename in files.items():
                    path=output/filename
                    if not path.is_file():sector_issues.append('Missing shard: '+group);continue
                    shard=json.loads(path.read_text())
                    if shard.get('id')!=identifier or shard.get('section')!=group:sector_issues.append('Shard identity differs: '+group)
                    for metric in metrics:
                        if shard.get(metric) is None:sector_issues.append('Missing '+metric+' in shard: '+group)
                row['sector_complete']=bool(groups) and not sector_issues and not row['missing_metrics']
                if sector_issues:row['sector_issues']=sector_issues
        rows.append(row)
    return {'schema_version':1,'total_complete':not issues and all(not r['missing_metrics'] for r in rows),'sector_complete':not issues and all(r['sector_complete'] for r in rows),'required_readings':len(rows),'complete_total_readings':sum(not r['missing_metrics'] for r in rows),'complete_sector_readings':sum(r['sector_complete'] for r in rows),'required_metrics':required_counts,'published_required_metrics':published_counts,'readings':rows,'extra_published_readings':sorted(set(entries)-{r['id'] for r in rows}),'manifest_issues':issues,'deferred':scope.get('deferred',[]),'policy':scope.get('policy'),'validation_boundary':'Coverage only; run check_site for finite arrays, source provenance and conservation.'}


def main():
    cli=argparse.ArgumentParser(description=__doc__);cli.add_argument('--source-root',type=Path);cli.add_argument('--inventory',type=Path);cli.add_argument('--only');cli.add_argument('--cache-only',action='store_true');cli.add_argument('--publish-cached',action='store_true');cli.add_argument('--totals-only',action='store_true');cli.add_argument('--audit',action='store_true');cli.add_argument('--require-sectors',action='store_true');cli.add_argument('--solver',choices=['scipy','umfpack'],default='scipy');cli.add_argument('--strategy',choices=['direct','iterative'],default='direct');cli.add_argument('--refinement-steps',type=int,choices=[0,1,2],default=0);args=cli.parse_args()
    if args.audit:
        report=audit_coverage();print(json.dumps(report,indent=2))
        if not report['sector_complete' if args.require_sectors else 'total_complete']:raise SystemExit(1)
        return
    if args.require_sectors:cli.error('--require-sectors is only valid with --audit')
    if args.cache_only and args.publish_cached:cli.error('--cache-only and --publish-cached are mutually exclusive')
    import mario
    if mario.__version__!='1.3.4':raise RuntimeError('Use released mariopy==1.3.4')
    scope=current_scope();write(SCOPE,scope);required={r['id']:r['required_metrics'] for r in scope['readings']}
    items=json.loads(args.inventory.read_text()) if args.inventory else list(source_jobs(args.source_root)) if args.source_root else cli.error('Supply a reviewed source root or private inventory')
    options={'solver':args.solver,'strategy':args.strategy,'refinement_steps':args.refinement_steps};failures=[]
    for job in items:
        if job['id'] not in required or args.only and args.only not in job['id']:continue
        try:
            from .input_layout import validate_input_layout,validate_layout_receipts
            if not args.publish_cached:validate_input_layout(job)
            data,identity=load_cached_source(job,options) if args.publish_cached else solve_source(job,options)
            validate_layout_receipts(job,identity['inputs'])
            if not args.cache_only:publish_result(job,data,identity,include_sectors=not args.totals_only,publication_mode='verified_private_cache_no_raw_access' if args.publish_cached else 'raw_input_fingerprint_validation')
            missing=set(required[job['id']])-{METRICS[m] for m in data['results']}
            if missing:
                write(CACHE/(job['id']+'-error.json'),{'id':job['id'],'missing_required_metrics':sorted(missing),'source_errors':data['errors']})
                failures.append(job['id']+': '+','.join(sorted(missing)))
                print('UNRESOLVED METRICS',job['id'],','.join(sorted(missing)),flush=True)
            else:(CACHE/(job['id']+'-error.json')).unlink(missing_ok=True)
        except Exception as error:
            import traceback
            traceback.print_exc();failures.append(job['id']);write(CACHE/(job['id']+'-error.json'),{'id':job['id'],'error':str(error),'type':type(error).__name__})
        gc.collect()
    print('COLLECTION FINISHED',len(failures),'unresolved sources',flush=True)
    if failures:raise SystemExit(1)
if __name__=='__main__':main()
