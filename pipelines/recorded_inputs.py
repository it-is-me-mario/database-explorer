"""Validate private cache input receipts against current frozen source pins.

This module never opens or inspects a native input path. A verified receipt says
which bytes were hashed when the cache was collected; it does not claim that a
raw source still exists or has been rechecked during publication.
"""
from pathlib import PurePath
import re


def _matches(records, name, role=None):
    return [record for record in records
            if (role is None or record['role'] == role)
            and (record['file'] == name or ('/' not in name and PurePath(record['file']).name == name))]


def _one(records, name, role=None):
    matches = _matches(records, name, role)
    if len(matches) != 1:
        raise ValueError('Cannot uniquely identify recorded frozen source member: ' + str(name))
    return matches[0]


def _checksum(record, checksum, label):
    if not isinstance(checksum, str) or ':' not in checksum:
        raise ValueError('Invalid frozen archive checksum: ' + label)
    algorithm, expected = checksum.split(':', 1)
    if algorithm not in {'md5', 'sha256'} or record.get(algorithm) != expected:
        raise ValueError(label + ' checksum differs from its frozen pin')


def _member(records, name, sha256, *, role=None, size=None, md5=None):
    record = _one(records, name, role)
    if record['sha256'] != sha256 or size is not None and record['bytes'] != size:
        raise ValueError('Recorded source member differs from frozen production fingerprint: ' + name)
    if md5:
        _checksum(record, md5 if md5.startswith('md5:') else 'md5:' + md5, name)


def validate_recorded_inputs(job, records):
    """Reject changed or unprovable frozen pins without reading native inputs."""
    if not isinstance(records, list) or not records:
        raise ValueError('Missing recorded source input fingerprints')
    for record in records:
        if (not isinstance(record, dict) or not isinstance(record.get('role'), str)
                or not record['role'] or not isinstance(record.get('file'), str)
                or not record['file'] or type(record.get('bytes')) is not int
                or record['bytes'] < 0
                or not isinstance(record.get('sha256'), str)
                or not re.fullmatch(r'[a-f0-9]{64}', record['sha256'])
                or not isinstance(record.get('md5'), str)
                or not re.fullmatch(r'[a-f0-9]{32}', record['md5'])):
            raise ValueError('Malformed recorded source input fingerprint')

    provenance = job['original'].get('provenance', {})
    options = job['recipe'].get('parser_options', {})
    source_files = provenance.get('source_files', [])
    if source_files:
        for source in source_files:
            _member(records, source['filename'], source['sha256'],
                    role='economic', size=source.get('bytes'))
    elif provenance.get('input_sha256'):
        _member(records, provenance['input_filename'], provenance['input_sha256'], role='economic')

    emissions = provenance.get('emissions', {})
    if emissions.get('sha256') and (options.get('load_co2') or options.get('add_extensions')):
        _member(records, emissions['filename'], emissions['sha256'])

    published = provenance.get('archive_checksum')
    if published:
        # An archive receipt is one explicitly collected economic file, not a
        # synthetic digest of members of an unpacked directory.
        economic = [record for record in records if record['role'] == 'economic']
        name = PurePath(job['path']).name
        if len(economic) != 1 or economic[0]['file'] != name:
            raise ValueError('Economic archive checksum cannot be established from recorded directory members')
        _checksum(economic[0], published, 'Economic archive')

    companion_pin = provenance.get('matched_iot', {}).get('source_provenance', {}).get('archive_checksum')
    if companion_pin and options.get('add_extensions'):
        name = PurePath(options['add_extensions']).name
        companions = [record for record in records if record['role'] == 'add_extensions']
        if len(companions) != 1 or companions[0]['file'] != name:
            raise ValueError('Matching IOT archive checksum cannot be established from recorded directory members')
        _checksum(companions[0], companion_pin, 'Matching IOT companion archive')

    pins = provenance.get('source_sha256', {})
    if isinstance(pins, dict):
        for name, expected in pins.items():
            _member(records, name, expected)
    if options.get('unit') == 'Hybrid':
        for member in provenance.get('ghg_recharacterisation', {}).get('source_members', []):
            _member(records, member['name'], member['sha256'], size=member.get('size'),
                    md5=member.get('published_md5'))
