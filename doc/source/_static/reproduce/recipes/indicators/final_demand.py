"""Final use keeps consumption, fixed investment and stock/valuable changes distinct."""
import numpy as np
from ..common.native_accounts import geography
from ..databases.loading import adapter

def compute(native):
    labels,producer,consumer=geography(native);recipe=native['recipe'];groups=adapter(recipe['source']).demand_groups(native['fd_items'])
    result={}
    for name,items in groups.items():
        matrix=np.zeros((len(labels),len(labels)));selection=np.isin(native['fd_items'],items)
        for j in range(len(labels)):
            values=native['Y'][:,selection&(consumer==j)].sum(axis=1)
            np.add.at(matrix[:,j],producer,values)
        domestic=np.diag(matrix);result[name]=np.column_stack((domestic,matrix.sum(axis=0)-domestic))*recipe['currency_scale']
    return result
