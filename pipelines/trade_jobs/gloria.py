"""GLORIA 060 MRIO years supplied locally; no satellite-only years."""
from .common import reading

def jobs():
    for year in range(2000,2026):
        yield reading(f'gloria-060-{year}-sut','GLORIA/060/GLORIA_MRIO_Loop060_part_I_MRIOdatabase',f'GLORIA_MRIOs_60_{year}.zip','sut')
