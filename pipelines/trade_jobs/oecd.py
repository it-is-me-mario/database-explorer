"""OECD ICIO Regular and Extended keep separate complete annual series."""
from .common import reading

def jobs():
    for year in range(1995,2023):
        for kind,filename in (('regular',f'{year}_SML.csv'),('extended',f'{year}.csv')):
            yield reading(f'oecd-icio-{year}-{kind}','OECD - ICIO/ICIO/'+kind.title(),filename,'ixi')
