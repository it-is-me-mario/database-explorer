"""Keep OECD Regular and Extended as independent readings."""
def jobs(source):
    for year in (2015,2022):
        yield f'oecd-icio-{year}-regular',source/f'OECD - ICIO/ICIO/Regular/{year}_SML.csv'
        yield f'oecd-icio-{year}-extended',source/f'OECD - ICIO/ICIO/Extended/{year}.csv'
