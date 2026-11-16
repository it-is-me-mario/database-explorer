"""Source final-use labels mapped once to SNA categories, without splitting aggregates."""
LABELS={
 'total':'Total final demand','households_npish':'Households + NPISH final consumption expenditure',
 'government':'Government final consumption expenditure',
 'gfcf':'Gross fixed capital formation','inventories':'Changes in inventories',
 'valuables':'Acquisitions less disposals of valuables','inventories_valuables':'Changes in inventories and valuables',
 'capital_formation':'Gross capital formation','other':'Other final demand and adjustments'}
SNA={'households_npish':'P.3 / S.14 + S.15','government':'P.3 / S.13','gfcf':'P.51g','inventories':'P.52','valuables':'P.53','inventories_valuables':'P.52 + P.53','capital_formation':'P.5'}
# Exact native labels, including source-specific combined aggregates.
ALIASES={
 'households':['HFCE','Households','households','household','P3_S14','Household final consumption P.3h','Final consumption expenditure by households','Final consumption expenditure of households'],
 'npish':['NPISH','P3_S15','Non-profit institutions serving households P.3n','Final consumption expenditure by non-profit organisations serving households (NPISH)','Final consumption expenditure of non-profit institutions serving households'],
 'government':['GGFC','Government','government','P3_S13','Government final consumption P.3g','Final consumption expenditure by government','Final consumption expenditure of general government'],
 'gfcf':['GFCF','P51G','Gross fixed capital formation','Gross fixed capital formation P.51'],
 'inventories':['Changes in inventories','Changes in inventories P.52'],
 'valuables':['Changes in valuables','Acquisitions less disposals of valuables P.53'],
 'inventories_valuables':['INVNT','P5M','Changes in inventories and valuables','Changes in inventories and acquisition less disposals of valuables'],
 'capital_formation':['capital']}

def classify(items,*,total_only=False):
    observed=list(dict.fromkeys(map(str,items)))
    if total_only:return {'total':observed}
    lookup={name:group for group,names in ALIASES.items() for name in names}
    result={'total':observed}
    for item in observed:
        name=lookup.get(item,'other')
        if name in {'inventories','valuables'}:name='inventories_valuables'
        result.setdefault(name,[]).append(item)
    if 'capital_formation' not in result:
        capital=result.get('gfcf',[])+result.get('inventories_valuables',[])
        if capital:result['capital_formation']=capital
    consumption=result.pop('households',[])+result.pop('npish',[])
    if consumption:result['households_npish']=consumption
    return result

def consumption_note(recipe):
    note='Households + NPISH combines the observed household and NPISH source columns where separately supplied.'
    if recipe.get('source')=='EMERGING':
        note+=' EMERGING reports one household consumption category; its NPISH coverage is undocumented. The displayed value is the reported household amount, not a verified complete SNA Households + NPISH amount. No missing NPISH amount is treated as zero.'
    elif recipe.get('source')=='OECD':
        note+=' OECD HFCE already includes NPISH for some economies, so separate household-only comparisons are not offered.'
    return note
