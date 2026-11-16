"""Native directed flows; exclude domestic pairs before summing selected countries."""
import numpy as np

def source_recipe(recipe,pairs=None):
    """Use the reviewed monetary layout without unrelated extension companions."""
    import copy
    recipe=copy.deepcopy(recipe);recipe['trade_only']=True
    if recipe['source'] in {'WIOD','ADB'}:
        recipe['parser_options'].pop('add_extensions',None)
    if recipe['source']=='EMERGING':
        recipe['parser_options']['load_co2']=False
        recipe['parser_options'].pop('co2_path',None)
    recipe['expected_units']={k:v for k,v in recipe.get('expected_units',{}).items() if k in {'Sector','Activity','Commodity'}}
    if pairs and (recipe['source'] in {'GLORIA','EMERGING'} or recipe['source']=='EXIOBASE' and recipe.get('release')=='REX3'):
        recipe['parser_options']['regions']=list(dict.fromkeys(c for pair in pairs for c in pair))
    return recipe

def producer_goods(mapping,labels):
    """Select whole reviewed producer groups under their classification revision."""
    classification=mapping.get('classification_id')
    if classification in {'nace-1.1','nace-1.1-adb','cpa-2002'}:accepted={'A','B','C','D'}
    elif classification in {'nace-2','nace-2-wiod','cpa-2.1','isic-4','nace-2-emerging'}:accepted={'A','B','C'}
    else:return None
    normalise=(lambda value:str(value).casefold()) if classification=='nace-2-emerging' else str
    sections={normalise(r['native_label']):r['section'] for r in mapping['entries']}
    if len(sections)!=len(mapping['entries']):raise ValueError('Ambiguous native goods-group aliases')
    if not all(normalise(label) in sections for label in labels):return None
    return [label for label in labels if set(sections[normalise(label)].split('+'))<=accepted]

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
