"""The site transports original JSON bytes without changing values or downloads."""
import gzip
import importlib.util
import json
from pathlib import Path

import pytest

ROOT=Path(__file__).resolve().parents[2]


def module(name,file):
    spec=importlib.util.spec_from_file_location(name,ROOT/file)
    result=importlib.util.module_from_spec(spec);spec.loader.exec_module(result)
    return result


BUILD=module('explorer_build','build.py')
CHECK=module('explorer_check','check_site.py')


@pytest.fixture
def site(tmp_path):
    static=tmp_path/'_static';(static/'data/benchmarks').mkdir(parents=True)
    raw=(json.dumps({'signed':[0,-1.23456789012345,1e-80,1.23456789012345e20]*5000,'label':'città'},ensure_ascii=False)+'\n').encode()
    (static/'data/numerical.json').write_bytes(raw)
    (static/'data/tiny.json').write_text('{"zero":0}\n')
    (static/'data/benchmarks/download.json').write_bytes(raw)
    (static/'reproduce').mkdir();(static/'reproduce/manifest.json').write_bytes(raw)
    downloads=tmp_path/'_downloads';downloads.mkdir();(downloads/'download.json').write_bytes(raw)
    return tmp_path,raw


def test_exact_bytes_and_existing_direct_downloads_are_preserved(site):
    root,raw=site;static=root/'_static'
    registry=BUILD.compress_json_assets(root)
    assert set(registry['assets'])=={'data/numerical.json'}
    assert not (static/'data/numerical.json').exists()
    assert gzip.decompress((static/'data/numerical.json.gz').read_bytes())==raw
    assert (static/'data/benchmarks/download.json').read_bytes()==raw
    assert (static/'reproduce/manifest.json').read_bytes()==raw
    assert (root/'_downloads/download.json').read_bytes()==raw
    reader=CHECK.check_json_assets(static)
    assert reader(static/'data/numerical.json')==json.loads(raw)
    assert reader(static/'data/tiny.json')=={'zero':0}


def test_compression_is_deterministic_and_idempotent(site):
    root,raw=site;static=root/'_static'
    first=BUILD.compress_json_assets(root);packed=(static/'data/numerical.json.gz').read_bytes()
    assert BUILD.compress_json_assets(root)==first
    (static/'data/numerical.json').write_bytes(raw)
    assert BUILD.compress_json_assets(root)==first
    assert (static/'data/numerical.json.gz').read_bytes()==packed


def test_incremental_small_replacement_removes_stale_compressed_copy(site):
    root,_=site;static=root/'_static';BUILD.compress_json_assets(root)
    (static/'data/numerical.json').write_text('{"replacement":true}')
    assert BUILD.compress_json_assets(root)['assets']=={}
    assert not (static/'data/numerical.json.gz').exists()
    assert CHECK.check_json_assets(static)(static/'data/numerical.json')=={'replacement':True}


@pytest.mark.parametrize('damage',['compressed_bytes','bytes','sha256','encoding','escape','duplicate','corrupt'])
def test_corrupt_or_inconsistent_transport_is_rejected(site,damage):
    root,raw=site;static=root/'_static';registry=BUILD.compress_json_assets(root)
    entry=registry['assets']['data/numerical.json']
    if damage in {'compressed_bytes','bytes'}:entry[damage]+=1
    elif damage=='sha256':entry['sha256']='0'*64
    elif damage=='encoding':entry['encoding']='other'
    elif damage=='escape':entry['path']='../outside.json.gz'
    elif damage=='duplicate':(static/'data/numerical.json').write_bytes(raw)
    elif damage=='corrupt':(static/'data/numerical.json.gz').write_bytes(b'broken')
    (static/'json-assets.json').write_text(json.dumps(registry))
    with pytest.raises((AssertionError,OSError,EOFError)):CHECK.check_json_assets(static)


def test_publication_budget_is_checked(site,monkeypatch):
    root,_=site;monkeypatch.setattr(BUILD,'MAX_SITE_BYTES',1)
    with pytest.raises(ValueError,match='publication budget'):BUILD.compress_json_assets(root)


def test_build_copies_only_manifest_complete_embodied_readings(tmp_path,monkeypatch):
    source=tmp_path/'repo/doc/source/_static/data/embodied-trade';source.mkdir(parents=True)
    manifest={'readings':[{'file':'complete.json','sector_files':{'A':'complete--a.json'}}]}
    (source/'manifest.json').write_text(json.dumps(manifest))
    (source/'complete.json').write_text('{"id":"complete"}')
    (source/'complete--a.json').write_text('{"id":"complete","section":"A"}')
    (source/'next.json').write_text('{"id":"next"}')
    output=tmp_path/'site';built=output/'_static/data/embodied-trade';built.mkdir(parents=True)
    (built/'next.json').write_text('{"id":"next"}')
    monkeypatch.setattr(BUILD,'ROOT',tmp_path/'repo')
    BUILD.snapshot_embodied_assets(output)
    assert json.loads((built/'manifest.json').read_text())==manifest
    assert {path.name for path in built.iterdir()}=={'manifest.json','complete.json','complete--a.json'}


@pytest.mark.parametrize('damage',['schema','absolute','traversal','logical','noncanonical','encoding','sha256','size','symlink','registry_symlink'])
def test_previous_registry_is_rejected_before_mutating_any_assets(site,damage):
    root,raw=site;static=root/'_static'
    registry=BUILD.compress_json_assets(root)
    entry=registry['assets']['data/numerical.json']
    outside=root.parent/(root.name+'-outside.json.gz');outside.write_bytes(b'leave untouched')
    # A small canonical replacement triggers the stale-transport cleanup branch.
    (static/'data/numerical.json').write_text('{"replacement":true}')
    (static/'data/new.json').write_bytes(raw)
    if damage=='schema':registry['schema_version']=2
    elif damage=='absolute':entry['path']=str(outside)
    elif damage=='traversal':entry['path']='../../'+outside.name
    elif damage=='logical':
        del registry['assets']['data/numerical.json']
        registry['assets']['../outside.json']={**entry,'path':'../outside.json.gz'}
    elif damage=='noncanonical':
        del registry['assets']['data/numerical.json']
        registry['assets']['data/./numerical.json']={**entry,'path':'data/./numerical.json.gz'}
    elif damage=='encoding':entry['encoding']='other'
    elif damage=='sha256':entry['sha256']='not a checksum'
    elif damage=='size':entry['bytes']=True
    elif damage=='symlink':
        packed=static/entry['path'];packed.unlink();packed.symlink_to(outside)
    registry_file=static/'json-assets.json';registry_file.write_text(json.dumps(registry))
    if damage=='registry_symlink':
        registry_file.unlink();registry_file.symlink_to(outside)
    registry_before=registry_file.read_bytes()
    with pytest.raises(ValueError,match='previous|Previous'):BUILD.compress_json_assets(root)
    assert outside.read_bytes()==b'leave untouched'
    assert (static/'data/numerical.json').read_text()=='{"replacement":true}'
    assert (static/'data/new.json').read_bytes()==raw
    assert not (static/'data/new.json.gz').exists()
    assert registry_file.read_bytes()==registry_before
