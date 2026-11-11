"""Check static explorer links, finite trade observations and scope integrity."""
from pathlib import Path
from html.parser import HTMLParser
import argparse
import json
import math
import urllib.parse
import gzip
import hashlib

def check_json_assets(static):
    """Verify each compressed transport and return a logical JSON reader."""
    registry=json.loads((static/'json-assets.json').read_text())
    assert registry['schema_version']==1 and isinstance(registry['assets'],dict),'Invalid JSON asset registry'
    entries=registry['assets']
    for logical,entry in entries.items():
        original=static/logical;compressed=static/entry['path']
        assert not Path(logical).is_absolute() and '..' not in Path(logical).parts,('Unsafe logical JSON path',logical)
        assert compressed.resolve().is_relative_to(static.resolve()),('Compressed asset outside static tree',logical)
        assert entry['encoding']=='gzip' and entry['path']==logical+'.gz',('Invalid JSON encoding/path',logical)
        assert not original.exists(),('Redundant raw JSON asset',logical)
        packed=compressed.read_bytes();raw=gzip.decompress(packed)
        assert len(packed)==entry['compressed_bytes'],('Compressed size differs',logical)
        assert len(raw)==entry['bytes'] and hashlib.sha256(raw).hexdigest()==entry['sha256'],('Decoded JSON differs',logical)
    def read(path):
        logical=path.relative_to(static).as_posix()
        entry=entries.get(logical)
        raw=gzip.decompress((static/entry['path']).read_bytes()) if entry else path.read_bytes()
        return json.loads(raw)
    return read


