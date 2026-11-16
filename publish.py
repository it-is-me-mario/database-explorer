"""Publish Latest, Dev and Preview using their own committed source builders."""

import argparse
import hashlib
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen

from build import prepare_shared_theme


ROOT = Path(__file__).resolve().parent
REPOSITORY = 'it-is-me-mario/database-explorer'
DEFAULT_URL = 'https://explorer.marioproject.com/'
LANDING = 'resources/data-explorer/scope.html'


def request_json(url):
    headers = {'User-Agent': 'MARIO-Explorer-channels'}
    token = os.environ.get('GH_TOKEN') or os.environ.get('GITHUB_TOKEN')
    if token and url.startswith('https://api.github.com/'):
        headers['Authorization'] = f'Bearer {token}'
    with urlopen(Request(url, headers=headers), timeout=60) as response:
        return json.load(response)


def git(*args, cwd=ROOT):
    return subprocess.check_output(['git', *args], cwd=cwd, text=True).strip()


def resolve_channels(latest_ref=None):
    definitions = json.loads((ROOT / 'versions.json').read_text())
    if set(definitions) != {'latest', 'dev', 'preview'}:
        raise ValueError('Configure the Latest, Dev and Preview source refs')
    plan = {'publisher_commit': git('rev-parse', 'HEAD'),
            'theme': json.loads((ROOT / 'shared-theme.json').read_text()), 'versions': {}}
    for channel in definitions:
        ref = latest_ref if channel == 'latest' and latest_ref else definitions[channel]['ref']
        revision = plan['publisher_commit'] if ref == 'HEAD' else request_json(
            f'https://api.github.com/repos/{REPOSITORY}/commits/{quote(ref, safe="")}')['sha']
        if not re.fullmatch(r'[0-9a-f]{40}', revision):
            raise ValueError('Source refs must resolve to full commit SHAs')
        plan['versions'][channel] = {'ref': ref, 'site_commit': revision}
        if 'theme' in definitions[channel]:
            plan['versions'][channel]['theme'] = definitions[channel]['theme']
    return plan


def updates_needed(plan, base_url):
    try:
        return request_json(base_url.rstrip('/') + '/versions-manifest.json') != plan
    except HTTPError as error:
        if error.code == 404:
            return True
        raise


def checkout_source(revision, destination):
    """Materialize committed files in an owned clone, including source Git metadata."""
    subprocess.run(['git', 'clone', '--quiet', '--shared', '--no-checkout', str(ROOT), str(destination)], check=True)
    git('remote', 'set-url', 'origin', f'https://github.com/{REPOSITORY}.git', cwd=destination)
    available = subprocess.run(['git', 'cat-file', '-e', revision + '^{commit}'], cwd=destination,
                               stderr=subprocess.DEVNULL).returncode == 0
    if not available:
        git('fetch', '--quiet', '--depth=1', 'origin', revision, cwd=destination)
    git('checkout', '--quiet', '--detach', revision, cwd=destination)


def add_frontend(snapshot, shared, theme=None):
    """Apply publisher-owned presentation around the selected source's application."""
    configuration = snapshot / 'doc/source/conf.py'
    with configuration.open('a') as stream:
        stream.write('\n# Shared channel navigation supplied by the publisher.\n')
        stream.write(f'sys.path.insert(0, {str(ROOT / "publishing")!r})\n')
        stream.write("extensions = [*extensions, 'explorer_versions']\n")
        stream.write(f'html_theme_path = [{str(shared / "_themes")!r}]\n')
        stream.write(f'html_static_path = [*html_static_path, {str(shared / "_static")!r}]\n')
        stream.write(f'templates_path = [{str(ROOT / "publishing/_templates")!r}]\n')
    # Existing source checkers compare this metadata to the published theme pin.
    if (snapshot / 'shared-theme.json').exists():
        (snapshot / 'shared-theme.json').write_text(json.dumps(
            theme or json.loads((ROOT / 'shared-theme.json').read_text())) + '\n')


