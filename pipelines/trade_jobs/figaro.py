"""Standard FIGARO annual products; E3 has only its supplied 2015 formats."""
from .common import reading,record

def jobs():
    for year in range(2010,2024):
        yield reading(f'figaro-{year}-pxp','FIGARO/IOT',str(year),'pxp')
    for format in ('industry','product','sut'):
        yield record('FIGARO','E3',2015,format,'EUR',1e6,'','https://data.jrc.ec.europa.eu/collection/id-00403')
