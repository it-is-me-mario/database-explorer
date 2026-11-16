"""WIOD 2016 current-price IOTs and international SUTs; PYP excluded."""
from .common import reading

def jobs():
    for year in range(2000,2015):
        yield reading(f'wiod-2016-{year}-iot-current','WIOD/WIOTS_in_EXCEL',f'WIOT{year}_Nov16_ROW.xlsb','ixi')
        yield reading(f'wiod-2016-{year}-sut','WIOD/SUT_international',f'intsut{year%100:02d}_nov16.xlsb','sut')
