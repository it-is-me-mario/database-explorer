"""Small source-boundary and cache regressions; no private database inputs."""
import copy
import hashlib
import json
from pathlib import Path
import sys

import mario
import numpy as np
import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / 'doc/source/_static/reproduce'))
from pipelines import embodied_trade as collector

OPTIONS = {'solver': 'scipy', 'strategy': 'direct', 'refinement_steps': 0}


def sha(payload):
    return hashlib.sha256(payload).hexdigest()


def file_job(path, provenance=None, options=None):
    return {'id': 'fixture', 'path': path,
            'recipe': {'parser_options': options or {}},
            'original': {'provenance': provenance or {}}}


def test_directory_fingerprints_exclude_hidden_ancestors_and_deduplicate_companions(tmp_path):
    bundle = tmp_path / 'bundle'
    for name, payload in {'economic.csv': b'economic', 'satellite/E.csv': b'emissions',
                          '.hidden/readable.csv': b'private', 'satellite/.hidden/E.csv': b'private',
                          '.DS_Store': b'private', 'satellite/._E.csv': b'private'}.items():
        path = bundle / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(payload)
    job = file_job(bundle, options={'add_extensions': str(bundle / 'satellite/E.csv')})
    records = collector.fingerprint_inputs(job)
    assert [r['file'] for r in records] == ['economic.csv', 'satellite/E.csv']
    assert [r['sha256'] for r in records] == [sha(b'economic'), sha(b'emissions')]
    assert all(r['role'] == 'economic' for r in records)
    assert str(tmp_path) not in json.dumps(records)


@pytest.mark.parametrize('damage', ['source_sha256', 'member_sha256', 'size', 'published_md5', 'ambiguous'])
def test_frozen_hybrid_members_require_exact_hash_size_and_unique_identity(tmp_path, damage):
    payload = b'reviewed native source'
    source = tmp_path / 'technology.csv'
    source.write_bytes(payload)
    member = {'name': source.name, 'sha256': sha(payload), 'size': len(payload),
              'published_md5': 'md5:' + hashlib.md5(payload).hexdigest()}
    provenance = {'source_sha256': {source.name: sha(payload)},
                  'ghg_recharacterisation': {'source_members': [member]}}
    job = file_job(tmp_path, provenance, {'unit': 'Hybrid'})
    assert len(collector.fingerprint_inputs(job)) == 1
    if damage == 'source_sha256':
        provenance['source_sha256'][source.name] = sha(b'another technology')
    elif damage == 'member_sha256':
        member['sha256'] = sha(b'another extension')
    elif damage == 'size':
        member['size'] += 1
    elif damage == 'published_md5':
        member['published_md5'] = 'md5:' + '0' * 32
    else:
        duplicate = tmp_path / 'other' / source.name
        duplicate.parent.mkdir()
        duplicate.write_bytes(payload)
    with pytest.raises(ValueError, match='source member|source-member'):
        collector.fingerprint_inputs(job)


@pytest.mark.parametrize('extension_option', ['add_extensions', 'co2_path'])
def test_frozen_environmental_companion_is_checked_when_loaded(tmp_path, extension_option):
    source = tmp_path / 'economic.bin'
    companion = tmp_path / 'emissions.bin'
    source.write_bytes(b'economic')
    companion.write_bytes(b'reviewed emissions')
    provenance = {'input_filename': source.name, 'input_sha256': sha(source.read_bytes()),
                  'emissions': {'filename': companion.name, 'sha256': sha(companion.read_bytes())}}
    options = {extension_option: str(companion)}
    if extension_option == 'co2_path':
        options['load_co2'] = True
    job = file_job(source, provenance, options)
    assert len(collector.fingerprint_inputs(job)) == 2
    companion.write_bytes(b'another environmental vintage')
    with pytest.raises(ValueError, match='Environmental companion differs'):
        collector.fingerprint_inputs(job)


