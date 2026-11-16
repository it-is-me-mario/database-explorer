"""Shared metadata only; each source owns its paths and annual job list."""
from pathlib import Path
import json,re
ROOT=Path(__file__).resolve().parents[2]
ECONOMY=ROOT/'doc/source/_static/data/economy'

def record(family,version,year,format,currency,scale,recipe,source,source_path=None):
    slug=re.sub('[^a-z0-9_-]+','-',version.lower().replace('.','')).strip('-')
    result=dict(id=f'trade-{family.lower()}-{slug}-{year}-{format}',label=f'{family} {version} · {format}',family=family,version=version,year=year,format=format,currency=currency,scale=scale,recipe=recipe,source_url=source,license='Reviewed source release terms')
    if source_path is not None:result['source_path']=str(source_path)
    return result

def reading(identifier,folder=None,filename=None,format=None):
    data=json.loads((ECONOMY/(identifier+'.json')).read_text());r=data['recipe']
    if filename is None:filename=data['provenance']['input_filename']
    mode=format or ('sut' if r['table']=='SUT' else r['parser_options'].get('system') or ('pxp' if r['dimension']=='Product' else 'ixi'))
    return record(r['source'],'standard' if r['source']=='FIGARO' and not r['release'] else r['release'],r['year'],mode,r['currency'],r['currency_scale'],identifier,r['source_url'],Path(folder)/filename if folder is not None else filename)
