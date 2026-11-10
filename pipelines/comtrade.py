"""Explicitly fetch and cache a small merchandise-only Comtrade reference.

Coverage is reporters China/Italy, selected MRIO years, exports/imports and all
partners at TOTAL. Builds never call this collector. Truncation is an error.
"""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
import hashlib
import json
import logging
from pathlib import Path
import time
import urllib.error
import urllib.parse
import urllib.request
import country_converter as coco

ROOT = Path(__file__).resolve().parents[1]
BASE = 'https://comtradeapi.un.org/public/v1/preview/C/A/HS'


AREA_URL='https://comtradeapi.un.org/files/v1/app/reference/partnerAreas.json'
# Reviewed current reporting areas whose boundaries extend beyond their ISO country.
QUALIFIED_AREAS={251,579,757,842}

def load_areas(refresh=False):
    path=ROOT/'_cache/comtrade/partner-areas.json';path.parent.mkdir(parents=True,exist_ok=True)
    if path.exists() and not refresh:saved=json.loads(path.read_text())
    else:
        with urllib.request.urlopen(AREA_URL,timeout=45) as response:raw=response.read()
        saved={'query_url':AREA_URL,'retrieved_at':datetime.now(timezone.utc).isoformat(),'sha256':hashlib.sha256(raw).hexdigest(),'response':json.loads(raw)}
        temporary=path.with_suffix('.tmp');temporary.write_text(json.dumps(saved,separators=(',',':')));temporary.replace(path)
    records=saved['response'].get('results')
    if not isinstance(records,list):raise ValueError('Invalid official Comtrade area reference')
    areas={int(r['PartnerCode']):{'iso3':r.get('PartnerCodeIsoAlpha3'),'name':r.get('PartnerDesc') or r.get('text'),'note':r.get('partnerNote'),'is_group':r.get('isGroup',False)} for r in records}
    return areas,{k:saved[k] for k in ('query_url','retrieved_at','sha256')}