def test_cache_roundtrip_preserves_nested_signed_arrays_and_rejects_corruption(tmp_path):
    folder = tmp_path / 'cache'
    data = {'axis': [['CN', 'Sector', 'active'], ['IT', 'Sector', 'active']],
            'nested': {'values': np.array([[1., -2.], [0., 4.]]),
                       'parts': [np.array([3., -5.]), {'label': 'observed'}]}}
    collector.save_cache(folder, data, {'cache_schema_version': 1})
    loaded = collector.read_cache(folder)
    np.testing.assert_array_equal(loaded['nested']['values'], data['nested']['values'])
    np.testing.assert_array_equal(loaded['nested']['parts'][0], data['nested']['parts'][0])
    assert loaded['axis'] == data['axis']
    assert loaded['nested']['parts'][1] == {'label': 'observed'}
    loaded['nested']['values'][0, 0] = 999
    assert collector.read_cache(folder)['nested']['values'][0, 0] == 1
    with (folder / 'arrays.npz').open('ab') as stream:
        stream.write(b'corruption')
    with pytest.raises(ValueError, match='cache checksum differs'):
        collector.read_cache(folder)


def test_cache_identity_tracks_parser_code_inputs_and_solver_but_not_local_paths(tmp_path, monkeypatch):
    recipe_root = tmp_path / 'recipes'
    helper = recipe_root / 'indicators/public_accounts.py'
    helper.parent.mkdir(parents=True)
    helper.write_text('helper version one\n')
    adapter = recipe_root / 'databases/source.py'
    adapter.parent.mkdir()
    adapter.write_text('parser version one\n')
    monkeypatch.setattr(collector.api, '__file__', str(helper))
    job = file_job(tmp_path, options={'co2_path': '/first/location', 'load_co2': True})
    inputs = [{'file': 'native.csv', 'bytes': 4, 'sha256': sha(b'data')}]
    key, identity = collector.cache_identity(job, inputs, OPTIONS)
    relocated = copy.deepcopy(job)
    relocated['recipe']['parser_options']['co2_path'] = '/second/location'
    assert collector.cache_identity(relocated, inputs, OPTIONS)[0] == key
    assert collector.cache_identity(job, inputs, {**OPTIONS, 'strategy': 'iterative'})[0] != key
    assert collector.cache_identity(job, [{**inputs[0], 'sha256': sha(b'new data')}], OPTIONS)[0] != key
    adapter.write_text('parser version two\n')
    changed_key, changed_identity = collector.cache_identity(job, inputs, OPTIONS)
    assert changed_key != key
    assert changed_identity['helper_sha256'] == identity['helper_sha256']
    assert changed_identity['recipe_tree_sha256'] != identity['recipe_tree_sha256']
    assert len(identity['producer_sha256']) == 64


def tiny_database():
    regions = ['CN', 'IT']
    axis = pd.MultiIndex.from_product([regions, ['Sector'], ['active']], names=['Region', 'Level', 'Item'])
    final = pd.MultiIndex.from_product([regions, ['Consumption category'], ['household']], names=axis.names)
    units = {group: pd.DataFrame({'unit': [unit]}, index=[item]) for group, item, unit in
             [('Sector', 'active', 'USD'), ('Factor of production', 'VA', 'USD'), ('Satellite account', 'CO2', 't')]}
    return mario.Database(table='IOT',
        Z=pd.DataFrame([[20., 30.], [40., 20.]], index=axis, columns=axis),
        Y=pd.DataFrame([[50., 0.], [10., 130.]], index=axis, columns=final),
        V=pd.DataFrame([[40., 150.]], index=['VA'], columns=axis),
        E=pd.DataFrame([[10., 30.]], index=['CO2'], columns=axis),
        EY=pd.DataFrame([[1., 2.]], index=['CO2'], columns=final), units=units, calc_all=False)


@pytest.fixture
def source_job(tmp_path, monkeypatch):
    path = tmp_path / 'reviewed-source.bin'
    path.write_bytes(b'exact source fixture')
    regions = [{'label': r, 'name': r, 'kind': 'country', 'iso3': r} for r in ['CN', 'IT']]
    recipe = {'id': 'fixture', 'source': 'EXIOBASE', 'release': 'fixture', 'year': 2022,
              'table': 'IOT', 'currency': 'USD', 'currency_scale': 1., 'parser_options': {},
              'regions': regions, 'value_added_rows': ['VA'], 'ghg_factors': {'CO2': 1.},
              'final_demand_emissions_loaded': True}
    original = {'recipe': copy.deepcopy(recipe),
                'regions': [{'code': 'CN', 'value_added': [40.], 'ghg': [10.], 'household_ghg': 1.},
                            {'code': 'IT', 'value_added': [150.], 'ghg': [30.], 'household_ghg': 2.}],
                'provenance': {'input_filename': path.name, 'input_sha256': sha(path.read_bytes())}}
    monkeypatch.setattr(collector, 'CACHE', tmp_path / 'cache')
    monkeypatch.setattr(collector, 'load_database', lambda recipe, source: tiny_database())
    return {'id': 'fixture', 'path': path, 'recipe': recipe, 'original': original}


