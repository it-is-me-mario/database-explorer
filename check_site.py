"""Check static explorer links, finite trade observations and scope integrity."""
from pathlib import Path
from html.parser import HTMLParser
import argparse
import json
import math
import urllib.parse

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
    import hashlib
    reproduction=json.loads((root/'_static/reproduce/manifest.json').read_text())
    for item in reproduction['files']:
        assert hashlib.sha256((root/'_static'/item['path']).read_bytes()).hexdigest()==item['sha256'],'Reproduction source checksum mismatch'
    assert 'trade' in page.ids,'Trade deep link is missing'
    assert parsed[root/'resources/data-explorer/trade.html'].redirect,'Old Trade URL must redirect'
    folder=root/'_static/data/trade'
    manifest=json.loads((folder/'manifest.json').read_text())
    assert manifest['datasets'],'No real trade readings published'
    for record in manifest['datasets']:
        reading=json.loads((folder/record['file']).read_text())
        assert reading['provenance']['mario_version']=='1.3.4'
        assert reading['year'] in (2015,2022)
        for region in reading['regions']:
            assert region['kind']=='country' or region['iso3'] is None
        for block in reading['flows'].values():
            for matrix in block.values():
                assert len(matrix)==len(reading['regions'])
                assert all(len(row)==len(matrix) and all(math.isfinite(v) for v in row) for row in matrix)
    references=json.loads((folder/'comtrade.json').read_text())
    assert references['observations'],'No real Comtrade observations'
    assert all(r['scope']=='merchandise TOTAL' for r in references['observations'])
    print(f'PASS: {len(parsed)} HTML routes, {checked} local links, {len(manifest["datasets"])} trade readings, {len(references["observations"])} merchandise references')

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('root',type=Path)
    check(parser.parse_args().root.resolve())
