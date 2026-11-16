"""Independent build of the MARIO Database Explorer."""
from pathlib import Path
import os
import sys

HERE = Path(__file__).parent.resolve()
sys.path.insert(0, str(HERE / '_ext'))
sys.path.insert(0, str(HERE.parents[1]))
from build import prepare_shared_theme

SHARED = prepare_shared_theme()
project = 'MARIO Database Explorer'
author = 'Lorenzo Rinaldi, Mohammad Amin Tahavori, Nicolo Golinucci'
copyright = '2026, ' + author
extensions = ['mario_site', 'mario_database_profiles', 'sphinx_copybutton']
root_doc = 'index'
exclude_patterns = ['_build', '**/.DS_Store', '**/*.ipynb']
html_theme = 'mario'
html_theme_path = [str(SHARED / '_themes')]
html_static_path = ['_static', str(SHARED / '_static')]
templates_path = ['_templates']
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
MASTER = 'https://www.marioproject.com/en/latest/'
mario_site = {
    'home_url': MASTER,
    'github': 'https://github.com/it-is-me-mario/database-explorer',
    'pypi': 'https://pypi.org/project/mariopy/',
    'home_hero': {'title': 'MARIO Database Explorer',
                  'text': 'Compare database coverage, economic indicators and bilateral trade.'},
    'sections': [{
        'key': 'get_started', 'label': 'Get started', 'landing': MASTER + 'get_started/index.html',
        'tabs': [
            {'label': 'Installation', 'doc': MASTER + 'get_started/index.html'},
            {'label': 'Table formats', 'doc': MASTER + 'get_started/table_formats.html'},
            {'label': 'Scenarios', 'doc': MASTER + 'get_started/scenarios.html'},
        ],
    }, {
        'key': 'docs', 'label': 'Docs', 'landing': MASTER + 'user_guide/index.html',
        'tabs': [
            {'label': 'Data sources', 'doc': MASTER + 'user_guide/parsers/index.html'},
            {'label': 'Inspecting and exporting', 'doc': MASTER + 'user_guide/inspection/index.html'},
            {'label': 'Transformations', 'doc': MASTER + 'user_guide/transformations/index.html'},
        ],
    }, {
        'key': 'explorer', 'label': 'Database explorer', 'landing': 'resources/data-explorer/scope',
        'prefixes': ['resources/data-explorer/'],
        'hero': {'title': 'Database explorer', 'text': ''},
        'tabs': [{'key': name, 'label': label, 'doc': 'resources/data-explorer/' + name,
                  'prefixes': ['resources/data-explorer/electricity_'] if name == 'analyses' else []}
                 for label, name in pages],
    }, {
        'key': 'resources', 'label': 'Resources', 'landing': 'https://tutorials.marioproject.com/',
        'tabs': [
            {'label': 'Tutorials', 'doc': 'https://tutorials.marioproject.com/'},
            {'label': 'Teaching', 'doc': MASTER + 'resources/teaching.html'},
            {'label': 'Projects & Publications', 'doc': MASTER + 'resources/projects_publications.html'},
            {'label': 'Downloadable material', 'doc': MASTER + 'resources/material.html'},
        ],
    }],
    'redirects': {'scope': 'resources/data-explorer/scope',
                  'compare': 'resources/data-explorer/compare',
                  'trade': 'resources/data-explorer/compare#trade'},
}
