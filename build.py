"""Build the independent explorer and retain routes to upstream library guides."""
from pathlib import Path
import argparse
import html
import json
import os
import re
import subprocess
import sys
from urllib.parse import quote
from urllib.request import Request, urlopen

ROOT=Path(__file__).resolve().parent

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

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,default=ROOT/'_site')
    args=parser.parse_args();build(args.output.resolve())
