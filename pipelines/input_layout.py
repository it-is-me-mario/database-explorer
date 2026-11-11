"""Fail closed around source parsers with implicit companion discovery.

Fresh collection verifies the complete dedicated directory before fingerprinting.
Replay verifies recorded names and metadata hashes only: it never opens raw inputs.
Numerical source identities and solver behavior are not changed by these checks.
"""
from pathlib import Path
import hashlib
import re
import zipfile


def _contract(job):
    recipe = job['recipe']
    if recipe.get('source') not in {'GLORIA', 'EMERGING'}:
        return None
    layout = recipe.get('input_layout', {})
    if layout.get('kind') != 'isolated_directory':
        raise ValueError('GLORIA/EMERGING collection requires a reviewed input_layout and a dedicated directory; declare every parser companion and its role before collection')
    bindings = layout.get('bindings', {})
    names = [item['name'] for item in layout.get('files', [])]
    if (not bindings or len(names) != len(set(names)) or set(names) != set(bindings.values())
            or len(bindings) != len(names)
            or any(not isinstance(name, str) or not name or name.startswith('.')
                   or Path(name).name != name or '/' in name or '\\' in name for name in names)):
        raise ValueError('Input layout must bind each distinct plain filename to exactly one role')
    options = recipe.get('parser_options', {})
    if recipe['source'] == 'GLORIA':
        required = {'economic', 'readme'}
        if options.get('satellites', 'all') is None or options.get('satellites', 'all'):
            required.add('satellites')
        if set(bindings) != required:
            raise ValueError('GLORIA input layout must bind its economic archive, ReadMe and active satellites')
    else:
        required = {'economic'}
        if options.get('load_co2', True):
            required.add('co2')
        if str(options.get('variant', 'standard')).upper() == 'E':
            required.add('figure')
        if options.get('labels_path'):
            required.add('labels')
        if set(bindings) != required:
            raise ValueError('EMERGING input layout differs from its active parser roles')
        if 'figure' in required and 'labels' not in required and layout.get('sector_labels_source') != 'released MARIO 1.3.4 built-in emerging_e_sectors.yaml':
            raise ValueError('EMERGING-E must explicitly identify its reviewed built-in sector labels')
        absent = set(layout.get('absent_roles', []))
        if absent != {'labels', 'figure'} - required:
            raise ValueError('EMERGING input layout must explicitly retain absent metadata roles')
    return layout


def _metadata_pins(job, layout):
    provenance = job.get('original', {}).get('provenance', {})
    pins = {}
    if job['recipe']['source'] == 'GLORIA':
        pins['readme'] = provenance.get('readme_sha256')
    elif 'figure' in layout['bindings']:
        pins['figure'] = provenance.get('label_verification', {}).get('regional_labels', {}).get('local_sha256')
    if 'labels' in layout['bindings']:
        matches = [p.get('sha256') for p in provenance.get('source_files', [])
                   if p.get('filename') == layout['bindings']['labels']]
        pins['labels'] = matches[0] if len(matches) == 1 else None
    equivalence = layout.get('metadata_equivalence', {})
    if set(equivalence) - set(pins):
        raise ValueError('Metadata equivalence names an inactive metadata role')
    for role, frozen in pins.items():
        if not isinstance(frozen, str) or not re.fullmatch(r'[a-f0-9]{64}', frozen):
            raise ValueError('Missing reviewed metadata fingerprint for ' + role)
        revision = equivalence.get(role)
        if revision:
            if (revision.get('name') != layout['bindings'][role]
                    or revision.get('frozen_sha256') != frozen
                    or not isinstance(revision.get('observed_sha256'), str)
                    or not re.fullmatch(r'[a-f0-9]{64}', revision['observed_sha256'])
                    or not revision.get('review')):
                raise ValueError('Metadata equivalence must preserve the original pin and its independent review')
            review = revision['review']
            if role == 'readme':
                metadata = review.get('metadata', {})
                sets = metadata.get('sets', {})
                expected_sets = {'Activity', 'Commodity', 'Region', 'Factor of production', 'Consumption category', 'Satellite account'}
                if (set(sets) != expected_sets
                        or not all(v.get('exact_frozen_order_match') is True for v in sets.values())
                        or metadata.get('all_selected_satellite_units_exact_match') is not True
                        or not all(review.get(k, {}).get('unchanged_source_reference_tolerance_pass') is True for k in ['va', 'ghg', 'ey'])
                        or metadata.get('previous_workbook_sha256') != frozen
                        or metadata.get('observed_workbook_sha256') != revision['observed_sha256']):
                    raise ValueError('GLORIA metadata equivalence requires ordered sets, units and native account checks')
            if role == 'figure' and (review.get('all_region_codes_exact_order_match') is not True
                    or review.get('builtin_sector_casefold_exact_order_match') is not True
                    or review.get('previous_figure_workbook_sha256') != frozen
                    or review.get('observed_figure_workbook_sha256') != revision['observed_sha256']):
                raise ValueError('EMERGING-E metadata equivalence requires reviewed region and sector orders')
            pins[role] = revision['observed_sha256']
    return pins


