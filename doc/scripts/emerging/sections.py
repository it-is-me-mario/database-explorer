"""Apply the reviewed EMERGING macro producing-section unions, never fine classes."""
import hashlib,json
from pathlib import Path


def apply(root,sections,snapshots):
    path=Path(root)/'doc/classifications/sectoral/emerging-sections.json'
    review=json.loads(path.read_text());lookup={r['native_label'].casefold():r['section'] for r in review['standard_133']}
    lookup.update(review['additional_label_reviews']);names=review['section_labels']
    for snapshot in snapshots:
        r=snapshot['recipe']
        if r['source']!='EMERGING':continue
        entries=[]
        for i,label in enumerate(r['sectors']):
            section='D' if r['release']=='E' and 96<=i<110 else lookup.get(label.casefold())
            if section is None:raise ValueError('Unreviewed EMERGING native product: '+label)
            entries.append({'index':i,'native_code':'','native_label':label,'section':section})
        section_names={e['section']:' + '.join(names[s] for s in e['section'].split('+')) for e in entries}
        sections['mappings'][r['id']]={'family':'EMERGING','classification':'NACE Rev. 2 producing-section groups (reviewed native products)','classification_id':'nace-2-emerging','sections':section_names,'source_url':r['source_url'],'classification_url':review['definition_url'],'method':review['method'],'version':r['release'],'variant':'E' if r['release']=='E' else 'standard','entries':entries,'review_sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
    return sections


if __name__=='__main__':
    root=Path(__file__).resolve().parents[3];base=root/'doc/source/_static/data/economy'
    snapshots=[json.loads(p.read_text()) for p in sorted(base.glob('emerging-*.json'))]
    sections=apply(root,json.loads((base/'sector-sections.json').read_text()),[s for s in snapshots if 'recipe' in s])
    (base/'sector-sections.json').write_text(json.dumps(sections,ensure_ascii=False,separators=(',',':'))+'\n')
