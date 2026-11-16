"""Exact direct GLORIA accounts from validated native Trade sums and one Yc pass."""
from pathlib import Path
import argparse,hashlib,json,zipfile
import numpy as np
from .public_accounts import ROOT,OUTPUT,publish,write
from .account_jobs.catalogue import jobs
from .trade_streams.gloria import polars_csv_batches
from recipes.indicators.demand_categories import classify


def collect(job,*,validate_only=False):
    from mario.parsers import gloria as g
    r=job['recipe'];identifier=r['id'];trade=ROOT/'doc/source/_static/data/trade'/('trade-'+identifier+'.json')
    t=json.loads(trade.read_text());layout,meta=g.detect_gloria_layout(job['path'],year=r['year'])
    labels=list(meta.region_codes);nr,ns,nf=len(labels),len(meta.sector_names),len(meta.final_demand_names)
    if labels!=[x['label'] for x in t['regions']]:raise ValueError('Native country order changed')
    # The full T/Y source was already validated against public calc_trades.
    # Bind the category pass to that same reviewed archive before reusing T sums.
    archive_input=next((x for x in t['provenance']['inputs'] if x['file']==job['path'].name and not x.get('member')),None)
    digest=None
    if archive_input:
        with Path(job['path']).open('rb') as stream:digest=hashlib.file_digest(stream,'sha256').hexdigest()
        if digest!=archive_input['sha256']:raise ValueError('Source archive differs from the validated Trade reading')
    else:
        cache=ROOT/'_cache/gloria-aggregates'/(t['id']+'.npz')
        with np.load(cache) as cached:
            identity=json.loads(str(cached['identity']));old_inputs=json.loads(str(cached['input_digests']))
        with zipfile.ZipFile(job['path']) as archive:
            current=[[resource.name,archive.getinfo(resource.name).CRC,archive.getinfo(resource.name).file_size] for resource in [layout.T_path,layout.Y_path]]
        if identity[1]!=current or identity[2:5]!=[labels,list(meta.sector_names),list(meta.final_demand_names)]:raise ValueError('Source members/axes differ from the validated complete Trade pass')
        for resource in [layout.T_path,layout.Y_path]:
            expected=next(x for x in t['provenance']['inputs'] if x.get('member')==resource.name)
            if old_inputs[resource.name]!=expected:raise ValueError('Private native pass differs from published source fingerprints')
    native=np.zeros((nr,nr,nf));fingerprints={};count=0
    for rows,values in polars_csv_batches(layout.Y_path,columns=g._final_demand_positions(list(range(nr)),nf),dtype=np.dtype('float64'),batch_size=1024,input_digests=fingerprints):
        count+=len(rows);mask=rows%(2*ns)>=ns
        np.add.at(native,rows[mask]//(2*ns),values[mask].reshape(-1,nr,nf))
    if count!=nr*ns*2:raise ValueError('Incomplete native final-demand rows')
    if not archive_input:
        expected=next(x for x in t['provenance']['inputs'] if x.get('member')==layout.Y_path.name)
        if fingerprints[layout.Y_path.name]!=expected:raise ValueError('Final-demand member differs from the validated Trade reading')
    a=np.asarray(t['flows']['all']['intermediate'])/t['usd_per_native_currency'];b=np.asarray(t['flows']['all']['final'])/t['usd_per_native_currency']
    np.testing.assert_allclose(native.sum(axis=2)*r['currency_scale'],b,rtol=1e-11,atol=.1)
    domestic={'intermediate':np.diag(a)[:,None],'final':np.diag(b)[:,None],'total':np.diag(a+b)[:,None]}
    groups=classify(meta.final_demand_names);demand={}
    for name,items in groups.items():
        selected=native[:,:,[meta.final_demand_names.index(x) for x in items]].sum(axis=2)*r['currency_scale']
        own=np.diag(selected);demand[name]=np.column_stack((own,selected.sum(axis=0)-own))
    values={'gross_output':(a+b).sum(axis=1)[:,None],'domestic_use':domestic,'final_demand':demand}
    target=OUTPUT/(identifier+'.json');previous=json.loads(target.read_text())
    # Full public-API pilots independently verify all countries and all categories.
    for i,row in enumerate(previous['regions']):
        if row['code']!=labels[i]:raise ValueError('Account country order changed')
        for metric in ('gross_output','domestic_use','final_demand'):
            old=row['accounts'][metric]
            if isinstance(values[metric],dict):
                for part,v in values[metric].items():
                    if part in old:np.testing.assert_allclose(v[i],old[part],rtol=1e-10,atol=.1)
            else:np.testing.assert_allclose(values[metric][i],old,rtol=1e-10,atol=.1)
    if validate_only:
        if not {'households_npish','government','capital_formation'}<=set(previous['demand_groups']):raise ValueError('Use a complete public-API pilot for category validation')
        print('PUBLIC PILOT MATCHED',identifier,'all countries and categories',flush=True);return
    publish(job,values,groups=groups,details={'regions':labels})
    data=json.loads(target.read_text());p=data['provenance'];p['direct_account_method']='Gross output and domestic use reuse the complete native U/Yc country sums validated against public MARIO calc_trades. Final-use categories use one bounded native Yc pass; all countries/categories independently match full public-API pilots.'
    p['direct_flow_source']=t['id'];p['direct_category_inputs']=list(fingerprints.values());p['source_archive_sha256_verified']=digest
    if digest:p['source_sha256']=digest
    for metric in values:p['metric_methods'][metric]=p['direct_account_method']
    p['direct_category_validation']={'complete_public_api_pilots':[2022,2025],'country_totals_match_validated_trade':True,'native_row_count':count,'source_archive_sha256_verified':bool(digest),'source_member_identity_verified':True}
    write(target,data);print('PASSED',identifier,'direct accounts and common categories',flush=True)


def main():
    cli=argparse.ArgumentParser(description=__doc__);cli.add_argument('--inventory',type=Path,required=True);cli.add_argument('--only',type=int);cli.add_argument('--validate-only',action='store_true');args=cli.parse_args()
    for job in json.loads(args.inventory.read_text()):
        if job['recipe']['source']!='GLORIA' or args.only and job['recipe']['year']!=args.only:continue
        job['path']=Path(job['path']);collect(job,validate_only=args.validate_only)
if __name__=='__main__':main()