def alter_reference(job, field):
    row = job['original']['regions'][1]
    if field == 'household_ghg':
        row[field] += 1
    else:
        row[field][0] += 1


@pytest.mark.parametrize('field', ['value_added', 'ghg', 'household_ghg'])
def test_fresh_solve_rejects_changed_frozen_production_before_caching(source_job, field):
    alter_reference(source_job, field)
    with pytest.raises(AssertionError, match='frozen production'):
        collector.solve_source(source_job, OPTIONS)
    assert not list(collector.CACHE.rglob('metadata.json'))


@pytest.mark.parametrize('field', ['value_added', 'ghg', 'household_ghg'])
def test_cached_solve_rechecks_each_frozen_production_reference(source_job, field, monkeypatch):
    data, identity = collector.solve_source(source_job, OPTIONS)
    assert set(data['results']) == {'value_added_footprint', 'ghg_footprint'}
    def unexpected_parse(*args, **kwargs):
        pytest.fail('A valid cache should not parse the source again')
    monkeypatch.setattr(collector, 'load_database', unexpected_parse)
    cached, cached_identity = collector.solve_source(source_job, OPTIONS)
    assert cached_identity == identity
    np.testing.assert_array_equal(cached['multipliers'], data['multipliers'])
    alter_reference(source_job, field)
    with pytest.raises(AssertionError, match='frozen production'):
        collector.solve_source(source_job, OPTIONS)


def test_totals_publication_needs_no_mapping_and_keeps_proofs_and_source_hashes(source_job, tmp_path, monkeypatch):
    data, identity = collector.solve_source(source_job, OPTIONS)
    monkeypatch.setattr(collector, 'MAPPING', tmp_path / 'unreviewed-mapping-does-not-exist.json')
    monkeypatch.setattr(collector, 'OUTPUT', tmp_path / 'published')
    result = collector.publish_result(source_job, data, identity, include_sectors=False)
    assert result['sector_files'] == result['sector_groups'] == {}
    assert {'value_added_trade', 'ghg_trade'} <= set(result['metrics'])
    assert set(result['provenance']['footprint_boundaries']) == set(data['results'])
    assert result['provenance']['inputs'][0]['sha256'] == sha(b'exact source fixture')
    assert str(tmp_path) not in json.dumps(collector.serialise(result))
    np.testing.assert_allclose(result['value_added_trade']['total']['final'], [[50, 0], [10, 130]])
    manifest = json.loads((collector.OUTPUT / 'manifest.json').read_text())
    assert [row['id'] for row in manifest['readings']] == ['fixture']


@pytest.mark.parametrize('cache_only', [False, True])
@pytest.mark.parametrize('complete', [False, True])
def test_required_metric_failure_remains_unresolved_after_partial_success(tmp_path, monkeypatch, capsys, cache_only, complete):
    job = {'id': 'fixture', 'recipe': {'source': 'fixture'}}
    results = {'value_added_footprint': {'passed': True}}
    if complete:
        results['ghg_footprint'] = {'passed': True}
    data = {'results': results, 'errors': {} if complete else {'ghg_footprint': 'source extension missing'}}
    published = []
    monkeypatch.setattr(collector, 'SCOPE', tmp_path / 'scope.json')
    monkeypatch.setattr(collector, 'CACHE', tmp_path / 'cache')
    monkeypatch.setattr(collector, 'current_scope', lambda: {'readings': [
        {'id': 'fixture', 'required_metrics': ['value_added_trade', 'ghg_trade']}]})
    monkeypatch.setattr(collector, 'source_jobs', lambda source: [job])
    monkeypatch.setattr(collector, 'solve_source', lambda job, options: (data, {'inputs': []}))
    monkeypatch.setattr(collector, 'publish_result', lambda job, result, identity, **kwargs: published.append(result))
    error_file = collector.CACHE / 'fixture-error.json'
    error_file.parent.mkdir()
    error_file.write_text(json.dumps({'id': 'fixture', 'error': 'stale previous failure'}))
    monkeypatch.setattr(sys, 'argv', ['embodied_trade', '--source-root', str(tmp_path), *(['--cache-only'] if cache_only else [])])
    if complete:
        collector.main()
    else:
        with pytest.raises(SystemExit) as error:
            collector.main()
        assert error.value.code == 1
    output = capsys.readouterr().out
    assert ('UNRESOLVED METRICS fixture ghg_trade' in output) is not complete
    assert f'COLLECTION FINISHED {0 if complete else 1} unresolved sources' in output
    assert published == ([] if cache_only else [data])
    if complete:
        assert not error_file.exists()
    else:
        error_record = json.loads(error_file.read_text())
        assert error_record['missing_required_metrics'] == ['ghg_trade']
        assert error_record['source_errors'] == data['errors']