def write_landing(output, base_url):
    target = base_url + LANDING
    (output / 'index.html').write_text(
        '<!doctype html><html lang="en"><head><meta charset="utf-8">'
        '<title>Classifications · MARIO Database Explorer</title>'
        '<link rel="canonical" href="' + target + '">'
        '<meta http-equiv="refresh" content="0;url=' + LANDING + '">'
        '<script>const target = new URL(' + json.dumps(LANDING) + ', location.href);'
        'target.search = location.search; target.hash = location.hash;'
        'location.replace(target.href);</script></head><body>'
        '<a href="' + LANDING + '">Open Classifications</a></body></html>')


def build_channel(channel, source, destination, plan, shared, base_url):
    with tempfile.TemporaryDirectory(prefix='explorer-source-', dir=ROOT / '_build') as folder:
        snapshot = Path(folder) / 'source'
        checkout_source(source['site_commit'], snapshot)
        theme = source.get('theme', plan['theme'])
        add_frontend(snapshot, shared, theme)
        url = base_url + (channel + '/' if channel != 'latest' else '')
        env = {**os.environ, 'EXPLORER_CHANNEL': channel, 'EXPLORER_SITE_ROOT': base_url,
               'EXPLORER_SOURCE_COMMIT': source['site_commit'], 'EXPLORER_BASEURL': url,
               'EXPLORER_SHARED_THEME_ROOT': str(shared)}
        subprocess.run([sys.executable, str(snapshot / 'build.py'), '--output', str(destination)],
                       cwd=snapshot, env=env, check=True)
        if channel != 'preview':
            write_landing(destination, url)
        manifest = {**source, 'channel': channel, 'publisher_commit': plan['publisher_commit'],
                    'theme': theme, 'landing': 'index.html' if channel == 'preview' else LANDING}
        (destination / 'site-build.json').write_text(json.dumps(manifest, indent=2) + '\n')
        subprocess.run([sys.executable, str(snapshot / 'check_site.py'), str(destination)],
                       cwd=snapshot, env=env, check=True)
        omit_unused_country_build_input(destination)


def omit_unused_country_build_input(destination):
    """Keep the native-set build input in source when the application never fetches it."""
    relative = Path('_static/data/economy/country-scope.json')
    asset = destination / relative
    if not asset.is_file():
        return
    references = [path for path in destination.rglob('*')
                  if path.suffix in {'.html', '.js'} and path.is_file()]
    if any(relative.name in path.read_text() for path in references):
        return
    payload = asset.read_bytes()
    manifest_path = destination / 'site-build.json'
    manifest = json.loads(manifest_path.read_text())
    manifest['omitted_build_inputs'] = [{
        'path': relative.as_posix(), 'bytes': len(payload),
        'sha256': hashlib.sha256(payload).hexdigest(),
    }]
    asset.unlink()
    manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')


