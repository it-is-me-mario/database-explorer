"""Bounded implicit-input closure tests; no native matrices or solver jobs."""
import copy
import hashlib
from pathlib import Path
from types import SimpleNamespace
import sys
import zipfile

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / 'doc/source/_static/reproduce'))
from pipelines import input_layout as guard
from mario.parsers import emerging, gloria

BUILTIN = 'released MARIO 1.3.4 built-in emerging_e_sectors.yaml'


def sha(value):
    return hashlib.sha256(value).hexdigest()


def make_em(tmp_path, monkeypatch, *, variant='standard', labels=False):
    root = tmp_path / 'bundle'
    root.mkdir()
    bindings = {'economic': 'economic.mat', 'co2': 'co2.mat'}
    options = {'variant': variant, 'year': 2018, 'load_co2': True,
               'co2_path': str(root / 'co2.mat')}
    provenance = {}
    if variant == 'E':
        bindings['figure'] = 'Figure data.xlsx'
        provenance['label_verification'] = {'regional_labels': {'local_sha256': sha(b'figure')}}
    if labels:
        bindings['labels'] = 'labels.xlsx'
        options['labels_path'] = str(root / 'labels.xlsx')
        provenance['source_files'] = [{'filename': 'labels.xlsx', 'sha256': sha(b'labels')}]
    layout = {'kind': 'isolated_directory', 'bindings': bindings,
              'files': [{'name': name} for name in bindings.values()],
              'absent_roles': sorted({'labels', 'figure'} - set(bindings))}
    if variant == 'E' and not labels:
        layout['sector_labels_source'] = BUILTIN
    for role, name in bindings.items():
        (root / name).write_bytes(role.encode())
    job = {'id': 'fixture', 'path': root,
           'recipe': {'source': 'EMERGING', 'parser_options': options, 'input_layout': layout},
           'original': {'provenance': provenance}}
    selected = SimpleNamespace(data_path=root / bindings['economic'],
                               co2_path=root / bindings['co2'],
                               labels_path=root / bindings['labels'] if labels else None,
                               figure_data_path=root / bindings['figure'] if variant == 'E' else None)
    calls = []
    def detect(path, **kwargs):
        calls.append((path, kwargs))
        return selected
    monkeypatch.setattr(emerging, 'detect_emerging_layout', detect)
    return job, selected, calls


def inventory(path):
    with zipfile.ZipFile(path) as archive:
        return [{'name': item.filename, 'size': item.file_size, 'compressed': item.compress_size,
                 'crc32': f'{item.CRC:08x}'} for item in archive.infolist() if not item.is_dir()]


def make_gloria(tmp_path, monkeypatch):
    root = tmp_path / 'bundle'
    root.mkdir()
    bindings = {'economic': 'economic.zip', 'readme': 'readme.xlsx', 'satellites': 'satellite.zip'}
    for role, members in [('economic', ['T.csv', 'Y.csv', 'V.csv']),
                          ('satellites', ['TQ.csv', 'YQ.csv'])]:
        with zipfile.ZipFile(root / bindings[role], 'w') as archive:
            for name in members:
                archive.writestr(name, role + ':' + name)
    (root / bindings['readme']).write_bytes(b'readme')
    provenance = {'readme_sha256': sha(b'readme'),
                  'economic_members': inventory(root / bindings['economic']),
                  'satellite_members': inventory(root / bindings['satellites'])}
    layout = {'kind': 'isolated_directory', 'bindings': bindings,
              'files': [{'name': name} for name in bindings.values()],
              'archive_members': {'economic': copy.deepcopy(provenance['economic_members']),
                                  'satellites': copy.deepcopy(provenance['satellite_members'])}}
    job = {'id': 'fixture', 'path': root,
           'recipe': {'source': 'GLORIA', 'parser_options': {'year': 2025, 'satellites': 'Emissions'},
                      'input_layout': layout},
           'original': {'provenance': provenance}}
    selected = SimpleNamespace(readme_path=root / bindings['readme'], use_adjustments=())
    for field in ['T_path', 'Y_path', 'V_path', 'TQ_path', 'YQ_path']:
        role = 'satellites' if 'Q_' in field else 'economic'
        setattr(selected, field, SimpleNamespace(container=root / bindings[role]))
    calls = []
    def detect(path, **kwargs):
        calls.append((path, kwargs))
        return selected, None
    monkeypatch.setattr(gloria, 'detect_gloria_layout', detect)
    return job, selected, calls


