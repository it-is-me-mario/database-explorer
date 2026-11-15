"""Regressions for independent content snapshots and channel navigation."""

import json
import os
from pathlib import Path
import sys
from types import SimpleNamespace
from unittest.mock import patch

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / 'publishing'))
import publish
import explorer_versions


def test_resolve_channels_uses_commits_and_keeps_refs():
    with patch.object(publish, 'git', return_value='a' * 40), \
         patch.object(publish, 'request_json', return_value={'sha': 'b' * 40}) as api:
        plan = publish.resolve_channels(latest_ref='HEAD')
    assert plan['versions']['latest'] == {'ref': 'HEAD', 'site_commit': 'a' * 40}
    assert plan['versions']['dev'] == {'ref': 'feature/integrated-trade', 'site_commit': 'b' * 40}
    assert plan['versions']['preview']['ref'] == 'codex/visual-refresh'
    assert plan['versions']['preview']['theme'] != plan['theme']
    assert api.call_count == 2


def test_frontend_preserves_source_builder_and_application(tmp_path):
    configuration = tmp_path / 'doc/source/conf.py'
    configuration.parent.mkdir(parents=True)
    configuration.write_text('source_configuration = True\n')
    publish.add_frontend(tmp_path, Path('/shared-theme'))
    text = configuration.read_text()
    assert text.startswith('source_configuration = True\n')
    assert 'explorer_versions' in text
    assert not (tmp_path / 'build.py').exists()


def test_catalogue_separates_same_document_and_anchors(tmp_path):
    for prefix, anchor in [('', 'stable'), ('dev/', 'experimental'), ('preview/', 'design')]:
        folder = tmp_path / prefix
        (folder / '_static').mkdir(parents=True)
        (folder / 'index.html').write_text(f'<h1 id="{anchor}">Explorer</h1>')
    plan = {'versions': {'latest': {'site_commit': 'a' * 40}, 'dev': {'site_commit': 'b' * 40},
                         'preview': {'site_commit': 'c' * 40}}}
    publish.write_version_catalogue(tmp_path, plan, 'https://explorer.example/')
    versions = json.loads((tmp_path / 'docs-versions.json').read_text())['versions']
    assert versions['latest']['documents'] == {'index': ['stable']}
    assert versions['dev']['documents'] == {'index': ['experimental']}
    assert versions['dev']['url'] == 'https://explorer.example/dev/'
    assert versions['preview']['documents'] == {'index': ['design']}
    assert versions['preview']['url'] == 'https://explorer.example/preview/'
    assert (tmp_path / '_static/docs-versions.json').read_bytes() == \
        (tmp_path / 'dev/_static/docs-versions.json').read_bytes() == \
        (tmp_path / 'preview/_static/docs-versions.json').read_bytes()


@pytest.mark.parametrize(('channel', 'tab_names'), [
    ('dev', ('scope', 'compare', 'analyses')),
    ('latest', ('scope', 'compare', 'trade', 'analyses')),
    ('preview', ('compare', 'scope', 'analyses')),
])
def test_context_preserves_source_navigation_and_links_same_channel(channel, tab_names):
    builder = SimpleNamespace(get_relative_uri=lambda page, target: '../../' + target + '.html')
    labels = {'scope': 'Classifications', 'compare': 'Compare databases',
              'trade': 'Trade', 'analyses': 'Analyses'}
    section = {'landing': 'resources/data-explorer/scope', 'tabs': [
        {'label': labels[name], 'doc': 'resources/data-explorer/' + name} for name in tab_names
    ]}
    app = SimpleNamespace(builder=builder,
                          config=SimpleNamespace(mario_site={'sections': [section]}),
                          env=SimpleNamespace(found_docs={
                              'resources/data-explorer/' + name for name in labels
                          }))
    original = {'layout': 'plain', 'section_key': 'resources', 'tabs': ['source tab']}
    context = {'mario_page': original.copy()}
    env = {'EXPLORER_CHANNEL': channel, 'EXPLORER_SITE_ROOT': 'https://explorer.example/',
           'EXPLORER_SOURCE_COMMIT': 'b' * 40}
    with patch.dict(os.environ, env):
        explorer_versions.page_context(app, 'resources/data-explorer/scope', None, context, None)
    page = context['mario_page']
    assert all(page[key] == value for key, value in original.items())
    assert [section['key'] for section in page['nav']] == ['get_started', 'docs', 'explorer', 'resources']
    assert page['home_url'] == f'https://www.marioproject.com/en/{channel}/'
    assert page['nav'][-1]['url'] == 'https://tutorials.marioproject.com/' + (channel + '/' if channel != 'latest' else '')
    assert [item['key'] for item in context['mario_versions']['choices']] == ['latest', 'dev', 'preview']
    assert [link['label'] for link in page['nav'][2]['children']] == [labels[name] for name in tab_names]
    assert context['mario_versions']['source_url'].endswith('/database-explorer/tree/' + 'b' * 40)


def test_landing_retains_query_and_fragment(tmp_path):
    publish.write_landing(tmp_path, 'https://explorer.example/dev/')
    text = (tmp_path / 'index.html').read_text()
    assert 'target.search = location.search' in text
    assert 'target.hash = location.hash' in text
    assert 'https://explorer.example/dev/resources/data-explorer/scope.html' in text


def test_preview_shares_only_identical_verified_data(tmp_path):
    for channel in ('dev', 'preview'):
        root = tmp_path / channel
        (root / '_static/data').mkdir(parents=True)
        (root / '_static/data/values.json').write_text('{"value":42}')
        (root / '_static/json-assets.json').write_text('{"assets":{}}')
        (root / 'site-build.json').write_text('{}')
        (root / 'index.html').write_text('<div data-root="../../"></div><a href="_static/data/values.json">Data</a>')
    preview = tmp_path / 'preview'
    plan = {'versions': {'dev': {'site_commit': 'b' * 40}}}
    (preview / '_static/data/values.json').write_text('{"value":41}')
    with pytest.raises(ValueError, match='data differ'):
        publish.share_preview_data(tmp_path, plan, 'https://explorer.example/')
    assert (preview / '_static/data/values.json').exists()
    (preview / '_static/data/values.json').write_text('{"value":42}')
    publish.share_preview_data(tmp_path, plan, 'https://explorer.example/')
    assert not (preview / '_static/data').exists()
    assert (tmp_path / 'dev/_static/data/values.json').read_text() == '{"value":42}'
    assert 'data-root="https://explorer.example/dev/"' in (preview / 'index.html').read_text()
    assert 'href="https://explorer.example/dev/_static/data/values.json"' in (preview / 'index.html').read_text()
    assert json.loads((preview / 'site-build.json').read_text())['shared_data']['site_commit'] == 'b' * 40
