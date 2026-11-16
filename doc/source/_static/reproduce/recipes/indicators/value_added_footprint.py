"""Value added by production origin, supported by a consumer's final demand."""
import numpy as np
from ..common.native_accounts import regional_flows
from ..common.leontief import regional_multipliers

def compute(native,solved=None,flows=None):
    solved=solved or regional_multipliers(native);labels,a,b,_,final=flows or regional_flows(native)
    matrix=solved['va']@final
    expected=np.bincount([labels.index(x) for x in native['producer_regions']],weights=native['va'],minlength=len(labels))-solved['unallocated_va']
    np.testing.assert_allclose(matrix.sum(axis=1),expected,rtol=1e-8,atol=1e-6)
    domestic=np.diag(matrix);scale=native['recipe']['currency_scale']
    return {'values':np.column_stack((domestic,matrix.sum(axis=0)-domestic))*scale,'by_origin_consumer':matrix*scale,'unallocated':solved['unallocated_va']*scale}
