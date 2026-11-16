"""Domestic-origin use within the same native region, intermediate and final."""
import numpy as np
from ..common.native_accounts import regional_flows

def compute(native,flows=None):
    labels,a,b,_,_=flows or regional_flows(native);scale=native['recipe']['currency_scale']
    def split(matrix):
        return np.diag(matrix)[:,None]*scale
    intermediate,final=split(a),split(b)
    return {'intermediate':intermediate,'final':final,'total':intermediate+final}