def check_embodied(folder,read_json=None):
    """Replay aggregate checks without loading private native models or coefficients."""
    if read_json is None:read_json=lambda path:json.loads(path.read_text())
    manifest=read_json(folder/'manifest.json')
    assert manifest['schema_version']==1
    records=manifest['readings']
    assert records,'No embodied-trade readings published'
    assert len({row['id'] for row in records})==len(records),'Duplicate embodied reading identity'

    def finite(value):
        if isinstance(value,dict):return all(finite(v) for v in value.values())
        if isinstance(value,list):return all(finite(v) for v in value)
        return type(value) in (int,float) and math.isfinite(value)

    def add(left,right):
        if isinstance(left,dict):
            assert left.keys()==right.keys(),'Aggregate component keys differ'
            return {key:add(left[key],right[key]) for key in left}
        if isinstance(left,list):
            assert len(left)==len(right),'Aggregate shapes differ'
            return [add(a,b) for a,b in zip(left,right)]
        return left+right

    def close(left,right,label,atol=1e-6):
        if isinstance(left,dict):
            assert left.keys()==right.keys(),(label,'Component keys differ')
            for key in left:close(left[key],right[key],label,atol)
        elif isinstance(left,list):
            assert len(left)==len(right),(label,'Shapes differ')
            for a,b in zip(left,right):close(a,b,label,atol)
        else:
            assert abs(left-right)<=atol+1e-8*abs(left),(label,left,right)

    def payload(data,n,label):
        assert finite(data.get('accounts',{})),('Non-finite accounts',label)
        for metric in ('ghg_trade','value_added_trade'):
            if metric not in data:continue
            assert finite(data[metric]),('Non-finite embodied trade',label,metric)
            blocks=data[metric].values() if metric=='value_added_trade' else [data[metric]]
            for block in blocks:
                assert set(block)=={'intermediate','final'},('Incorrect use components',label,metric)
                for matrix in block.values():
                    assert len(matrix)==n and all(len(row)==n for row in matrix),('Native trade matrix shape differs',label,metric)
            if metric=='value_added_trade':
                va=data[metric]
                assert set(va)=={'total','domestic','foreign'},('Incorrect VA origins',label)
                close(va['total'],add(va['domestic'],va['foreign']),f'{label}: total VA != domestic + foreign')

    for record in records:
        data=read_json(folder/record['file']);label=record['id']
        assert data['id']==data['recipe']['id']==label,('Reading identity differs',label)
        codes=[r['code'] for r in data['regions']];n=len(codes)
        assert n and len(set(codes))==n,('Duplicate or missing native regions',label)
        provenance=data['provenance']
        assert provenance['region_order']==codes,('Embodied geography differs from axes',label)
        assert provenance['mario_version']=='1.3.4'
        assert provenance['inputs'] and all(len(item['sha256'])==64 for item in provenance['inputs']),('Missing exact-input fingerprints',label)
        assert record['metrics']==data['metrics'],('Manifest metrics differ',label)
        assert finite(data['residuals']),('Non-finite embodied residuals',label)
        payload(data,n,label)
        for metric in ('ghg_trade','value_added_trade'):
            assert (metric in data)==(metric in data['metrics']),('Metric availability differs',label,metric)
            if metric in data:assert metric in provenance['metric_compute'],('Missing compute provenance',label,metric)
        pairs={'value_added_footprint':('value_added_trade','value_added'),'ghg_footprint':('ghg_trade','ghg_tonnes')}
        for metric in pairs:
            assert (metric in data['accounts'])==(metric in data['metrics']),('Footprint availability differs',label,metric)
        expected={metric for metric,(trade,_) in pairs.items() if metric in data['accounts'] or trade in data}
        assert set(provenance['footprint_boundaries'])==expected,('Missing or extraneous origin proof',label)
        for metric in expected:
            boundary=provenance['footprint_boundaries'][metric]
            assert metric in data['accounts'] and metric in provenance['metric_compute'],('Missing footprint or compute provenance',label,metric)
            footprint=data['accounts'][metric]
            assert len(footprint)==n and all(len(row)==2 for row in footprint),('Invalid footprint shape',label,metric)
            arrays=[boundary[key] for key in ('production_by_origin','allocated_by_origin','unrepresented_direct','unassigned_requirements')]
            assert all(len(array)==n and finite(array) for array in arrays),('Invalid origin proof',label,metric)
            close(arrays[0],add(add(arrays[1],arrays[2]),arrays[3]),f'{label}: production origin balance',atol=.1)
            close(data['residuals'][pairs[metric][1]],add(arrays[2],arrays[3]),f'{label}: proof differs from published residual',atol=.1)
            final_users=0
            if metric=='ghg_footprint':
                direct=data['direct_final_user_emissions']
                assert len(direct)==n and finite(direct),('Invalid direct final-user emissions',label)
                final_users=sum(direct)
            close(sum(arrays[1]),sum(sum(row) for row in footprint)-final_users,f'{label}: proof differs from published footprint',atol=.1)
        for field in ('sector_files','sector_groups','sector_classification','sector_scope'):
            assert record.get(field)==data.get(field),('Manifest sector metadata differs',label,field)
        assert data['sector_files'].keys()==data['sector_groups'].keys(),('Missing atomic group, including unassigned',label)
        shards=[]
        for group,filename in data['sector_files'].items():
            assert group in data['sector_groups'],('Unknown sector shard',label,group)
            shard=read_json(folder/filename)
            assert shard['id']==label and shard['section']==group,('Shard identity differs',label,group)
            payload(shard,n,f'{label}/{group}');shards.append(shard)
        if shards:
            fields=['accounts',*[metric for metric in ('ghg_trade','value_added_trade') if metric in data]]
            combined={key:shards[0][key] for key in fields}
            for shard in shards[1:]:combined=add(combined,{key:shard[key] for key in fields})
            if 'ghg_footprint' in combined['accounts']:
                direct=data['direct_final_user_emissions']
                assert len(direct)==n and finite(direct),('Invalid direct final-user emissions',label)
                combined['accounts']['ghg_footprint']=add(combined['accounts']['ghg_footprint'],[[value,0] for value in direct])
            close(combined,{key:data[key] for key in fields},f'{label}: atomic sectors do not reconcile to full total')
    return len(records)

class Links(HTMLParser):
    def __init__(self):super().__init__();self.links=[];self.ids=set();self.redirect=False;self.scripts=[]
    def handle_starttag(self,tag,attrs):
        attrs=dict(attrs)
        if 'id' in attrs:self.ids.add(attrs['id'])
        if tag=='meta' and attrs.get('http-equiv','').lower()=='refresh':self.redirect=True
        if tag=='script' and attrs.get('src'):self.scripts.append(attrs)
        for key in ('href','src'):
            if key in attrs:self.links.append(attrs[key])

