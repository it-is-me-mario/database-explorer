"""Build the independent explorer and retain routes to upstream library guides."""
from pathlib import Path
import argparse
import html
import hashlib
import shutil
import json
import os
import re
import subprocess
import sys
import gzip
import io
from asset_transport import git_blob_sha, source_asset_index, source_url, valid_asset
from urllib.parse import quote
from urllib.request import Request, urlopen

ROOT=Path(__file__).resolve().parent
JSON_COMPRESSION_THRESHOLD=64*1024
MAX_SITE_BYTES=1_000_000_000


def snapshot_embodied_assets(output):
    """Copy one manifest-consistent view while a collector may publish new IDs."""
    source=ROOT/'doc/source/_static/data/embodied-trade'
    destination=output/'_static/data/embodied-trade';destination.mkdir(parents=True,exist_ok=True)
    manifest=(source/'manifest.json').read_bytes()
    names={'manifest.json'}
    for reading in json.loads(manifest)['readings']:
        names.update([reading['file'],*reading.get('sector_files',{}).values()])
    for name in names-{'manifest.json'}:
        assert Path(name).name==name,('Unsafe embodied asset filename',name)
        (destination/name).write_bytes((source/name).read_bytes())
    # The aggregate collector replaces complete files atomically. A newer source
    # manifest arriving during the copy belongs to the next build, not this one.
    (destination/'manifest.json').write_bytes(manifest)
    for file in destination.iterdir():
        logical=file.name.removesuffix('.gz')
        if file.is_file() and logical.endswith('.json') and logical not in names:file.unlink()


def compress_json_assets(output):
    """Publish exact JSON bytes losslessly, keeping canonical source files intact."""
    static=output/'_static';registry_path=static/'json-assets.json'
    previous={}
    if not registry_path.resolve().is_relative_to(static.resolve()):
        raise ValueError('Previous JSON asset registry escapes static tree')
    if registry_path.exists():
        registry=json.loads(registry_path.read_text())
        if registry.get('schema_version')!=1 or not isinstance(registry.get('assets'),dict):
            raise ValueError('Invalid previous JSON asset registry')
        previous=registry['assets']
        # Validate the entire prior registry before compression, reads or cleanup.
        # In particular, never let a stale transport path redirect an unlink.
        for relative,entry in previous.items():
            if not valid_asset(relative,entry):raise ValueError(f'Invalid previous JSON asset entry: {relative!r}')
            local_names=[relative]+([entry['path']] if entry['encoding']=='gzip' else [])
            if not all((static/name).resolve().is_relative_to(static.resolve()) for name in local_names):
                raise ValueError(f'Previous JSON asset escapes static tree: {relative!r}')
    assets={};saved=0
    sector_paths=list((static/'data/embodied-trade').glob('*--*.json'))
    commit,blobs=None,{}
    if sector_paths:
        try:commit,blobs=source_asset_index(ROOT)
        except (subprocess.CalledProcessError,FileNotFoundError):pass
    for path in sorted((static/'data').rglob('*.json')):
        relative=path.relative_to(static).as_posix()
        if not path.resolve().is_relative_to(static.resolve()):
            raise ValueError(f'JSON asset escapes static tree: {relative!r}')
        if path.stat().st_size<JSON_COMPRESSION_THRESHOLD or relative.startswith('data/benchmarks/'):
            continue
        original=path.read_bytes()
        if relative.startswith('data/embodied-trade/') and '--' in path.name and blobs.get(relative)==git_blob_sha(original):
            assets[relative]={'path':source_url(commit,relative),'encoding':'identity',
                              'source_commit':commit,'bytes':len(original),
                              'sha256':hashlib.sha256(original).hexdigest(),'compressed_bytes':len(original)}
            path.with_suffix('.json.gz').unlink(missing_ok=True)
            saved+=len(original);path.unlink()
            continue
        buffer=io.BytesIO()
        # Empty filename and a fixed timestamp make the gzip header reproducible.
        with gzip.GzipFile(fileobj=buffer,mode='wb',filename='',mtime=0,compresslevel=6) as stream:
            stream.write(original)
        packed=buffer.getvalue()
        if len(packed)>=len(original):continue
        assert gzip.decompress(packed)==original,'Compression changed JSON bytes'
        compressed=path.with_suffix('.json.gz');temporary=compressed.with_suffix('.gz.tmp')
        if not all(item.resolve().is_relative_to(static.resolve()) for item in (compressed,temporary)):
            raise ValueError(f'JSON transport escapes static tree: {relative!r}')
        temporary.write_bytes(packed);temporary.replace(compressed)
        assets[relative]={'path':compressed.relative_to(static).as_posix(),'encoding':'gzip',
                          'bytes':len(original),'sha256':hashlib.sha256(original).hexdigest(),
                          'compressed_bytes':len(packed)}
        saved+=len(original)-len(packed);path.unlink()
    # An incremental Sphinx copy restores canonical JSON. Also handle a second
    # compression pass without that copy, checking the retained bytes explicitly.
    for relative,entry in previous.items():
        if relative in assets:continue
        if entry['encoding']=='identity':
            # A second pass has no local transport. Validate the retained source
            # before preserving its exact commit-pinned registry entry.
            if (static/relative).exists():continue
            canonical=ROOT/'doc/source/_static'/relative
            if not canonical.exists():continue
            raw=canonical.read_bytes()
            if len(raw)!=entry['bytes'] or hashlib.sha256(raw).hexdigest()!=entry['sha256']:
                raise ValueError(f'Stale repository JSON asset: {relative!r}')
            assets[relative]=entry
            continue
        compressed=static/entry['path']
        if (static/relative).exists():
            compressed.unlink(missing_ok=True)
        elif compressed.exists():
            raw=gzip.decompress(compressed.read_bytes())
            assert len(raw)==entry['bytes'] and hashlib.sha256(raw).hexdigest()==entry['sha256'],('Stale compressed asset',relative)
            assets[relative]=entry
    registry={'schema_version':1,'assets':dict(sorted(assets.items()))}
    registry_path.write_text(json.dumps(registry,separators=(',',':'))+'\n')
    total=sum(path.stat().st_size for path in output.rglob('*') if path.is_file())
    if total>MAX_SITE_BYTES:raise ValueError(f'Published site is {total:,} bytes; publication budget is {MAX_SITE_BYTES:,}. Keep all values exact when reducing asset size.')
    external=sum(entry['encoding']=='identity' for entry in assets.values())
    print(f'Lossless JSON assets: {len(assets)-external} compressed, {external} commit-pinned source files, {saved:,} bytes removed from the local bundle in this pass; site {total:,} bytes.')
    return registry

