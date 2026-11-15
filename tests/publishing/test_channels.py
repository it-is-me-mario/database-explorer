"""Regressions for independent content snapshots and channel navigation."""

import json
import os
from pathlib import Path
import sys
from types import SimpleNamespace
from unittest.mock import patch

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
    assert api.call_count == 1


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
    for prefix, anchor in [('', 'stable'), ('dev/', 'experimental')]:
        folder = tmp_path / prefix
        (folder / '_static').mkdir(parents=True)
        (folder / 'index.html').write_text(f'<h1 id="{anchor}">Explorer</h1>')
    plan = {'versions': {'latest': {'site_commit': 'a' * 40}, 'dev': {'site_commit': 'b' * 40}}}
    publish.write_version_catalogue(tmp_path, plan, 'https://explorer.example/')
    versions = json.loads((tmp_path / 'docs-versions.json').read_text())['versions']
    assert versions['latest']['documents'] == {'index': ['stable']}
    assert versions['dev']['documents'] == {'index': ['experimental']}
    assert versions['dev']['url'] == 'https://explorer.example/dev/'
    assert (tmp_path / '_static/docs-versions.json').read_bytes() == \
        (tmp_path / 'dev/_static/docs-versions.json').read_bytes()


def test_dev_context_preserves_application_layout_and_links_same_channel():
    builder = SimpleNamespace(get_relative_uri=lambda page, target: '../../' + target + '.html')
    app = SimpleNamespace(builder=builder, env=SimpleNamespace(found_docs={'resources/data-explorer/scope'}))
    original = {'layout': 'plain', 'section_key': 'resources', 'tabs': ['source tab']}
    context = {'mario_page': original.copy()}
    env = {'EXPLORER_CHANNEL': 'dev', 'EXPLORER_SITE_ROOT': 'https://explorer.example/',
           'EXPLORER_SOURCE_COMMIT': 'b' * 40}
    with patch.dict(os.environ, env):
        explorer_versions.page_context(app, 'resources/data-explorer/scope', None, context, None)
    page = context['mario_page']
    assert all(page[key] == value for key, value in original.items())
    assert [section['key'] for section in page['nav']] == ['get_started', 'docs', 'explorer', 'resources']
    assert page['home_url'] == 'https://www.marioproject.com/en/dev/'
    assert page['nav'][-1]['url'] == 'https://tutorials.marioproject.com/dev/'
    assert len(page['nav'][2]['children']) == 1
    assert context['mario_versions']['source_url'].endswith('/database-explorer/tree/' + 'b' * 40)


def test_landing_retains_query_and_fragment(tmp_path):
    publish.write_landing(tmp_path, 'https://explorer.example/dev/')
    text = (tmp_path / 'index.html').read_text()
    assert 'target.search = location.search' in text
    assert 'target.hash = location.hash' in text
    assert 'https://explorer.example/dev/resources/data-explorer/scope.html' in text
