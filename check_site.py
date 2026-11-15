"""Check static explorer links, finite trade observations and scope integrity."""
from pathlib import Path
from html.parser import HTMLParser
import argparse
import json
import math
import urllib.parse

class Links(HTMLParser):
    def __init__(self):super().__init__();self.links=[];self.ids=set();self.redirect=False;self.scripts=[];self.sections=[]
    def handle_starttag(self,tag,attrs):
        attrs=dict(attrs)
        if 'id' in attrs:self.ids.add(attrs['id'])
        if tag=='meta' and attrs.get('http-equiv','').lower()=='refresh':self.redirect=True
        if tag=='script' and attrs.get('src'):self.scripts.append(attrs)
        if 'data-nav-section' in attrs:self.sections.append(attrs['data-nav-section'])
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
    page=parsed[root/'resources/data-explorer/trade.html']
    assert parsed[root/'index.html'].redirect, 'The site root must open Classifications directly'
    landing = 'resources/data-explorer/scope.html'
    assert landing in parsed[root/'index.html'].links
    for document in ('scope', 'compare', 'trade', 'analyses'):
        navigation = parsed[root/f'resources/data-explorer/{document}.html']
        assert navigation.sections == ['get_started', 'docs', 'explorer', 'resources']
        assert 'https://www.marioproject.com/en/latest/' in navigation.links
        assert 'https://tutorials.marioproject.com/' in navigation.links
    build = json.loads((root/'site-build.json').read_text())
    assert build['landing'] == landing
    assert build['theme'] == json.loads((Path(__file__).parent/'shared-theme.json').read_text())
    scripts=[s for s in page.scripts if 'trade-' in s['src']]
    assert len(scripts)==2 and all('defer' in s for s in scripts),'Trade scripts must run after DOM parsing'
    assert 'trade-model.js' in scripts[0]['src'] and 'trade-browser.js' in scripts[1]['src']
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
