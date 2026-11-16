"""Independently reconcile refreshed local FIGARO files before replacing snapshots.

Uses the existing source-row auditor and the reviewed per-source job list. Native
classifications and their workbook provenance stay frozen when unchanged.
"""
from pathlib import Path
import argparse,gzip,hashlib,importlib.util,json
from .account_jobs.figaro import jobs
ROOT=Path(__file__).resolve().parents[1]


def main():
    cli=argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--source-root',type=Path,required=True)
    cli.add_argument('--only',help='Reading identifier substring')
    cli.add_argument('--publish',action='store_true',help='Replace numeric snapshots after independent accounting and classification checks')
    args=cli.parse_args()
    import mario
    if mario.__version__!='1.3.4':raise RuntimeError('Use mariopy==1.3.4')
    spec=importlib.util.spec_from_file_location('figaro_auditor',ROOT/'doc/scripts/figaro/collect.py');auditor=importlib.util.module_from_spec(spec);spec.loader.exec_module(auditor)
    notebook=next(r for r in json.loads((ROOT/'doc/database_catalogue.recipes.json').read_text())['recipes'] if r['id']=='figaro--02')
    stage=ROOT/'_cache/figaro-refresh';out=ROOT/'doc/source/_static/data/economy'
    for identifier,folder in jobs(args.source_root):
        if args.only and args.only not in identifier:continue
        target=out/(identifier+'.json');old=json.loads(target.read_text());provenance=old['provenance'];source=folder/provenance['input_filename']
        digest=hashlib.sha256(source.read_bytes()).hexdigest()
        if digest==provenance['input_sha256']:
            print('UNCHANGED',identifier,flush=True);continue
        job={'id':identifier,'year':old['recipe']['year'],'mode':'product','path':str(source),'dataflow':provenance['dataflow']}
        result=auditor.collect(job,stage,old['recipe'],notebook);snapshot=json.loads((stage/'readings'/identifier/'snapshot.json').read_text())
        for field in ('regions','sectors','value_added_rows','expected_units'):
            if snapshot['recipe'][field]!=old['recipe'][field]:raise ValueError('Classifications or units changed; require a separate reviewed classification update: '+field)
        snapshot['recipe']=old['recipe'];snapshot['provenance'].update(eurostat_unit='MIO_EUR',previous_input_sha256=provenance['input_sha256'],classification_input_sha256=provenance.get('classification_input_sha256',provenance['input_sha256']),data_refresh_reason='Supplied local source cache differs from the previous numeric vintage; income factors and final-use taxes independently reconciled.')
        if args.publish:target.write_text(json.dumps(snapshot,ensure_ascii=False,separators=(',',':'),allow_nan=False)+'\n')
        print('PUBLISHED' if args.publish else 'VERIFIED',identifier,'max source-row residual EUR',result['max_raw_parsed_error_eur'],flush=True)

if __name__=='__main__':main()
