"""Add shared navigation and version selection to each committed Explorer."""

import os


def page_context(app, pagename, templatename, context, doctree):
    channel = os.environ['EXPLORER_CHANNEL']
    site_root = os.environ['EXPLORER_SITE_ROOT'].rstrip('/') + '/'
    revision = os.environ['EXPLORER_SOURCE_COMMIT']
    master = f'https://www.marioproject.com/en/{channel}/'
    tutorials = 'https://tutorials.marioproject.com/' + ('dev/' if channel == 'dev' else '')
    page = context['mario_page']

    def library_section(key, label, landing, links):
        return {'key': key, 'label': label, 'url': master + landing,
                'children': [{'label': name, 'url': master + path} for name, path in links]}

    explorer_section = next(section for section in app.config.mario_site['sections']
                            if section['landing'] == 'resources/data-explorer/scope')
    explorer_links = [
        {'label': tab['label'], 'url': app.builder.get_relative_uri(pagename, tab['doc'])}
        for tab in explorer_section['tabs']
    ]
    page['nav'] = [
        library_section('get_started', 'Get started', 'get_started/index.html', [
            ('Installation', 'get_started/index.html'),
            ('Table formats', 'get_started/table_formats.html'),
            ('Scenarios', 'get_started/scenarios.html'),
        ]),
        library_section('docs', 'Docs', 'user_guide/index.html', [
            ('Data sources', 'user_guide/parsers/index.html'),
            ('Inspecting and exporting', 'user_guide/inspection/index.html'),
            ('Transformations', 'user_guide/transformations/index.html'),
        ]),
        {'key': 'explorer', 'label': 'Database explorer', 'active': True,
         'url': app.builder.get_relative_uri(pagename, 'resources/data-explorer/scope'),
         'children': explorer_links},
        {'key': 'resources', 'label': 'Resources', 'url': tutorials, 'children': [
            {'label': 'Tutorials', 'url': tutorials},
            {'label': 'Teaching', 'url': master + 'resources/teaching.html'},
            {'label': 'Projects & Publications', 'url': master + 'resources/projects_publications.html'},
            {'label': 'Downloadable material', 'url': master + 'resources/material.html'},
        ]},
    ]
    page['home_url'] = master
    page['changelog_url'] = master + 'changelog.html'
    root = app.builder.get_relative_uri(pagename, 'index').removesuffix('index.html')
    context['mario_versions'] = {
        'current': channel, 'label': 'Dev' if channel == 'dev' else 'Latest',
        'document': pagename, 'catalogue': root + '_static/docs-versions.json',
        'revision': revision[:7],
        'source_url': 'https://github.com/it-is-me-mario/database-explorer/tree/' + revision,
        'choices': [
            {'key': 'latest', 'label': 'Latest', 'url': site_root},
            {'key': 'dev', 'label': 'Dev', 'url': site_root + 'dev/'},
        ],
    }


def setup(app):
    app.add_css_file('docs-versions.css')
    app.add_js_file('docs-versions.js', defer='defer')
    app.connect('html-page-context', page_context, priority=900)
    return {'parallel_read_safe': True, 'parallel_write_safe': True}