def check(root):
    read_json=check_json_assets(root/'_static')
    parsed={}
    for path in root.rglob('*.html'):
        p=Links();p.feed(path.read_text());parsed[path]=p
    checked=0
    for path,parser in parsed.items():
        for link in parser.links:
            url=urllib.parse.urlsplit(link)
            if url.scheme or url.netloc:continue
            target=(path.parent/urllib.parse.unquote(url.path)).resolve() if url.path else path
            assert target.is_relative_to(root),('Outside site',path,link)
            assert target.exists(),('Missing link',path.relative_to(root),link)
            if url.fragment and target in parsed and not parsed[target].redirect:
                assert urllib.parse.unquote(url.fragment) in parsed[target].ids,('Missing anchor',path.relative_to(root),link)
            checked+=1
    page=parsed[root/'resources/data-explorer/compare.html']
    names=['economy-model.js','economy-charts.js','trade-model.js','trade-charts.js','account-model.js','comparison-guide.js','reproduction-download.js','economy-browser.js']
    scripts=[s for s in page.scripts if Path(urllib.parse.urlsplit(s['src']).path).name in names]
    assert len(scripts)==8 and all('defer' in s for s in scripts),'Comparison scripts must run after DOM parsing'
    assert [Path(urllib.parse.urlsplit(s['src']).path).name for s in scripts]==names,'Comparison dependencies must load in order'
    reproduction=json.loads((root/'_static/reproduce/manifest.json').read_text())
    for item in reproduction['files']:
        assert hashlib.sha256((root/'_static'/item['path']).read_bytes()).hexdigest()==item['sha256'],'Reproduction source checksum mismatch'
    assert 'trade' in page.ids,'Trade deep link is missing'
    assert parsed[root/'resources/data-explorer/trade.html'].redirect,'Old Trade URL must redirect'
    folder=root/'_static/data/trade'
    manifest=read_json(folder/'manifest.json')
    assert manifest['datasets'],'No real trade readings published'
    for record in manifest['datasets']:
        reading=read_json(folder/record['file'])
        assert reading['provenance']['mario_version']=='1.3.4'
        assert 1995<=reading['year']<=2025
        for region in reading['regions']:
            assert region['kind']=='country' or region['iso3'] is None
        for block in reading['flows'].values():
            for matrix in block.values():
                assert len(matrix)==len(reading['regions'])
                assert all(len(row)==len(matrix) and all(math.isfinite(v) for v in row) for row in matrix)
    accounts=root/'_static/data/accounts'
    account_manifest=read_json(accounts/'manifest.json')
    def finite_values(value):
        if isinstance(value,dict):return all(finite_values(v) for v in value.values())
        if isinstance(value,list):return all(finite_values(v) for v in value)
        return isinstance(value,(int,float)) and math.isfinite(value)
    for record in account_manifest['readings']:
        data=read_json(accounts/record['file'])
        assert all(finite_values(region['accounts']) for region in data['regions']),('Non-finite account value',record['id'])
        assert finite_values(data['residuals']),('Non-finite account residual',record['id'])
        if data.get('ghg_trade'):
            assert data['provenance'].get('ghg_trade_region_order')==[r['code'] for r in data['regions']],('Carbon trade geography differs from its axes',record['id'])
            assert finite_values(data['ghg_trade']),('Non-finite carbon trade',record['id'])
    embodied_count=check_embodied(root/'_static/data/embodied-trade',read_json)
    references=read_json(folder/'comtrade.json')
    assert references['observations'],'No real Comtrade observations'
    assert all(r['scope']=='merchandise TOTAL' for r in references['observations'])
    print(f'PASS: {len(parsed)} HTML routes, {checked} local links, {len(manifest["datasets"])} trade readings, {embodied_count} embodied-trade readings, {len(references["observations"])} merchandise references')

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('root',type=Path)
    check(parser.parse_args().root.resolve())