def prepare_shared_theme(source=None):
    """Import the common header, layout and link behaviour at one immutable commit."""
    if source is None and os.environ.get('EXPLORER_SHARED_THEME_ROOT'):
        return Path(os.environ['EXPLORER_SHARED_THEME_ROOT'])
    source = source or json.loads((ROOT / 'shared-theme.json').read_text())
    repository, revision = source['repository'], source['revision']
    if not re.fullmatch(r'[0-9a-f]{40}', revision):
        raise ValueError('The shared theme requires a full commit SHA')
    destination = ROOT / '_build/shared-theme' / revision
    ready = destination / '.ready'
    if ready.is_file():
        return destination

    def fetch(url):
        headers = {'User-Agent': 'MARIO-Database-Explorer'}
        token = os.environ.get('GH_TOKEN') or os.environ.get('GITHUB_TOKEN')
        if token and url.startswith('https://api.github.com/'):
            headers['Authorization'] = f'Bearer {token}'
        with urlopen(Request(url, headers=headers), timeout=60) as response:
            return response.read()

    tree = json.loads(fetch(f'https://api.github.com/repos/{repository}/git/trees/{revision}?recursive=1'))
    if tree.get('truncated'):
        raise ValueError('The shared-theme source tree is incomplete')
    prefix = 'doc/source/_themes/mario/'
    names = [entry['path'] for entry in tree['tree']
             if entry['type'] == 'blob' and entry['path'].startswith(prefix)]
    if prefix + 'theme.toml' not in names:
        raise ValueError('The shared-theme source has no theme.toml')
    names.extend('doc/source/_static/' + name for name in
                 ('external-links.js', 'docs-versions.js', 'docs-versions.css'))
    for name in names:
        target = destination / name.removeprefix('doc/source/')
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(fetch(f'https://raw.githubusercontent.com/{repository}/{revision}/{quote(name)}'))
    ready.touch()
    return destination


