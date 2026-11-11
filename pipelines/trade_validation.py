"""Validate direct monetary flows on genuine source slices, never solve them."""
import numpy as np
import pandas as pd
import mario
from recipes.indicators.trade import components

def sut_slice(names,sectors,final_names,blocks):
    """S/U/Ya/Yc are exact source cells. Unused satellite/factor slots are fixtures.

    This incomplete-country slice is only a calc_trades aggregation check. It is
    never inverted, balanced, or used for production and footprint calculations.
    """
    a=pd.MultiIndex.from_product([names,['Activity'],sectors]);c=pd.MultiIndex.from_product([names,['Commodity'],sectors]);f=pd.MultiIndex.from_product([names,['Consumption category'],final_names])
    factor=pd.Index(['not used']);satellite=pd.Index(['not loaded'])
    zero=lambda index,columns:pd.DataFrame(0.,index=index,columns=columns)
    # Released dataframe construction takes the unified SUT view. Its diagonal
    # quadrants are structural blocks, and never a diagonal regularisation.
    supply=pd.DataFrame(blocks['S'],index=a,columns=c);use=pd.DataFrame(blocks['U'],index=c,columns=a)
    z=pd.concat([pd.concat([zero(a,a),supply],axis=1),pd.concat([use,zero(c,c)],axis=1)])
    y=pd.concat([pd.DataFrame(blocks['Ya'],index=a,columns=f),pd.DataFrame(blocks['Yc'],index=c,columns=f)])
    db=mario.Database(table='SUT',Z=z,Y=y,V=zero(factor,z.columns),E=zero(satellite,z.columns),VY=zero(factor,f),EY=zero(satellite,f),units={k:pd.DataFrame({'unit':u},index=index) for k,u,index in [('Activity','Thousand USD',sectors),('Commodity','Thousand USD',sectors),('Factor of production','Thousand USD',factor),('Satellite account','None',satellite)]},calc_all=False)
    return components(db)
