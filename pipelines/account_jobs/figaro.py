"""Standard FIGARO IOT product tables; E3 remains a separate source recipe."""
def jobs(source):
    for year in (2015,2022):
        yield f'figaro-{year}-pxp',source/f'FIGARO/IOT/{year}'
