"""Review pilot completeness and canonical source metadata before publishing."""
from pathlib import Path
import json
import numpy as np
from pipelines.trade_collect import OUTPUT, ROOT, jobs, source_terms, write, rebuild_manifest, geography

def finalize():
    for job in jobs():
        path=OUTPUT/(job['id']+'.json')
        if not path.is_file():raise ValueError('Missing successful source extraction: '+job['id'])
        value=json.loads(path.read_text())
        terms=source_terms(job)
        for field in ('label','family','version','year','format','source_url'):value[field]=job[field]
        value.update(license=terms['label'],license_url=terms['url'],attribution=terms.get('note',''))
        value['regions']=geography([r['label'] for r in value['regions']],job['recipe'])
        assert value['native_scale']==job['scale'] and value['native_currency']==job['currency']
        assert value['provenance']['validation'] and value['provenance']['inputs']
        countries={r['iso3'] for r in value['regions'] if r['kind']=='country'}
        assert {'CHN','ITA'} <= countries,job['id']
        for scope,parts in value['flows'].items():
            for matrix in parts.values():
                array=np.asarray(matrix,dtype=float)
                assert array.shape==(len(value['regions']),)*2 and np.isfinite(array).all()
        write(path,value)
    references=json.loads((OUTPUT/'comtrade.json').read_text())
    for year in (2015,2022):
        for kind in ('export','mirror_import'):
            matches=[r for r in references['observations'] if r['origin']=='CHN' and r['destination']=='ITA' and r['year']==year and r['kind']==kind]
            assert len(matches)==1,(year,kind)
    assert len(references['observations'])<100000
    rebuild_manifest()
    print('Validated all',len(jobs()),'pilot readings and',len(references['observations']),'merchandise references.')

if __name__=='__main__':finalize()
