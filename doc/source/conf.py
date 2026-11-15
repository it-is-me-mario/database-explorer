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
    ('Indicators', 'compare'), ('Classifications', 'scope'),
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


def editorial_context(app, pagename, templatename, context, doctree):
    """Keep established routes while making indicators the primary entry point."""
    page = context['mario_page']
    root = app.builder.get_relative_uri(pagename, 'index')
    for item in page['nav']:
        if item['key'] == 'explorer':
            item['label'] = 'Explorer'
            item['url'] = root
    if pagename == 'index':
        page['layout'] = 'plain'
        page['section_key'] = 'explorer'
        page['hero'] = {
            'eyebrow': 'MARIO Explorer', 'title': 'Explore economies and their impacts.',
            'text': 'Start with an indicator. Explore countries, years and sectors, then inspect the databases and assumptions behind the results.',
            'install': False,
        }
    elif pagename == 'resources/data-explorer/compare':
        page['hero'] = {'eyebrow': 'MARIO Explorer', 'title': 'Explore indicators', 'text': '', 'install': False}
    elif pagename == 'resources/data-explorer/scope':
        page['hero'] = {'eyebrow': 'MARIO Explorer', 'title': 'Database classifications', 'text': '', 'install': False}
    elif pagename == 'resources/data-explorer/analyses':
        page['hero'] = {'eyebrow': 'MARIO Explorer', 'title': 'Analyses', 'text': '', 'install': False}


def setup(app):
    app.add_css_file('explorer-editorial.css')
    app.connect('html-page-context', editorial_context, priority=950)