class Anchors(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = []

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if 'id' in attributes:
            self.ids.append(attributes['id'])


def write_version_catalogue(output, plan, base_url):
    catalogue = {'versions': {}}
    for channel, source in plan['versions'].items():
        destination = output if channel == 'latest' else output / channel
        documents = {}
        for path in sorted(destination.rglob('*.html')):
            relative = path.relative_to(destination)
            if channel == 'latest' and relative.parts[0] in {'dev', 'preview'}:
                continue
            anchors = Anchors()
            anchors.feed(path.read_text())
            documents[relative.with_suffix('').as_posix()] = anchors.ids
        catalogue['versions'][channel] = {
            'url': base_url + (channel + '/' if channel != 'latest' else ''),
            'commit': source['site_commit'], 'documents': documents}
    payload = json.dumps(catalogue, separators=(',', ':')) + '\n'
    for channel in plan['versions']:
        destination = output if channel == 'latest' else output / channel
        (destination / '_static/docs-versions.json').write_text(payload)
    (output / 'docs-versions.json').write_text(payload)


def share_preview_data(output, plan, base_url):
    """Reuse the verified Dev payload only when every Preview data byte matches."""
    owner, preview = output / 'dev', output / 'preview'
    folders = [root / '_static/data' for root in (owner, preview)]
    inventories = [{path.relative_to(folder).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
                    for path in folder.rglob('*') if path.is_file()} for folder in folders]
    if inventories[0] != inventories[1]:
        raise ValueError('Preview and Dev data differ; update the preview source before sharing its payload')
    registries = [json.loads((root / '_static/json-assets.json').read_text())['assets']
                  for root in (owner, preview)]
    normalized = [{name: {key: item[key] for key in ('encoding', 'bytes', 'sha256', 'compressed_bytes')}
                   for name, item in registry.items()} for registry in registries]
    if normalized[0] != normalized[1]:
        raise ValueError('Preview and Dev logical data inventories differ')
    data_root = base_url + 'dev/'
    for path in preview.rglob('*.html'):
        content = path.read_text()
        content = re.sub(r'data-root="[^"]*"', 'data-root="' + data_root + '"', content)
        content = re.sub(r'((?:href|src)=")((?:\.\./)*_static/data/[^"]+)(")',
                         lambda match: match[1] + data_root + match[2].lstrip('./') + match[3], content)
        path.write_text(content)
    # Both source-specific checkers have already validated the full local copies.
    # The data owner and its matching bytes remain in this same Pages artifact.
    shutil.rmtree(folders[1])
    (preview / '_static/json-assets.json').unlink()
    manifest = json.loads((preview / 'site-build.json').read_text())
    manifest['shared_data'] = {'channel': 'dev', 'site_commit': plan['versions']['dev']['site_commit'],
                               'url': data_root, 'files': len(inventories[0]),
                               'inventory_sha256': hashlib.sha256(json.dumps(inventories[0], sort_keys=True).encode()).hexdigest()}
    (preview / 'site-build.json').write_text(json.dumps(manifest, indent=2) + '\n')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / '_site')
    parser.add_argument('--base-url', default=DEFAULT_URL)
    parser.add_argument('--latest-ref')
    parser.add_argument('--check-updates', action='store_true')
    args = parser.parse_args()
    plan = resolve_channels(args.latest_ref)
    if args.check_updates:
        changed = updates_needed(plan, args.base_url)
        print(f'changed={str(changed).lower()}')
        if os.environ.get('GITHUB_OUTPUT'):
            with Path(os.environ['GITHUB_OUTPUT']).open('a') as stream:
                stream.write(f'changed={str(changed).lower()}\n')
        return
    output = args.output.resolve()
    if ROOT.is_relative_to(output) or (output / '.git').exists() or output.name in {'_build', 'publishing'}:
        raise ValueError('The HTML output must be a dedicated build directory')
    if output.exists():
        shutil.rmtree(output)
    base_url = args.base_url.rstrip('/') + '/'
    for channel, source in plan['versions'].items():
        shared = prepare_shared_theme(source.get('theme', plan['theme']))
        destination = output if channel == 'latest' else output / channel
        build_channel(channel, plan['versions'][channel], destination, plan, shared, base_url)
    write_version_catalogue(output, plan, base_url)
    share_preview_data(output, plan, base_url)
    for folder in output.rglob('.doctrees'):
        shutil.rmtree(folder)
    (output / 'versions-manifest.json').write_text(json.dumps(plan, indent=2) + '\n')
    (output / '.nojekyll').touch()
    size = sum(path.stat().st_size for path in output.rglob('*') if path.is_file())
    if size > 1024 ** 3:
        raise ValueError(f'The combined Pages artifact exceeds 1 GB ({size:,} bytes)')
    print(f'Built Latest, Dev and Preview Explorer at {output}, {size:,} bytes')


if __name__ == '__main__':
    main()