@pytest.mark.parametrize('damage', ['changed_archive', 'directory'])
def test_matching_exiobase_iot_archive_must_match_its_frozen_companion_checksum(tmp_path, damage):
    source = tmp_path / 'MRSUT_2022.zip'
    companion = tmp_path / 'IOT_2022_ixi.zip'
    source.write_bytes(b'reviewed SUT archive')
    companion.write_bytes(b'reviewed same-year IOT archive')
    provenance = {
        'archive_checksum': 'md5:' + hashlib.md5(source.read_bytes()).hexdigest(),
        'matched_iot': {'id': 'matching-iot', 'source_provenance': {
            'archive_checksum': 'md5:' + hashlib.md5(companion.read_bytes()).hexdigest()}}}
    job = file_job(source, provenance, {'unit': 'Monetary', 'add_extensions': str(companion)})
    assert len(collector.fingerprint_inputs(job)) == 2
    if damage == 'changed_archive':
        companion.write_bytes(b'another matching-year vintage')
    else:
        directory = tmp_path / 'unpacked-companion'
        directory.mkdir()
        (directory / 'F.txt').write_bytes(b'cannot prove an archive checksum')
        job['recipe']['parser_options']['add_extensions'] = str(directory)
    with pytest.raises(ValueError, match='checksum|companion|matching|Matched'):
        collector.fingerprint_inputs(job)


@pytest.fixture
def coverage_publication(tmp_path):
    output = tmp_path / 'published'
    output.mkdir()
    required = {'first': ['value_added_trade', 'ghg_trade'], 'second': ['value_added_trade']}
    scope = {'readings': [{'id': key, 'required_metrics': metrics, 'sector_phase': 'latest'}
                          for key, metrics in required.items()],
             'deferred': [{'source': 'EXIOBASE REX3', 'reason': 'Explicitly deferred'}],
             'policy': 'Observed latest readings only'}
    manifest = {'readings': []}
    for identifier, metrics in required.items():
        fields = {metric: {'intermediate': [[0]], 'final': [[0]]} for metric in metrics}
        files = {'A': identifier + '--a.json'}
        data = {'id': identifier, 'metrics': metrics, **fields,
                'sector_groups': {'A': ['native agriculture']}, 'sector_files': files}
        (output / (identifier + '.json')).write_text(json.dumps(data))
        (output / files['A']).write_text(json.dumps({'id': identifier, 'section': 'A', **fields}))
        manifest['readings'].append({'id': identifier, 'file': identifier + '.json',
                                     'metrics': metrics, 'sector_files': files})
    (output / 'manifest.json').write_text(json.dumps(manifest))
    return scope, output


def test_coverage_counts_only_required_observations_and_preserves_explicit_deferrals(coverage_publication):
    scope, output = coverage_publication
    manifest_path = output / 'manifest.json'
    manifest = json.loads(manifest_path.read_text())
    manifest['readings'].append({'id': 'older-extra', 'file': 'older-extra.json', 'metrics': []})
    manifest_path.write_text(json.dumps(manifest))
    result = collector.audit_coverage(scope, output)
    assert result['total_complete'] and result['sector_complete']
    assert result['required_readings'] == result['complete_total_readings'] == result['complete_sector_readings'] == 2
    assert result['published_required_metrics'] == result['required_metrics'] == {'value_added_trade': 2, 'ghg_trade': 1}
    assert result['extra_published_readings'] == ['older-extra']
    assert result['deferred'] == scope['deferred']
    assert 'Coverage only' in result['validation_boundary']


