"""Use by model destination, split between native domestic and imported output."""
import numpy as np
from ..common.native_accounts import regional_flows

def compute(native,flows=None):
    labels,a,b,_,_=flows or regional_flows(native);scale=native['recipe']['currency_scale']
    def split(matrix):
        domestic=np.diag(matrix);return np.column_stack((domestic,matrix.sum(axis=0)-domestic))*scale
    intermediate,final=split(a),split(b)
    return {'intermediate':intermediate,'final':final,'total':intermediate+final}