def receipts(job):
    return [{'role': 'economic', 'file': path.name, 'sha256': sha(path.read_bytes()),
             'bytes': path.stat().st_size, 'md5': hashlib.md5(path.read_bytes()).hexdigest()}
            for path in sorted(Path(job['path']).iterdir())]


def add_revision(job, role):
    layout = job['recipe']['input_layout']
    observed = sha((Path(job['path']) / layout['bindings'][role]).read_bytes())
    frozen = sha(b'previous workbook packaging')
    provenance = job['original']['provenance']
    if role == 'readme':
        provenance['readme_sha256'] = frozen
        review = {'metadata': {
            'previous_workbook_sha256': frozen, 'observed_workbook_sha256': observed,
            'sets': {key: {'exact_frozen_order_match': True} for key in [
                'Activity', 'Commodity', 'Region', 'Factor of production',
                'Consumption category', 'Satellite account']},
            'all_selected_satellite_units_exact_match': True},
            **{key: {'unchanged_source_reference_tolerance_pass': True} for key in ['va', 'ghg', 'ey']}}
    else:
        provenance['label_verification']['regional_labels']['local_sha256'] = frozen
        review = {'previous_figure_workbook_sha256': frozen,
                  'observed_figure_workbook_sha256': observed,
                  'all_region_codes_exact_order_match': True,
                  'builtin_sector_casefold_exact_order_match': True}
    revision = {'name': layout['bindings'][role], 'frozen_sha256': frozen,
                'observed_sha256': observed, 'review': review}
    layout['metadata_equivalence'] = {role: revision}
    return revision


@pytest.mark.parametrize('variant,labels', [('standard', False), ('standard', True), ('E', False), ('E', True)])
def test_emerging_fresh_closure_uses_declared_public_detector_options(tmp_path, monkeypatch, variant, labels):
    job, _, calls = make_em(tmp_path, monkeypatch, variant=variant, labels=labels)
    guard.validate_input_layout(job)
    guard.validate_layout_receipts(job, receipts(job))
    assert calls == [(Path(job['path']), job['recipe']['parser_options'])]


def test_gloria_checks_both_complete_archive_inventories(tmp_path, monkeypatch):
    job, _, calls = make_gloria(tmp_path, monkeypatch)
    guard.validate_input_layout(job)
    guard.validate_layout_receipts(job, receipts(job))
    assert calls == [(Path(job['path']), {'year': 2025})]


@pytest.mark.parametrize('damage', ['missing_contract', 'duplicate_name', 'duplicate_binding',
                                    'absolute', 'parent', 'hidden', 'nested', 'backslash',
                                    'missing_absence', 'undeclared_role'])
def test_contract_rejects_ambiguous_or_undeclared_closure(tmp_path, monkeypatch, damage):
    job, _, calls = make_em(tmp_path, monkeypatch)
    layout = job['recipe']['input_layout']
    if damage == 'missing_contract':
        del job['recipe']['input_layout']
    elif damage == 'duplicate_name':
        layout['files'].append(copy.deepcopy(layout['files'][0]))
    elif damage == 'duplicate_binding':
        layout['bindings']['co2'] = layout['bindings']['economic']
    elif damage == 'missing_absence':
        layout['absent_roles'] = ['labels']
    elif damage == 'undeclared_role':
        layout['bindings']['labels'] = 'labels.xlsx'
        layout['files'].append({'name': 'labels.xlsx'})
    else:
        name = {'absolute': '/tmp/native.mat', 'parent': '..', 'hidden': '.native.mat',
                'nested': 'nested/native.mat', 'backslash': r'nested\native.mat'}[damage]
        layout['bindings']['economic'] = name
        layout['files'][0]['name'] = name
    with pytest.raises(ValueError):
        guard.validate_input_layout(job)
    assert not calls


