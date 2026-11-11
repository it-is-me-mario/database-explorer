"""Standard FIGARO IOT product time series; E3 keeps a separate source recipe."""
def jobs(source):
    for year in range(2010,2024):
        yield f'figaro-{year}-pxp',source/f'FIGARO/IOT/{year}'
