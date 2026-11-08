"""Extract supplied REX3 bundles into an explicitly chosen local work folder."""
from pathlib import Path
import argparse
import shutil
import zipfile

def extract(source, destination):
    archives=[]
    for name in ('REX3_2022.zip','REX3_Labels.zip','GHG_data_REX3.zip'):
        matches=[]
        for folder in [source,*[p for p in source.iterdir() if not p.name.startswith('.') and p.is_dir()]]:
            candidate=folder/name
            if candidate.is_file():matches.append(candidate)
        if len(matches)!=1:raise ValueError('Expected exactly one '+name)
        archives.append(matches[0])
    destination.mkdir(parents=True,exist_ok=True)
    required=0
    for path in archives:
        with zipfile.ZipFile(path) as archive:
            required+=sum(i.file_size for i in archive.infolist() if not i.is_dir())
    if shutil.disk_usage(destination).free < required + 512*1024**2:
        raise ValueError('Insufficient free space for the explicit REX3 work folder.')
    for path in archives:
        with zipfile.ZipFile(path) as archive:
            for member in archive.infolist():
                relative=Path(member.filename)
                if member.is_dir() or any(p.startswith('.') or p=='__MACOSX' for p in relative.parts):continue
                target=(destination/relative).resolve()
                if not target.is_relative_to(destination.resolve()):raise ValueError('Unsafe archive path')
                if target.is_file() and target.stat().st_size==member.file_size:continue
                target.parent.mkdir(parents=True,exist_ok=True)
                temporary=target.with_suffix(target.suffix+'.tmp')
                with archive.open(member) as src,temporary.open('wb') as dst:shutil.copyfileobj(src,dst,4*1024**2)
                temporary.replace(target)
        print('Extracted',path.name,flush=True)

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-root',type=Path,required=True)
    parser.add_argument('--destination',type=Path,required=True)
    args=parser.parse_args();extract(args.source_root,args.destination)
