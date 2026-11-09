"""Reviewed EXIOBASE 3.11.2 monetary time series."""
def jobs(source):
    for year in range(1995,2025):
        for system in ('ixi','pxp'):
            identifier=f'exiobase-3112-{year}-{system}'
            yield identifier, source/f'EXIOBASE/3.11.2/IOT_{year}_{system}.zip'
