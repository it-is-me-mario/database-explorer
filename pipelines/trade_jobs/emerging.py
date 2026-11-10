"""Distinct published EMERGING 2.2 benchmark years; no interpolation."""
from .common import record

def jobs():
    for year in (2015,2018,2021,2023):
        yield record('EMERGING','2.2',year,'iot','USD',1e6,f'emerging-22-{year}','https://doi.org/10.5281/zenodo.19461860')
