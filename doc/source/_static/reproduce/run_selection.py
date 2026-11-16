"""Recompute every selected reading, then open chart.html to reproduce the figure.

Edit paths.json to supply your licensed local files. Run:
    python run_selection.py --paths paths.json
For one reading, run its small run_<database>_<year>_<indicator>.py --path ...
"""
from pathlib import Path
import argparse,gc,json
from recipes.run import compute,write_csv

ROOT=Path(__file__).resolve().parent

def main():
    cli=argparse.ArgumentParser(description=__doc__);cli.add_argument('--paths',type=Path,default=ROOT/'paths.json');cli.add_argument('--output',type=Path,default=ROOT/'results.csv');args=cli.parse_args()
    paths=json.loads(args.paths.read_text());selection=json.loads((ROOT/'selection.json').read_text());rows=[]
    for name in selection['config_files']:
        config=json.loads((ROOT/name).read_text());identifier=config['recipe']['id']
        location=paths.get(identifier)
        if any(p['available'] for p in config['points']):
            if not location:raise ValueError('Supply a local source path for '+identifier+' in paths.json')
            options=location if isinstance(location,dict) else {'path':location}
            rows.extend(compute(config,options['path'],{k:v for k,v in options.items() if k!='path'}))
        else:rows.extend(p['row'] for p in config['points'])
        gc.collect();print('Recomputed',identifier,flush=True)
    rows+=selection.get('fixed_rows',[])
    scale=selection['plot']['scale']
    displayed=[{**row,'value':row['value']/scale['factor'] if row.get('value') is not None else None,'unit':scale['unit']} for row in rows]
    write_csv(args.output,displayed)
    rows+=selection['reference_rows']
    output={**selection['plot'],'rows':rows}
    (ROOT/'results.js').write_text('window.MARIO_REPRODUCED = '+json.dumps(output,ensure_ascii=False,allow_nan=False)+';\n')
    print('Saved',args.output,'and results.js. Open chart.html in a browser.')

if __name__=='__main__':main()
