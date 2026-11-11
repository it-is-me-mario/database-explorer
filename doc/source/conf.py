"""Independent build of the MARIO Database Explorer."""
from pathlib import Path
import os
import sys

HERE = Path(__file__).parent.resolve()
sys.path.insert(0, str(HERE / '_ext'))
project = 'MARIO Database Explorer'
author = 'Lorenzo Rinaldi, Mohammad Amin Tahavori, Nicolo Golinucci'
copyright = '2026, ' + author
extensions = ['mario_site', 'mario_database_profiles', 'sphinx_copybutton']
root_doc = 'index'
exclude_patterns = ['_build', '**/.DS_Store', '**/*.ipynb']
html_theme = 'mario'
html_theme_path = ['_themes']
html_static_path = ['_static']
html_baseurl = os.environ.get('EXPLORER_BASEURL', 'https://explorer.marioproject.com/')
html_title = project
html_show_sourcelink = False
html_copy_source = False
html_js_files = [
    'https://cdn.plot.ly/plotly-3.6.0.min.js',
    'external-links.js',
]
html_css_files = []
mario_notebook_downloads = {}
pages = [
    ('Classifications', 'scope'), ('Compare databases', 'compare'),
    ('Analyses', 'analyses'),
]
mario_site = {
    'github': 'https://github.com/it-is-me-mario/database-explorer',
    'pypi': 'https://pypi.org/project/mariopy/',
    'home_hero': {'title': 'MARIO Database Explorer',
                  'text': 'Compare database coverage, economic indicators and bilateral trade.'},
    'sections': [{
        'key': 'resources', 'label': 'Explorer', 'landing': 'resources/data-explorer/scope',
        'prefixes': ['resources/data-explorer/'],
        'hero': {'title': 'Database explorer', 'text': ''},
        'tabs': [{'key': name, 'label': label, 'doc': 'resources/data-explorer/' + name,
                  'prefixes': ['resources/data-explorer/electricity_'] if name == 'analyses' else []}
                 for label, name in pages],
    }],
    'redirects': {'scope': 'resources/data-explorer/scope',
                  'compare': 'resources/data-explorer/compare',
                  'trade': 'resources/data-explorer/compare#trade'},
}
