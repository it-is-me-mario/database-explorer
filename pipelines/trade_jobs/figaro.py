"""FIGARO industry/product IOTs and SUTs; E3 retains its supplied 2015 formats."""
from .common import reading,record


def jobs():
    for year in range(2010,2025):
        for mode in ('ixi','pxp','sut'):
            # Existing product jobs retain their identities and source directory.
            # The supplied SUT directories also contain the industry IOT caches,
            # and all three 2024 formats are supplied there.
            folder='FIGARO/IOT' if mode=='pxp' and year<2024 else 'FIGARO/SUT'
            yield reading(f'figaro-{year}-{mode}',folder,str(year),mode)
    for format in ('industry','product','sut'):
        yield record('FIGARO','E3',2015,format,'EUR',1e6,'','https://data.jrc.ec.europa.eu/collection/id-00403')
