"""Verify the exact reviewed EMERGING economic and CO2 source files."""
from pathlib import Path
import hashlib


def verify_inputs(path,recipe,provenance):
    checks=[(Path(path),provenance['input_sha256'],'economic')]
    options=recipe['parser_options']
    if options.get('load_co2',True):
        if not options.get('co2_path'):raise ValueError('Supply the exact reviewed EMERGING CO2 companion path before collection')
        checks.append((Path(options['co2_path']),provenance['emissions']['sha256'],'CO2'))
    result=[]
    for source,expected,role in checks:
        with source.open('rb') as stream:actual=hashlib.file_digest(stream,'sha256').hexdigest()
        if actual!=expected:raise ValueError('Local EMERGING '+role+' checksum differs from the reviewed production reading: '+source.name)
        result.append({'role':role,'file':source.name,'sha256':actual})
    return result
