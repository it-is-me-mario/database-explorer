"""ADB native-geography editions retain their reviewed source filenames."""
from .common import ECONOMY,reading
import json

def jobs():
    for path in sorted(ECONOMY.glob('adb-*.json')):
        recipe=json.loads(path.read_text())['recipe']
        yield reading(path.stem,'ADB/'+recipe['release'],format='ixi')