@pytest.mark.parametrize('damage', ['missing_reading', 'missing_total', 'identity', 'manifest_metric', 'total_metric', 'payload'])
def test_coverage_requires_a_real_matching_total_and_each_required_metric(coverage_publication, damage):
    scope, output = coverage_publication
    manifest_path = output / 'manifest.json'
    manifest = json.loads(manifest_path.read_text())
    total_path = output / 'first.json'
    data = json.loads(total_path.read_text())
    if damage == 'missing_reading':
        manifest['readings'] = manifest['readings'][1:]
    elif damage == 'missing_total':
        total_path.unlink()
    elif damage == 'identity':
        data['id'] = 'another-reading'
    elif damage == 'manifest_metric':
        manifest['readings'][0]['metrics'].remove('ghg_trade')
    elif damage == 'total_metric':
        data['metrics'].remove('ghg_trade')
    else:
        del data['ghg_trade']
    manifest_path.write_text(json.dumps(manifest))
    if damage != 'missing_total':
        total_path.write_text(json.dumps(data))
    result = collector.audit_coverage(scope, output)
    assert not result['total_complete'] and not result['sector_complete']
    assert result['complete_total_readings'] == 1
    first = next(row for row in result['readings'] if row['id'] == 'first')
    assert 'ghg_trade' in first['missing_metrics']
    assert result['published_required_metrics'].get('ghg_trade', 0) == 0


@pytest.mark.parametrize('damage', ['no_groups', 'references', 'manifest_reference', 'missing_shard', 'identity', 'section', 'metric'])
def test_sector_coverage_requires_matching_groups_files_and_shard_metrics(coverage_publication, damage):
    scope, output = coverage_publication
    total_path = output / 'first.json'
    data = json.loads(total_path.read_text())
    manifest_path = output / 'manifest.json'
    manifest = json.loads(manifest_path.read_text())
    shard_path = output / 'first--a.json'
    shard = json.loads(shard_path.read_text())
    if damage == 'no_groups':
        data['sector_groups'] = {}; data['sector_files'] = {}
        manifest['readings'][0]['sector_files'] = {}
    elif damage == 'references':
        data['sector_groups']['B'] = ['native mining']
    elif damage == 'manifest_reference':
        manifest['readings'][0]['sector_files'] = {'A': 'different.json'}
    elif damage == 'missing_shard':
        shard_path.unlink()
    elif damage == 'identity':
        shard['id'] = 'another-reading'
    elif damage == 'section':
        shard['section'] = 'B'
    else:
        del shard['ghg_trade']
    total_path.write_text(json.dumps(data))
    manifest_path.write_text(json.dumps(manifest))
    if damage != 'missing_shard':
        shard_path.write_text(json.dumps(shard))
    result = collector.audit_coverage(scope, output)
    assert result['total_complete'] and not result['sector_complete']
    assert result['complete_total_readings'] == 2 and result['complete_sector_readings'] == 1
    assert result['readings'][0]['sector_issues']


def test_duplicate_manifest_identity_prevents_complete_coverage(coverage_publication):
    scope, output = coverage_publication
    manifest_path = output / 'manifest.json'
    manifest = json.loads(manifest_path.read_text())
    manifest['readings'].append(copy.deepcopy(manifest['readings'][0]))
    manifest_path.write_text(json.dumps(manifest))
    result = collector.audit_coverage(scope, output)
    assert not result['total_complete'] and not result['sector_complete']
    assert result['manifest_issues'] == [{'id': 'first', 'reason': 'Duplicate manifest reading'}]


@pytest.mark.parametrize('require_sectors', [False, True])
def test_audit_cli_is_read_only_without_native_source_or_pinned_runtime(coverage_publication, tmp_path, monkeypatch, capsys, require_sectors):
    scope, output = coverage_publication
    # Totals exist, but one missing sector shard distinguishes the two exit policies.
    (output / 'first--a.json').unlink()
    scope_path = tmp_path / 'scope.json'
    scope_path.write_text(json.dumps(scope))
    monkeypatch.setattr(collector, 'SCOPE', scope_path)
    monkeypatch.setattr(collector, 'OUTPUT', output)
    def forbidden(*args, **kwargs):
        pytest.fail('Coverage audit must not collect, fingerprint or mutate files')
    for name in ['current_scope', 'source_jobs', 'fingerprint_inputs', 'solve_source', 'load_database', 'write']:
        monkeypatch.setattr(collector, name, forbidden)
    monkeypatch.setattr(mario, '__version__', 'unrelated-audit-environment')
    monkeypatch.setattr(sys, 'argv', ['embodied_trade', '--audit', *(['--require-sectors'] if require_sectors else [])])
    def snapshot():
        return {str(p.relative_to(tmp_path)): (p.read_bytes(), p.stat().st_mtime_ns)
                for p in tmp_path.rglob('*') if p.is_file()}
    before = snapshot()
    if require_sectors:
        with pytest.raises(SystemExit) as error:
            collector.main()
        assert error.value.code == 1
    else:
        collector.main()
    result = json.loads(capsys.readouterr().out)
    assert result['total_complete'] and not result['sector_complete']
    assert snapshot() == before


