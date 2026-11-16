"""Keep the full OECD Regular and Extended series as independent readings."""
def jobs(source):
    for year in range(1995,2023):
        yield f'oecd-icio-{year}-regular',source/f'OECD - ICIO/ICIO/Regular/{year}_SML.csv'
        yield f'oecd-icio-{year}-extended',source/f'OECD - ICIO/ICIO/Extended/{year}.csv'
