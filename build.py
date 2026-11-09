"""Build the independent explorer and retain routes to upstream library guides."""
from pathlib import Path
import argparse
import html
import hashlib
import shutil
import json
import subprocess
import sys

ROOT=Path(__file__).resolve().parent

def build(output):
    subprocess.run([sys.executable,'-m','sphinx','-b','html','-W','--keep-going',str(ROOT/'doc/source'),str(output)],check=True)
    for document in json.loads((ROOT/'source-manifest.json').read_text()).get('upstream_documents',[]):
        path=output/(document+'.html')
        if path.exists():continue
        target='https://www.marioproject.com/en/latest/'+document+'.html'
        path.parent.mkdir(parents=True,exist_ok=True)
        path.write_text('<!doctype html><html lang="en"><head><meta charset="utf-8"><title>MARIO documentation</title><link rel="canonical" href="'+html.escape(target,quote=True)+'"><meta http-equiv="refresh" content="0;url='+html.escape(target,quote=True)+'"><script>location.replace('+json.dumps(target)+'+location.hash);</script></head><body><a href="'+html.escape(target,quote=True)+'">Continue to the MARIO documentation</a></body></html>')
    reproduce=output/'_static/reproduce'
    files=[]
    for canonical in sorted((ROOT/'doc/source/_static/reproduce/recipes').rglob('*.py')):
        source=reproduce/'recipes'/canonical.relative_to(ROOT/'doc/source/_static/reproduce/recipes')
        files.append({'path':'reproduce/'+source.relative_to(reproduce).as_posix(),'name':source.relative_to(reproduce).as_posix(),'sha256':hashlib.sha256(source.read_bytes()).hexdigest()})
    for filename,name in [('run_selection.py','run_selection.py'),('chart.template.txt','chart.html'),('README.txt','README.txt')]:
        source=reproduce/filename;files.append({'path':'reproduce/'+filename,'name':name,'sha256':hashlib.sha256(source.read_bytes()).hexdigest()})
    licence=next(ROOT.glob('LICENSE*'));shutil.copyfile(licence,reproduce/'LICENSE.txt')
    for source,name in [(reproduce/'LICENSE.txt','LICENSE.txt'),(output/'_static/economy-charts.js','charts/economy-charts.js'),(output/'_static/trade-charts.js','charts/trade-charts.js'),(output/'_static/download-figure.js','charts/download-figure.js')]:
        files.append({'path':source.relative_to(output/'_static').as_posix(),'name':name,'sha256':hashlib.sha256(source.read_bytes()).hexdigest()})
    (reproduce/'manifest.json').write_text(json.dumps({'schema_version':1,'mario_version':'1.3.4','files':files},separators=(',',':'))+'\n')
    (output/'.nojekyll').touch()

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,default=ROOT/'_site')
    args=parser.parse_args();build(args.output.resolve())
