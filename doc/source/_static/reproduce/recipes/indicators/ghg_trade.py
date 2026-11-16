"""Global upstream emissions embodied in signed gross international flows.

Intermediate and final crossings can count the same upstream emissions repeatedly.
This is not a final-consumption footprint. Direct final-user emissions are separate.
"""
import numpy as np
from ..common.native_accounts import regional_flows,geography
from ..common.leontief import regional_multipliers

def compute(native,solved=None,flows=None):
    solved=solved or regional_multipliers(native)
    if solved['ghg'] is None:raise ValueError('No reviewed GHG production accounts')
    labels,a,b,intermediate,final=flows or regional_flows(native);_,producer,_=geography(native)
    factors=solved['ghg'].sum(axis=0);result={}
    for name,values in [('intermediate',intermediate),('final',final)]:
        matrix=np.zeros((len(labels),len(labels)));np.add.at(matrix,producer,factors[:,None]*values);result[name]=matrix
    return result
