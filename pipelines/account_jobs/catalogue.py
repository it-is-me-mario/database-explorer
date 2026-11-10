"""Resolve the current comparison catalogue against real local source files."""
from pathlib import Path
import copy,json
ROOT=Path(__file__).resolve().parents[2]
ECONOMY=ROOT/'doc/source/_static/data/economy'
CURATED_EXIO={'3.11.2','3.10.2','3.8.2','REX3'}


def jobs(source):
    source=Path(source);files={}
    for p in source.rglob('*'):
        if p.is_file() and not p.name.startswith('._'):files.setdefault(p.name,[]).append(p)
    manifest=json.loads((ECONOMY/'manifest.json').read_text())
    for entry in manifest['datasets']:
        original=json.loads((ECONOMY/(entry['id']+'.json')).read_text());r=copy.deepcopy(original['recipe']);family=r['source'];year=r['year'];options=r['parser_options'];provenance=original['provenance']
        if family=='EXIOBASE' and r['release'] not in CURATED_EXIO:continue
        if family=='BONSAI' or options.get('unit')=='Hybrid' or r.get('price_basis') in {'Previous year prices','Previous-year prices'}:continue
        if len({x.get('iso3') for x in original['regions'] if x.get('kind')=='country'})<2:continue
        if family=='WIOD' and 'pyp' in r['id']:continue
        path=None
        if family=='EXIOBASE':path=source/f'EXIOBASE/{r["release"]}'/(f'MRSUT_{year}.zip' if r['table']=='SUT' else f'IOT_{year}_{options["system"]}.zip')
        elif family=='GLORIA':path=source/f'GLORIA/060/GLORIA_MRIO_Loop060_part_I_MRIOdatabase/GLORIA_MRIOs_60_{year}.zip'
        elif family=='EMERGING':path=source/'EMERGING'/('E_3.0' if r['release']=='E' else r['release'])/provenance['input_filename']
        else:
            candidates=files.get(provenance.get('input_filename',''),[])
            if family=='OECD':candidates=[p for p in candidates if r['release'] in p.parts]
            if family=='ADB':candidates=[p for p in candidates if r['release'] in p.parts]
            if family=='FIGARO':
                preferred=[p for p in candidates if r['table'] in p.parts]
                if preferred:candidates=preferred
            if len(candidates)==1:path=candidates[0].parent if family=='FIGARO' else candidates[0]
            elif family=='FIGARO':
                for folder in ((r['table'], 'SUT' if r['table']=='IOT' else 'IOT')):
                    candidate=source/f'FIGARO/{folder}/{year}'
                    if candidate.is_dir():path=candidate;break
        if path is None or not path.exists():continue
        r['economic_accounts']=True
        options.pop('regions',None)
        has_ghg=bool(r.get('ghg_factors')) and r.get('ghg_usable') is not False
        if family=='ADB' and has_ghg:
            name=provenance.get('emissions',{}).get('filename');candidates=files.get(name,[])
            if len(candidates)!=1:raise ValueError('Missing exact ADB environmental companion: '+str(name))
            options['add_extensions']=str(candidates[0])
        elif family in {'ADB','WIOD'}:options.pop('add_extensions',None)
        if family=='EXIOBASE' and r['table']=='SUT':options['add_extensions']=str(source/f'EXIOBASE/{r["release"]}/IOT_{year}_ixi.zip')
        if family=='EMERGING':
            if has_ghg:
                release=provenance.get('emissions',{}).get('release') or r['release']
                options['co2_path']=str(source/f'EMERGING/{release}/EMERGING_CO2_{year}.mat');options['load_co2']=True
            else:options['load_co2']=False
        # Extension tables differ from economic blocks; validate actual selected
        # factors separately, without demanding unrelated GDP satellite extras.
        r['expected_units']={k:v for k,v in r.get('expected_units',{}).items() if k in {'Sector','Activity','Commodity'}}
        yield {'id':r['id'],'path':path,'recipe':r,'original':original}

    # Distinct sources which have native set profiles and Trade but no GDP snapshot.
    for entry in json.loads((ROOT/'doc/account-source-recipes.json').read_text())['readings']:
        r=copy.deepcopy(entry['recipe']);r['economic_accounts']=True
        yield {'id':r['id'],'path':source/entry['source_path'],'recipe':r,'original':{'recipe':entry['recipe'],'regions':[],'provenance':entry['provenance']}}