def test_emerging_publication_keeps_exact_companion_filename_without_private_path(source_job, tmp_path, monkeypatch):
    data, identity = collector.solve_source(source_job, OPTIONS)
    source_job['recipe']['source'] = 'EMERGING'
    source_job['original']['recipe']['source'] = 'EMERGING'
    source_job['recipe']['parser_options'] = {'load_co2': True, 'co2_path': str(tmp_path / 'private/EMERGING_CO2_2022.mat')}
    monkeypatch.setattr(collector, 'OUTPUT', tmp_path / 'published')
    result = collector.publish_result(source_job, data, identity, include_sectors=False)
    assert result['recipe']['parser_options'] == {'load_co2': True, 'co2_path': '/path/to/EMERGING_CO2_2022.mat'}
    assert str(tmp_path) not in json.dumps(collector.serialise(result))
    assert source_job['original']['recipe']['parser_options'] == {}


@pytest.mark.parametrize('damage', ['changed', 'size', 'missing', 'ambiguous'])
def test_structured_multiinput_pins_take_precedence_over_composite_summary(tmp_path, damage):
    supply = tmp_path / 'supply.csv'; supply.write_bytes(b'reviewed supply')
    use = tmp_path / 'use.csv'; use.write_bytes(b'reviewed use')
    members = [{'filename': p.name, 'sha256': sha(p.read_bytes()), 'bytes': p.stat().st_size}
               for p in [supply, use]]
    provenance = {'input_filename': 'supply.csv + use.csv',
                  'input_sha256': members[0]['sha256'] + ' + ' + members[1]['sha256'],
                  'source_files': members}
    job = file_job(tmp_path, provenance)
    records = collector.fingerprint_inputs(job)
    from pipelines.recorded_inputs import validate_recorded_inputs
    validate_recorded_inputs(job, records)
    assert len(records) == 2
    if damage == 'changed':
        use.write_bytes(b'changed use vintage')
    elif damage == 'size':
        members[1]['bytes'] += 1
    elif damage == 'missing':
        use.unlink()
    else:
        duplicate = tmp_path / 'duplicate/use.csv'; duplicate.parent.mkdir()
        duplicate.write_bytes(use.read_bytes())
    with pytest.raises(ValueError, match='Economic source member differs'):
        collector.fingerprint_inputs(job)


def recorded_pin_fixture():
    source = b'economic archive'; companion = b'extension archive'
    records = [{'role': role, 'file': name, 'bytes': len(payload), 'sha256': sha(payload),
                'md5': hashlib.md5(payload).hexdigest()}
               for role, name, payload in [('economic', 'economic.zip', source),
                                            ('add_extensions', 'extension.zip', companion)]]
    provenance = {'input_filename': 'economic.zip', 'input_sha256': sha(source),
                  'archive_checksum': 'md5:' + records[0]['md5'],
                  'emissions': {'filename': 'extension.zip', 'sha256': sha(companion)},
                  'matched_iot': {'source_provenance': {'archive_checksum': 'md5:' + records[1]['md5']}},
                  'source_sha256': {'economic.zip': sha(source)},
                  'ghg_recharacterisation': {'source_members': [
                      {'name': 'extension.zip', 'sha256': sha(companion), 'size': len(companion),
                       'published_md5': 'md5:' + records[1]['md5']}]}}
    job = file_job('/unmounted/economic.zip', provenance,
                   {'unit': 'Hybrid', 'load_co2': True, 'add_extensions': '/unmounted/extension.zip'})
    return job, records


def test_recorded_pin_validation_performs_no_filesystem_access(monkeypatch):
    from pipelines.recorded_inputs import validate_recorded_inputs
    job, records = recorded_pin_fixture()
    def forbidden(*args, **kwargs):
        pytest.fail('Recorded source validation must not access a native filesystem path')
    with monkeypatch.context() as patched:
        for name in ['open', 'exists', 'is_file', 'stat', 'rglob']:
            patched.setattr(Path, name, forbidden)
        validate_recorded_inputs(job, records)


