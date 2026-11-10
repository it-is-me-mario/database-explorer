"""Reviewed EMERGING 2.2 benchmarks and the latest supplied EMERGING-E release."""
from .common import ECONOMY,record
import json

def jobs():
    for year in (2015,2018,2021,2023):
        yield record('EMERGING','2.2',year,'iot','USD',1e6,f'emerging-22-{year}','https://doi.org/10.5281/zenodo.19461860')
    latest=record('EMERGING','E3.0',2018,'iot','USD',1e6,'emerging-e-2018','https://doi.org/10.5281/zenodo.18303090','EMERGING/E_3.0/EMERGING_E_2018.mat')
    latest['attribution']=json.loads((ECONOMY/'emerging-e-2018.json').read_text())['recipe']['attribution']
    yield latest
