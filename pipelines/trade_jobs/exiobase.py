"""EXIOBASE 3.11.2 full monetary series and the distinct REX3 reading."""
from .common import reading,record

def jobs():
    for year in range(1995,2025):
        for system in ('ixi','pxp'):
            yield reading(f'exiobase-3112-{year}-{system}','EXIOBASE/3.11.2',f'IOT_{year}_{system}.zip',system)
    yield record('EXIOBASE','REX3',2022,'ixi','EUR',1e6,'','https://zenodo.org/records/10354283')