def _archive_pins(job, layout):
    if job['recipe']['source'] != 'GLORIA':
        return {}
    pins = {}
    for role, key in [('economic', 'economic_members'), ('satellites', 'satellite_members')]:
        if role not in layout['bindings']:
            continue
        frozen = job['original']['provenance'].get(key)
        if not frozen or layout.get('archive_members', {}).get(role) != frozen:
            raise ValueError('GLORIA declared archive inventory differs from its frozen source: ' + role)
        pins[role] = frozen
    return pins


def validate_layout_receipts(job, receipts):
    """Validate the declared closure against saved receipts, without raw access."""
    layout = _contract(job)
    if layout is None:
        return
    names = [item.get('file') for item in receipts]
    if (len(names) != len(set(names)) or set(names) != set(layout['bindings'].values())
            or any(item.get('role') != 'economic' for item in receipts)):
        raise ValueError('Recorded input receipts do not match the complete dedicated directory')
    _archive_pins(job, layout)
    by_name = {item['file']: item for item in receipts}
    for role, digest in _metadata_pins(job, layout).items():
        if by_name[layout['bindings'][role]].get('sha256') != digest:
            raise ValueError('Recorded metadata fingerprint differs for ' + role)


def _check_selected(root, bindings, role, selected):
    expected = root / bindings[role] if role in bindings else None
    # Compare lexical paths: reviewed symlinks may target an external raw archive.
    # Resolving them would conceal discovery outside the declared directory.
    if (selected is None) != (expected is None) or (selected is not None and Path(selected).absolute() != expected.absolute()):
        raise ValueError('Parser discovered an undeclared or differently selected input for ' + role)


def _archive_members(path):
    with zipfile.ZipFile(path) as archive:
        return sorted(({'name': item.filename, 'size': item.file_size,
                        'compressed': item.compress_size, 'crc32': f'{item.CRC:08x}'}
                       for item in archive.infolist() if not item.is_dir()), key=lambda item: item['name'])


def validate_input_layout(job):
    """Check implicit discovery using the released public layout detectors."""
    layout = _contract(job)
    if layout is None:
        return
    root = Path(job['path']).absolute()
    if not root.is_dir():
        raise ValueError('Reviewed implicit inputs must be supplied as a dedicated directory')
    children = list(root.iterdir())
    if (set(p.name for p in children) != set(layout['bindings'].values())
            or any(not p.is_file() for p in children)
            or len({p.resolve() for p in children}) != len(children)):
        raise ValueError('Dedicated input directory differs from its exact declared file list')
    recipe = job['recipe']; options = recipe.get('parser_options', {}); bindings = layout['bindings']
    archive_pins = _archive_pins(job, layout)
    for role, digest in _metadata_pins(job, layout).items():
        if hashlib.sha256((root / bindings[role]).read_bytes()).hexdigest() != digest:
            raise ValueError('Actual metadata fingerprint differs for ' + role)
    if recipe['source'] == 'EMERGING':
        from mario.parsers.emerging import detect_emerging_layout
        selected = detect_emerging_layout(root, **{k: v for k, v in options.items()
            if k in {'year', 'load_co2', 'co2_path', 'labels_path', 'variant'}})
        for role, field in [('economic', 'data_path'), ('co2', 'co2_path'), ('labels', 'labels_path'), ('figure', 'figure_data_path')]:
            _check_selected(root, bindings, role, getattr(selected, field))
    else:
        from mario.parsers.gloria import detect_gloria_layout
        selected, _ = detect_gloria_layout(root, **{k: v for k, v in options.items() if k in {'year', 'valuation'}})
        _check_selected(root, bindings, 'readme', selected.readme_path)
        for field in ['T_path', 'Y_path', 'V_path']:
            _check_selected(root, bindings, 'economic', getattr(selected, field).container)
        for field in ['TQ_path', 'YQ_path']:
            resource = getattr(selected, field)
            _check_selected(root, bindings, 'satellites', resource.container if resource else None)
        if selected.use_adjustments:
            raise ValueError('Additional GLORIA valuation inputs need their own reviewed layout')
        for role, frozen in archive_pins.items():
            if _archive_members(root / bindings[role]) != sorted(frozen, key=lambda item: item['name']):
                raise ValueError('GLORIA archive member inventory differs from its frozen source: ' + role)