@pytest.mark.parametrize('damage', ['extra_file', 'extra_hidden', 'missing_file', 'directory', 'physical_alias', 'root_file'])
def test_directory_is_exact_before_parser_discovery(tmp_path, monkeypatch, damage):
    job, _, calls = make_em(tmp_path, monkeypatch)
    root = Path(job['path'])
    if damage in ['extra_file', 'extra_hidden']:
        (root / ('extra.xlsx' if damage == 'extra_file' else '.DS_Store')).write_bytes(b'outside contract')
    elif damage in ['missing_file', 'directory', 'physical_alias']:
        target = root / 'co2.mat'; target.unlink()
        if damage == 'directory':
            target.mkdir()
        elif damage == 'physical_alias':
            target.symlink_to(root / 'economic.mat')
    else:
        job['path'] = root / 'economic.mat'
    with pytest.raises(ValueError, match='dedicated directory|Dedicated input directory'):
        guard.validate_input_layout(job)
    assert not calls


@pytest.mark.parametrize('role', ['economic', 'co2', 'labels', 'figure'])
def test_emerging_detector_cannot_escape_or_add_implicit_metadata(tmp_path, monkeypatch, role):
    job, selected, _ = make_em(tmp_path, monkeypatch)
    field = {'economic': 'data_path', 'co2': 'co2_path', 'labels': 'labels_path', 'figure': 'figure_data_path'}[role]
    setattr(selected, field, tmp_path / 'outside.xlsx')
    with pytest.raises(ValueError, match='undeclared or differently selected'):
        guard.validate_input_layout(job)


@pytest.mark.parametrize('field', ['readme_path', 'T_path', 'Y_path', 'V_path', 'TQ_path', 'YQ_path'])
def test_gloria_detector_cannot_select_parent_or_other_archive(tmp_path, monkeypatch, field):
    job, selected, _ = make_gloria(tmp_path, monkeypatch)
    if field == 'readme_path':
        selected.readme_path = tmp_path / 'readme.xlsx'
    else:
        getattr(selected, field).container = tmp_path / 'outside.zip'
    with pytest.raises(ValueError, match='undeclared or differently selected'):
        guard.validate_input_layout(job)


def test_gloria_rejects_unreviewed_additional_valuations(tmp_path, monkeypatch):
    job, selected, _ = make_gloria(tmp_path, monkeypatch)
    selected.use_adjustments = ((selected.T_path, selected.Y_path),)
    with pytest.raises(ValueError, match='valuation'):
        guard.validate_input_layout(job)


def test_emerging_e_requires_explicit_builtin_fallback(tmp_path, monkeypatch):
    job, _, _ = make_em(tmp_path, monkeypatch, variant='E')
    del job['recipe']['input_layout']['sector_labels_source']
    with pytest.raises(ValueError, match='built-in'):
        guard.validate_input_layout(job)


@pytest.mark.parametrize('kind', ['gloria', 'emerging_e'])
def test_explicit_metadata_revision_retains_old_pin_and_review(tmp_path, monkeypatch, kind):
    job, _, _ = make_gloria(tmp_path, monkeypatch) if kind == 'gloria' else make_em(tmp_path, monkeypatch, variant='E')
    role = 'readme' if kind == 'gloria' else 'figure'
    revision = add_revision(job, role)
    guard.validate_input_layout(job)
    guard.validate_layout_receipts(job, receipts(job))
    assert revision['frozen_sha256'] != revision['observed_sha256']


@pytest.mark.parametrize('damage', ['wrong_original', 'wrong_observed', 'wrong_name', 'no_review', 'false_order', 'false_units', 'false_native'])
def test_gloria_revision_cannot_waive_frozen_metadata_or_failed_evidence(tmp_path, monkeypatch, damage):
    job, _, _ = make_gloria(tmp_path, monkeypatch)
    revision = add_revision(job, 'readme')
    if damage == 'wrong_original':
        job['original']['provenance']['readme_sha256'] = sha(b'another original')
    elif damage == 'wrong_observed':
        revision['observed_sha256'] = sha(b'unreviewed new bytes')
    elif damage == 'wrong_name':
        revision['name'] = 'another.xlsx'
    elif damage == 'no_review':
        revision['review'] = {}
    elif damage == 'false_order':
        revision['review']['metadata']['sets']['Region']['exact_frozen_order_match'] = False
    elif damage == 'false_units':
        revision['review']['metadata']['all_selected_satellite_units_exact_match'] = False
    else:
        revision['review']['ghg']['unchanged_source_reference_tolerance_pass'] = False
    with pytest.raises(ValueError):
        guard.validate_input_layout(job)
    with pytest.raises(ValueError):
        guard.validate_layout_receipts(job, receipts(job))


