"""Allocable consumption footprint with a separate zero-output source residual."""
import numpy as np
from ..common.native_accounts import regional_flows,geography
from ..common.leontief import regional_multipliers

def compute(native,solved=None,flows=None):
    solved=solved or regional_multipliers(native)
    if solved['ghg'] is None:raise ValueError('No reviewed GHG production accounts')
    labels,a,b,_,final=flows or regional_flows(native);matrix=solved['ghg']@final
    _,producer,consumer=geography(native)
    expected=np.bincount(producer,weights=native['ghg'],minlength=len(labels))-solved['unallocated_ghg']
    np.testing.assert_allclose(matrix.sum(axis=1),expected,rtol=1e-8,atol=1e-4)
    direct=np.bincount(consumer,weights=native['ey'],minlength=len(labels)) if native.get('ey') is not None else np.zeros(len(labels))
    domestic=np.diag(matrix)+direct;foreign=matrix.sum(axis=0)-np.diag(matrix)
    return {'values':np.column_stack((domestic,foreign)),'by_origin_consumer':matrix,'direct_final_demand':direct,'unallocated':solved['unallocated_ghg']}
