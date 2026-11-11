"""Validate exact JSON transports and immutable source-repository assets."""
from pathlib import Path
import hashlib
import re
import subprocess

REPOSITORY = 'it-is-me-mario/database-explorer'
STATIC_SOURCE = 'doc/source/_static/'


def source_url(commit, logical):
    return f'https://raw.githubusercontent.com/{REPOSITORY}/{commit}/{STATIC_SOURCE}{logical}'


def valid_asset(logical, entry):
    if not (isinstance(logical, str) and logical.startswith('data/')
            and logical.endswith('.json') and '\\' not in logical
            and Path(logical).as_posix() == logical
            and not any(part in {'', '.', '..'} for part in logical.split('/'))
            and isinstance(entry, dict)
            and all(type(entry.get(key)) is int and entry[key] > 0 for key in ('bytes', 'compressed_bytes'))
            and isinstance(entry.get('sha256'), str)
            and re.fullmatch(r'[a-f0-9]{64}', entry['sha256'])):
        return False
    if entry.get('encoding') == 'gzip':
        return entry.get('path') == logical + '.gz' and 'source_commit' not in entry
    commit = entry.get('source_commit')
    return (entry.get('encoding') == 'identity'
            and isinstance(commit, str) and re.fullmatch(r'[a-f0-9]{40}', commit) is not None
            and logical.startswith('data/embodied-trade/')
            and Path(logical).parent.as_posix() == 'data/embodied-trade'
            and '--' in Path(logical).name
            and entry['compressed_bytes'] == entry['bytes']
            and entry.get('path') == source_url(commit, logical))


def git_blob_sha(raw):
    return hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()


def source_asset_index(root, commit='HEAD'):
    resolved = subprocess.check_output(['git', '-C', str(root), 'rev-parse', commit], text=True).strip()
    if re.fullmatch(r'[a-f0-9]{40}', resolved) is None:
        raise ValueError('Invalid source commit')
    listing = subprocess.check_output(['git', '-C', str(root), 'ls-tree', '-rz', resolved, '--', STATIC_SOURCE + 'data/embodied-trade'])
    blobs = {}
    for record in listing.split(b'\0'):
        if not record:
            continue
        metadata, filename = record.decode().split('\t', 1)
        _, kind, digest = metadata.split()
        if kind == 'blob':
            blobs[filename.removeprefix(STATIC_SOURCE)] = digest
    return resolved, blobs