@pytest.mark.parametrize('damage', ['region_order', 'sector_order', 'original', 'observed'])
def test_figure_revision_requires_both_order_checks_and_linked_hashes(tmp_path, monkeypatch, damage):
    job, _, _ = make_em(tmp_path, monkeypatch, variant='E')
    revision = add_revision(job, 'figure')
    key = {'region_order': 'all_region_codes_exact_order_match', 'sector_order': 'builtin_sector_casefold_exact_order_match',
           'original': 'previous_figure_workbook_sha256', 'observed': 'observed_figure_workbook_sha256'}[damage]
    revision['review'][key] = False if damage.endswith('order') else sha(b'other')
    with pytest.raises(ValueError):
        guard.validate_layout_receipts(job, receipts(job))


@pytest.mark.parametrize('damage', ['missing', 'extra', 'duplicate', 'role', 'metadata_hash'])
def test_receipts_require_complete_unique_economic_directory_members(tmp_path, monkeypatch, damage):
    job, _, _ = make_em(tmp_path, monkeypatch, variant='E')
    records = receipts(job)
    if damage == 'missing':
        records.pop()
    elif damage == 'extra':
        records.append({'role': 'economic', 'file': 'extra.xlsx', 'sha256': sha(b'extra')})
    elif damage == 'duplicate':
        records.append(copy.deepcopy(records[0]))
    elif damage == 'role':
        records[0]['role'] = 'co2_path'
    else:
        next(x for x in records if x['file'] == 'Figure data.xlsx')['sha256'] = sha(b'changed')
    with pytest.raises(ValueError):
        guard.validate_layout_receipts(job, records)


@pytest.mark.parametrize('kind', ['gloria', 'emerging_e'])
def test_replay_requires_no_native_filesystem_access(tmp_path, monkeypatch, kind):
    job, _, _ = make_gloria(tmp_path, monkeypatch) if kind == 'gloria' else make_em(tmp_path, monkeypatch, variant='E')
    add_revision(job, 'readme' if kind == 'gloria' else 'figure')
    records = receipts(job)
    job['path'] = '/a/deleted/source/directory'
    def forbidden(*args, **kwargs):
        raise AssertionError('Replay attempted raw filesystem access')
    with monkeypatch.context() as patch:
        for name in ['exists', 'is_file', 'is_dir', 'iterdir', 'open', 'read_bytes', 'resolve']:
            patch.setattr(Path, name, forbidden)
        guard.validate_layout_receipts(job, records)


@pytest.mark.parametrize('damage', ['archive_changed', 'declared_changed', 'original_changed'])
def test_gloria_archive_inventory_cannot_silently_change(tmp_path, monkeypatch, damage):
    job, _, _ = make_gloria(tmp_path, monkeypatch)
    records = receipts(job)
    if damage == 'archive_changed':
        with zipfile.ZipFile(Path(job['path']) / 'satellite.zip', 'a') as archive:
            archive.writestr('extra.csv', 'new source')
    elif damage == 'declared_changed':
        job['recipe']['input_layout']['archive_members']['satellites'][0]['crc32'] = '00000000'
    else:
        job['original']['provenance']['satellite_members'][0]['crc32'] = '00000000'
    with pytest.raises(ValueError, match='archive|Archive'):
        guard.validate_input_layout(job)
    if damage != 'archive_changed':
        with pytest.raises(ValueError, match='archive|Archive'):
            guard.validate_layout_receipts(job, records)


def test_non_target_sources_do_not_acquire_an_implicit_layout_requirement():
    job = {'recipe': {'source': 'fixture'}}
    guard.validate_input_layout(job)
    guard.validate_layout_receipts(job, [])


