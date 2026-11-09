"""Native directed flows; exclude domestic pairs before summing selected countries."""
import numpy as np

def components(database, item=None):
    a=database.calc_trades(item=item,intermediate=True,final=False,total=False)
    b=database.calc_trades(item=item,intermediate=False,final=True,total=False)
    if list(a.index)!=list(b.index) or list(a.columns)!=list(b.columns):
        raise ValueError('Intermediate/final geography differs')
    return list(a.index),a.to_numpy(dtype=float),b.to_numpy(dtype=float)

def selected(database, config):
    items=config.get('goods_labels')
    if config.get('goods_code_pattern'):
        import re
        items=[x for x in database.get_index('Commodity' if database.table_type=='SUT' else 'Sector') if re.match(config['goods_code_pattern'],x)]
        if not items:raise ValueError('No reviewed goods-producing categories')
    labels,a,b=components(database,items)
    pairs=config['native_pairs']
    if not pairs or any(x==y for x,y in pairs):raise ValueError('Select international pairs only')
    if any(x not in labels or y not in labels for x,y in pairs):raise ValueError('Incomplete individual-country coverage')
    factor=config['native_to_usd'];pairs=[(labels.index(x),labels.index(y)) for x,y in pairs]
    intermediate=sum(a[i,j] for i,j in pairs)*factor
    final=sum(b[i,j] for i,j in pairs)*factor
    return {'intermediate':float(intermediate),'final':float(final),'total':float(intermediate+final)}