def collect(refresh=False, years=None):
    """Cache explicit annual TOTAL queries; never turn failed/absent reports into zero."""
    import math
    from functools import lru_cache
    logging.getLogger('country_converter').setLevel(logging.ERROR)
    target=ROOT/'doc/source/_static/data/trade/comtrade.json'
    published=json.loads(target.read_text()) if target.exists() else {'requests':[],'observations':[]}
    manifest=ROOT/'doc/source/_static/data/trade/manifest.json'
    if years is None:
        years=sorted({r['year'] for r in json.loads(manifest.read_text())['datasets']}) if manifest.exists() else [2015,2022]
    years=sorted(set(years));observations={};requests=[];last_request=0.;blocked=False;failures=0
    cache=ROOT/'_cache/comtrade';cache.mkdir(parents=True,exist_ok=True)
    converter=coco.CountryConverter();recognized=set(converter.data['ISO3'].dropna());areas,area_provenance=load_areas(refresh=refresh)
    @lru_cache(maxsize=1024)
    def iso(code):return converter.convert(names=code,src='UNcode',to='ISO3',not_found='__unmapped__')
    def entity(row,key,code):
        meta=areas.get(code,{})
        description=meta.get('name','');note=meta.get('note') or ''
        if meta.get('is_group') or '(...' in description or ', nes' in description.lower() or 'not elsewhere specified' in note.lower() or note.startswith('Former '):return None
        supplied=row.get(key) or meta.get('iso3')
        if supplied:
            value=str(supplied).strip().upper()
            return value if value in recognized else None
        value=iso(code)
        return value if isinstance(value,str) and value in recognized else None
    def area_note(code):
        meta=areas.get(code,{});note=meta.get('note')
        return f"Comtrade reporting area {code}: {note}" if code in QUALIFIED_AREAS and note else ''
    old_queries={r['query_url']:r for r in published['requests'] if r.get('request_status','complete') in {'complete','cached_published','no_data'}}
    old_rows={url:[r for r in published['observations'] if r['query_url']==url] for url in old_queries}
    def keep(rows):
        prepared={}
        for item in rows:
            key=(item['origin'],item['destination'],item['year'],item['kind'])
            previous=prepared.get(key,observations.get(key))
            if previous and (previous['value_usd']!=item['value_usd'] or previous['partner_code']!=item['partner_code']):raise ValueError('Ambiguous reporting areas or conflicting reference records for one country pair')
            prepared[key]=item
        observations.update(prepared)
    for year in years:
      for reporter in (156,380):
       for flow in ('X','M'):
        parameters={'period':str(year),'reporterCode':str(reporter),'cmdCode':'TOTAL','flowCode':flow}
        url=BASE+'?'+urllib.parse.urlencode(parameters);path=cache/(hashlib.sha256(url.encode()).hexdigest()+'.json')
        if not refresh and published.get('normalization_version')==3 and url in old_queries and not path.exists():
            keep(old_rows[url]);requests.append({**old_queries[url],'request_status':'cached_published'});continue
        downloaded=False
        try:
            if path.is_file() and not refresh:saved=json.loads(path.read_text())
            elif blocked:
                requests.append({'query_url':url,'records':None,'request_status':'not_collected_after_provider_limit'});continue
            else:
                pause=4.-(time.monotonic()-last_request)
                if pause>0:time.sleep(pause)
                try:
                    with urllib.request.urlopen(url,timeout=45) as response:result=json.load(response)
                finally:last_request=time.monotonic()
                saved={'query_url':url,'retrieved_at':datetime.now(timezone.utc).isoformat(),'response':result}
                downloaded=True
            rows=saved['response'].get('data')
            if saved['response'].get('error') or not isinstance(rows,list) or len(rows)>=500:raise ValueError('Response failed or may be truncated; no partial query is published')
            normalized=[]
            for row in rows:
                if str(row.get('cmdCode'))!='TOTAL' or int(row.get('period',0))!=year or int(row.get('reporterCode',reporter))!=reporter or row.get('flowCode',flow)!=flow:raise ValueError('Unexpected source scope, reporter, flow or year')
                if row.get('partner2Code',0)!=0 or row.get('motCode',0)!=0 or row.get('customsCode','C00')!='C00':continue
                partner=int(row['partnerCode'])
                if partner==0:continue
                reporter_iso=entity(row,'reporterISO',reporter);partner_iso=entity(row,'partnerISO',partner)
                if reporter_iso!=iso(reporter):raise ValueError('Reporter ISO differs from requested reporting area')
                origin,destination=(reporter_iso,partner_iso) if flow=='X' else (partner_iso,reporter_iso)
                if not origin or not destination or origin==destination:continue
                value=row.get('primaryValue')
                if value is None or not math.isfinite(float(value)) or float(value)<0:raise ValueError('Invalid merchandise value')
                normalized.append({'origin':origin,'destination':destination,'year':year,'kind':'export' if flow=='X' else 'mirror_import','value_usd':float(value),'scope':'merchandise TOTAL','valuation':'usually FOB' if flow=='X' else 'usually CIF','reporter_code':reporter,'partner_code':partner,'reporter_iso':reporter_iso,'partner_iso':partner_iso,'reporter_name':row.get('reporterDesc') or areas.get(reporter,{}).get('name'),'partner_name':row.get('partnerDesc') or areas.get(partner,{}).get('name'),'origin_area_note':area_note(reporter if flow=='X' else partner),'destination_area_note':area_note(partner if flow=='X' else reporter),'is_reported':row.get('isReported'),'is_aggregate':row.get('isAggregate'),'query_url':url,'retrieved_at':saved['retrieved_at']})
            keep(normalized)
            if downloaded:
                temp=path.with_suffix('.tmp');temp.write_text(json.dumps(saved,separators=(',',':'))+'\n');temp.replace(path)
            requests.append({'query_url':url,'retrieved_at':saved['retrieved_at'],'records':len(rows),'request_status':'complete' if rows else 'no_data'});failures=0
            print(year,reporter,flow,'records',len(rows),flush=True)
        except (urllib.error.URLError,TimeoutError,ValueError,OSError) as error:
            failures+=1
            if isinstance(error,urllib.error.HTTPError) and error.code in (403,429):blocked=True
            if failures>=3:blocked=True
            requests.append({'query_url':url,'records':None,'request_status':'provider_error','error':str(error)})
            if url in old_rows:keep(old_rows[url])
            print('UNAVAILABLE',year,reporter,flow,type(error).__name__,str(error),flush=True)
    if len(observations)>=100000:raise ValueError('Original-record redistribution ceiling requires a new source-terms review')
    observed=sorted({r['year'] for r in observations.values()})
    payload={'schema_version':1,'normalization_version':3,'area_reference':area_provenance,'geography_note':'Official provider ISO3 reporting areas are retained with numeric codes, names and area qualifications. Broad reporting areas remain intact as contextual references; they are never split into constituent countries. Qualified-area group sums are withheld when compatible boundaries cannot be established.','source':'UN Comtrade','attribution':'Source: UN Comtrade.','type':'C','frequency':'A','commodity':'TOTAL','coverage_note':'Reporters China and Italy; collected partners only. Requested years: '+', '.join(map(str,years))+'. Failed, absent or uncollected reports remain unavailable.','requested_years':years,'observed_years':observed,'reuse_url':'https://uncomtrade.org/docs/re-dissemination-of-data/','requests':requests,'observations':list(observations.values())}
    target.parent.mkdir(parents=True,exist_ok=True);temporary=target.with_suffix('.tmp');temporary.write_text(json.dumps(payload,ensure_ascii=False,separators=(',',':'),allow_nan=False)+'\n');temporary.replace(target)
    return payload


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--refresh',action='store_true');parser.add_argument('--years',type=int,nargs='+');args=parser.parse_args()
    result=collect(args.refresh,args.years)
    print('Published',len(result['observations']),'reference observations; observed years',result['observed_years'],flush=True)
