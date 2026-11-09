"""Curated EXIOBASE monetary pilot readings."""
def jobs(source):
    for year in (2015,2022):
        for system in ('ixi','pxp'):
            identifier=f'exiobase-3112-{year}-{system}'
            yield identifier, source/f'EXIOBASE/3.11.2/IOT_{year}_{system}.zip'