@pytest.mark.parametrize('damage', ['input', 'emissions', 'primary_archive', 'matching_archive',
                                   'hybrid_sha', 'hybrid_member', 'hybrid_size', 'hybrid_md5',
                                   'missing', 'ambiguous', 'malformed'])
def test_recorded_receipts_must_satisfy_every_current_frozen_pin(damage):
    from pipelines.recorded_inputs import validate_recorded_inputs
    job, records = recorded_pin_fixture(); provenance = job['original']['provenance']
    validate_recorded_inputs(job, records)
    member = provenance['ghg_recharacterisation']['source_members'][0]
    if damage == 'input': provenance['input_sha256'] = '0' * 64
    elif damage == 'emissions': provenance['emissions']['sha256'] = '0' * 64
    elif damage == 'primary_archive': provenance['archive_checksum'] = 'md5:' + '0' * 32
    elif damage == 'matching_archive': provenance['matched_iot']['source_provenance']['archive_checksum'] = 'md5:' + '0' * 32
    elif damage == 'hybrid_sha': provenance['source_sha256']['economic.zip'] = '0' * 64
    elif damage == 'hybrid_member': member['sha256'] = '0' * 64
    elif damage == 'hybrid_size': member['size'] += 1
    elif damage == 'hybrid_md5': member['published_md5'] = 'md5:' + '0' * 32
    elif damage == 'missing': records.pop()
    elif damage == 'ambiguous': records.append({**records[1], 'role': 'another_companion'})
    else: records[0]['sha256'] = None
    with pytest.raises(ValueError):
        validate_recorded_inputs(job, records)


def test_private_cache_replay_succeeds_after_source_removal_without_parsing(source_job, monkeypatch):
    original, identity = collector.solve_source(source_job, OPTIONS)
    source_job['path'].unlink()
    def forbidden(*args, **kwargs):
        pytest.fail('Private cache replay must not parse native inputs')
    monkeypatch.setattr(collector, 'load_database', forbidden)
    replayed, replay_identity = collector.load_cached_source(source_job, OPTIONS)
    assert replay_identity == identity
    np.testing.assert_array_equal(replayed['multipliers'], original['multipliers'])
    assert replayed['inputs'] == original['inputs']


@pytest.mark.parametrize('damage', ['array', 'producer', 'pin', 'result_inputs', 'compute', 'production'])
def test_private_cache_replay_rejects_corruption_stale_identity_and_changed_references(source_job, damage):
    collector.solve_source(source_job, OPTIONS)
    metadata_path = next(collector.CACHE.rglob('metadata.json'))
    metadata = json.loads(metadata_path.read_text())
    pattern = {'array': 'cache checksum', 'producer': 'exact-current private cache',
               'pin': 'frozen production fingerprint', 'result_inputs': 'differs from its identity',
               'compute': 'differs from its identity', 'production': 'frozen production'}[damage]
    if damage == 'array':
        with (metadata_path.parent / 'arrays.npz').open('ab') as stream: stream.write(b'corruption')
    elif damage == 'producer':
        metadata['identity']['producer_sha256'] = '0' * 64
    elif damage == 'pin':
        source_job['original']['provenance']['input_sha256'] = '0' * 64
    elif damage == 'result_inputs':
        metadata['data']['inputs'][0]['sha256'] = '0' * 64
    elif damage == 'compute':
        metadata['data']['compute']['strategy'] = 'iterative'
    else:
        alter_reference(source_job, 'ghg')
    metadata_path.write_text(json.dumps(metadata))
    source_job['path'].unlink()
    with pytest.raises((ValueError, AssertionError), match=pattern):
        collector.load_cached_source(source_job, OPTIONS)


def test_publish_cached_cli_uses_verified_cache_without_sources(source_job, tmp_path, monkeypatch, capsys):
    collector.solve_source(source_job, OPTIONS)
    source_job['path'].unlink()
    inventory = tmp_path / 'inventory.json'
    inventory.write_text(json.dumps([{**source_job, 'path': str(source_job['path'])}]))
    monkeypatch.setattr(collector, 'SCOPE', tmp_path / 'scope.json')
    monkeypatch.setattr(collector, 'OUTPUT', tmp_path / 'published')
    monkeypatch.setattr(collector, 'MAPPING', tmp_path / 'no-mapping.json')
    monkeypatch.setattr(collector, 'current_scope', lambda: {'readings': [
        {'id': 'fixture', 'required_metrics': ['value_added_trade', 'ghg_trade']}]})
    def forbidden(*args, **kwargs):
        pytest.fail('Cached publication must not parse native inputs')
    monkeypatch.setattr(collector, 'load_database', forbidden)
    monkeypatch.setattr(sys, 'argv', ['embodied_trade', '--inventory', str(inventory), '--publish-cached', '--totals-only'])
    collector.main()
    published = json.loads((collector.OUTPUT / 'fixture.json').read_text())
    assert published['provenance']['publication_mode'] == 'verified_private_cache_no_raw_access'
    assert {'value_added_trade', 'ghg_trade'} <= set(published['metrics'])
    assert 'REPLAY VERIFIED PRIVATE CACHE fixture' in capsys.readouterr().out


