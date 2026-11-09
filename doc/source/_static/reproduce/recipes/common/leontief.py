"""Solve regional footprint rows without constructing a full Leontief inverse.

Rows are production-origin regions; final-demand columns remain consumers.
Zero-output satellite accounts remain a quantified, unallocated residual.
"""
import warnings
import numpy as np
from scipy.linalg import lu_factor,lu_solve,LinAlgWarning
from .native_accounts import geography

def regional_multipliers(native):
    z,x=native['Z'],native['x'];labels,producer,_=geography(native);n=len(labels);zero=x==0
    if np.any(z[:,zero]!=0):raise ValueError('Nonzero intermediate inputs on a zero-output node cannot be normalised')
    inverse=np.divide(1.,x,out=np.zeros_like(x),where=~zero)
    # One factorisation serves value-added and GHG right-hand sides together.
    system=np.array(z,order='F',copy=True);system*=(-inverse)[None,:];system.flat[::len(x)+1]+=1.
    va=np.zeros((n,len(x)));np.add.at(va,(producer,np.arange(len(x))),native['va']*inverse)
    rhs=[va];ghg=native.get('ghg')
    if ghg is not None:
        e=np.zeros_like(va);np.add.at(e,(producer,np.arange(len(x))),ghg*inverse);rhs.append(e)
    rhs=np.concatenate(rhs,axis=0)
    with warnings.catch_warnings():
        warnings.simplefilter('error',LinAlgWarning)
        factor,piv=lu_factor(system,overwrite_a=True,check_finite=False)
    coefficients=lu_solve((factor,piv),rhs.T,trans=1,check_finite=False).T
    if not np.isfinite(coefficients).all():raise ValueError('Undefined footprint system')
    # Check the full system on three deterministic independent directions.
    check=np.random.default_rng(431).normal(size=(len(x),3))
    residual=coefficients@(check-z@(inverse[:,None]*check))-rhs@check
    scale=max(1.,float(np.abs(rhs@check).max()))
    relative=float(np.abs(residual).max()/scale)
    if relative>1e-8:raise ValueError('Footprint solve residual exceeds tolerance')
    unallocated_va=np.bincount(producer,weights=np.where(zero,native['va'],0),minlength=n)
    unallocated_ghg=np.bincount(producer,weights=np.where(zero,ghg,0),minlength=n) if ghg is not None else None
    return {'labels':labels,'va':coefficients[:n], 'ghg':coefficients[n:] if ghg is not None else None,
        'unallocated_va':unallocated_va,'unallocated_ghg':unallocated_ghg,'relative_residual':relative}