def build(output):
    subprocess.run([sys.executable,'-m','sphinx','-b','html','-W','--keep-going',str(ROOT/'doc/source'),str(output)],check=True)
    for document in json.loads((ROOT/'source-manifest.json').read_text()).get('upstream_documents',[]):
        path=output/(document+'.html')
        if path.exists():continue
        target='https://www.marioproject.com/en/latest/'+document+'.html'
        path.parent.mkdir(parents=True,exist_ok=True)
        path.write_text('<!doctype html><html lang="en"><head><meta charset="utf-8"><title>MARIO documentation</title><link rel="canonical" href="'+html.escape(target,quote=True)+'"><meta http-equiv="refresh" content="0;url='+html.escape(target,quote=True)+'"><script>location.replace('+json.dumps(target)+'+location.hash);</script></head><body><a href="'+html.escape(target,quote=True)+'">Continue to the MARIO documentation</a></body></html>')
    reproduce=output/'_static/reproduce'
    # Inline the same reviewed helpers into transparent, standalone source cells.
    categories=(reproduce/'recipes/indicators/demand_categories.py').read_text()
    helpers=(reproduce/'recipes/indicators/public_accounts.py').read_text().replace('from .demand_categories import classify','')
    template=reproduce/'source-recipe.template.txt'
    template.write_text(template.read_text().replace('__CATEGORY_HELPERS__',categories).replace('__ACCOUNT_HELPERS__',helpers))
    files=[]
    for canonical in sorted((ROOT/'doc/source/_static/reproduce/recipes').rglob('*.py')):
        source=reproduce/'recipes'/canonical.relative_to(ROOT/'doc/source/_static/reproduce/recipes')
        files.append({'path':'reproduce/'+source.relative_to(reproduce).as_posix(),'name':source.relative_to(reproduce).as_posix(),'sha256':hashlib.sha256(source.read_bytes()).hexdigest()})
    for filename,name in [('source-recipe.template.txt','source-recipe.template.txt'),('run_selection.py','run_selection.py'),('chart.template.txt','chart.html'),('README.txt','README.txt')]:
        source=reproduce/filename;files.append({'path':'reproduce/'+filename,'name':name,'sha256':hashlib.sha256(source.read_bytes()).hexdigest()})
    licence=next(ROOT.glob('LICENSE*'));shutil.copyfile(licence,reproduce/'LICENSE.txt')
    for source,name in [(reproduce/'LICENSE.txt','LICENSE.txt'),(output/'_static/economy-charts.js','charts/economy-charts.js'),(output/'_static/trade-charts.js','charts/trade-charts.js'),(output/'_static/download-figure.js','charts/download-figure.js')]:
        files.append({'path':source.relative_to(output/'_static').as_posix(),'name':name,'sha256':hashlib.sha256(source.read_bytes()).hexdigest()})
    (reproduce/'manifest.json').write_text(json.dumps({'schema_version':1,'mario_version':'1.3.4','files':files},separators=(',',':'))+'\n')
    landing = 'resources/data-explorer/scope.html'
    (output / 'index.html').write_text(
        '<!doctype html><html lang="en"><head><meta charset="utf-8">'
        '<title>Classifications · MARIO Database Explorer</title>'
        '<link rel="canonical" href="https://explorer.marioproject.com/' + landing + '">'
        '<meta http-equiv="refresh" content="0;url=' + landing + '">'
        '<script>const target = new URL(' + json.dumps(landing) + ', location.href);'
        'target.search = location.search; target.hash = location.hash;'
        'location.replace(target.href);</script></head><body>'
        '<a href="' + landing + '">Open Classifications</a></body></html>'
    )
    manifest = {
        'site_commit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
        'theme': json.loads((ROOT / 'shared-theme.json').read_text()),
        'landing': landing,
    }
    (output / 'site-build.json').write_text(json.dumps(manifest, indent=2) + '\n')
    (output/'.nojekyll').touch()
    snapshot_embodied_assets(output)
    compress_json_assets(output)

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,default=ROOT/'_site')
    args=parser.parse_args();build(args.output.resolve())