def test_approved_adb_history_adds_only_observed_62_and_72_economy_readings():
    scope=collector.current_scope();historical=[r for r in scope['readings'] if r['sector_phase'].startswith('ADB historical series')]
    expected={f'adb-{year}-{size}-economies' for year in range(2017,2023) for size in (62,72)}
    assert {r['id'] for r in historical}==expected
    assert all(set(r['required_metrics'])=={'value_added_trade','ghg_trade'} for r in historical)
    assert len({r['id'] for r in scope['readings']})==len(scope['readings'])==214
    assert any(r['source']=='EXIOBASE REX3' for r in scope['deferred'])
    assert all('REX3' not in r['id'] for r in historical)


def test_approved_upstream_scope_rejects_unknown_metrics(tmp_path,monkeypatch):
    (tmp_path/'doc').mkdir()
    (tmp_path/'doc/account-collection-scope.json').write_text(json.dumps({'readings':[{'id':'fixture','metrics':[],'upstream_metrics':['unsupported']}] }))
    monkeypatch.setattr(collector,'ROOT',tmp_path)
    with pytest.raises(ValueError,match='Unknown approved upstream metric'):collector.current_scope()


def test_approved_emerging_history_uses_observed_benchmarks_without_annual_fill():
    scope=collector.current_scope();rows=[r for r in scope['readings'] if r['sector_phase'].startswith('EMERGING 2.2 observed')]
    assert {r['id'] for r in rows}=={'emerging-22-2015','emerging-22-2018','emerging-22-2021'}
    assert all(set(r['required_metrics'])=={'value_added_trade','ghg_trade'} for r in rows)
    assert len({r['id'] for r in scope['readings']})==214


def test_published_upstream_inventory_completes_the_approved_scope():
    scope=collector.current_scope()
    assert json.loads(collector.SCOPE.read_text())==scope
    report=collector.audit_coverage(scope)
    assert report['sector_complete'],{
        'manifest_issues':report['manifest_issues'],
        'incomplete':[row for row in report['readings'] if not row['sector_complete']],
    }


def test_approved_exiobase_history_covers_both_native_iot_systems():
    scope = collector.current_scope()
    historical = [row for row in scope['readings']
                  if row['sector_phase'].startswith('EXIOBASE 3.11.2 historical series')]
    expected = {f'exiobase-3112-{year}-{system}'
                for year in range(1995, 2024) for system in ('ixi', 'pxp')}
    assert {row['id'] for row in historical} == expected
    assert all(set(row['required_metrics']) == {'value_added_trade', 'ghg_trade'}
               for row in historical)
    assert len(scope['readings']) == len({row['id'] for row in scope['readings']}) == 214


@pytest.mark.parametrize('source,expected', [
    ('FIGARO', {f'figaro-{year}-{system}' for year in range(2010, 2024)
                for system in ('ixi', 'pxp', 'sut')}),
    ('OECD', {f'oecd-icio-{year}-regular' for year in range(1995, 2022)}),
    ('WIOD', {f'wiod-2016-{year}-{system}' for year in range(2000, 2014)
              for system in ('iot-current', 'sut')}),
    ('ADB', {f'adb-{year}-62-economies' for year in [2000, *range(2007, 2017)]}
            | {f'adb-{year}-71-economies' for year in (2007, 2011)}),
])
def test_approved_four_family_histories_retain_observed_years_and_native_editions(source, expected):
    scope = collector.current_scope()
    rows = [row for row in scope['readings']
            if row['sector_phase'].startswith(source + ' approved historical series;')]
    assert {row['id'] for row in rows} == expected
    assert all(row['required_metrics'] == ['value_added_trade'] for row in rows)
    assert len(scope['readings']) == len({row['id'] for row in scope['readings']}) == 214