def test_emerging_cached_cli_skips_raw_preflight_but_checks_receipts(tmp_path, monkeypatch):
    from pipelines import embodied_trade as collector
    job, _, _ = make_em(tmp_path, monkeypatch)
    records = receipts(job)
    job['path'] = '/deleted/native/source'
    data = {'results': {'value_added_footprint': {}}, 'errors': {}}
    published = []
    monkeypatch.setattr(collector, 'SCOPE', tmp_path / 'scope.json')
    monkeypatch.setattr(collector, 'CACHE', tmp_path / 'cache')
    monkeypatch.setattr(collector, 'current_scope', lambda: {'readings': [
        {'id': 'fixture', 'required_metrics': ['value_added_trade']}]})
    monkeypatch.setattr(collector, 'source_jobs', lambda source: [job])
    monkeypatch.setattr(collector, 'load_cached_source', lambda job, options: (data, {'inputs': records}))
    monkeypatch.setattr(collector, 'publish_result', lambda *args, **kwargs: published.append(kwargs))
    def forbidden(*args, **kwargs):
        raise AssertionError('Cached CLI attempted fresh input access')
    monkeypatch.setattr(guard, 'validate_input_layout', forbidden)
    monkeypatch.setattr(collector, 'solve_source', forbidden)
    monkeypatch.setattr(sys, 'argv', ['embodied_trade', '--source-root', str(tmp_path), '--publish-cached'])
    collector.main()
    assert published[0]['publication_mode'] == 'verified_private_cache_no_raw_access'
    published.clear()
    records.pop()
    with pytest.raises(SystemExit) as failure:
        collector.main()
    assert failure.value.code == 1
    assert not published



@pytest.mark.parametrize('role', ['readme', 'figure'])
def test_metadata_revision_rejects_non_hex_historical_sha(tmp_path, monkeypatch, role):
    job, _, _ = make_gloria(tmp_path, monkeypatch) if role == 'readme' else make_em(tmp_path, monkeypatch, variant='E')
    revision = add_revision(job, role)
    malformed = 'g' * 64
    revision['frozen_sha256'] = malformed
    if role == 'readme':
        job['original']['provenance']['readme_sha256'] = malformed
        revision['review']['metadata']['previous_workbook_sha256'] = malformed
    else:
        job['original']['provenance']['label_verification']['regional_labels']['local_sha256'] = malformed
        revision['review']['previous_figure_workbook_sha256'] = malformed
    with pytest.raises(ValueError):
        guard.validate_layout_receipts(job, receipts(job))


def test_gloria_none_selector_retains_all_satellite_input_roles(tmp_path, monkeypatch):
    job, _, _ = make_gloria(tmp_path, monkeypatch)
    job['recipe']['parser_options']['satellites'] = None
    guard.validate_input_layout(job)
    guard.validate_layout_receipts(job, receipts(job))


def test_fresh_cli_rejects_bad_layout_before_any_compute(tmp_path, monkeypatch):
    from pipelines import embodied_trade as collector
    job = {'id': 'fixture', 'recipe': {'source': 'EMERGING'}}
    monkeypatch.setattr(collector, 'SCOPE', tmp_path / 'scope.json')
    monkeypatch.setattr(collector, 'CACHE', tmp_path / 'cache')
    monkeypatch.setattr(collector, 'current_scope', lambda: {'readings': [
        {'id': 'fixture', 'required_metrics': ['value_added_trade']}]})
    monkeypatch.setattr(collector, 'source_jobs', lambda source: [job])
    reached = []
    monkeypatch.setattr(collector, 'solve_source', lambda *args: reached.append('compute'))
    monkeypatch.setattr(collector, 'publish_result', lambda *args, **kwargs: reached.append('publication'))
    monkeypatch.setattr(sys, 'argv', ['embodied_trade', '--source-root', str(tmp_path)])
    with pytest.raises(SystemExit) as failure:
        collector.main()
    assert failure.value.code == 1
    assert not reached
    assert 'reviewed input_layout' in (collector.CACHE / 'fixture-error.json').read_text()
