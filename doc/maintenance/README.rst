Explorer maintenance
====================

The application, its source-specific collection pipelines and published aggregate
snapshots belong here. The MARIO library owns parsers and accounting methods.
Use its released public API where possible and record the exact version.

The initial extraction is pinned in ``source-manifest.json``. Existing classification
and numerical snapshots preserve upstream provenance and all source restrictions.
Changes to classifications that affect MARIO's packaged concordances require a
separate reviewed update in the library repository. A website update does not
silently change the library's frozen runtime bundles.

The literal parser recipes are frozen from that same upstream commit and their
checksum is stored in ``source-manifest.json``. The explorer can collect from
those reviewed literals without copying the library's walkthrough pages. A
changed snapshot must be refreshed from reviewed MARIO sources, rather than
silently accepting a stale or missing notebook. ``database_catalogue --prepare``
belongs to the upstream notebook workflow; do not use it to regenerate recipes
from the explorer-only page tree.

Trade observations
------------------

Collect one database and year at a time. Include intermediate and final use once.
Keep native regions and components in private extraction reports, validate against
MARIO ``calc_trades``, and publish only aggregate observations with source units,
price basis, year and geography. Currency conversion requires an observed annual
exchange rate and compatible price basis. Hybrid physical units are never summed.

Comtrade merchandise exports and mirror imports are separate observations. Retain
valuation, aggregation/reporting flags, source query and retrieval time. Use cached,
rate-limited API calls. No API request is made by a visitor or an ordinary build.
Review redistribution conditions before expanding original-data downloads.

Verification and publication
----------------------------

Run focused pipeline/model tests, a strict Sphinx build, and local-link/download
checks. Inspect desktop/mobile layouts where the browser environment permits it.
Do not claim a visual review from DOM or structural checks alone.

GitHub Pages is deployed independently of MARIO releases. Verify the deployment
commit and public content. Configure the custom domain only after its DNS target
is verified. The library's old URLs remain available until a separate migration PR
is reviewed and merged; any administrator exception is specific to that PR.

Shared navigation and landing
-----------------------------

``shared-theme.json`` pins the common MARIO theme and cross-site link script.
``build.prepare_shared_theme`` imports them into the ignored build cache before
Sphinx reads its configuration. Update the pin alongside navigation changes in
MARIO and Tutorials. The extracted theme under ``doc/source/_themes`` is retained
as historical provenance and is superseded by this import. The local footer
override keeps its Changelog link on the library site.

``conf.py`` supplies the four global header sections and the local Explorer tabs.
The brand returns to the main MARIO site. ``build.py`` makes the root redirect to
Classifications while preserving query parameters and fragments. Existing deep
links retain their published routes. Check ``site-build.json`` after deployment
for the publisher and theme commits, separately from the original extraction
provenance in ``source-manifest.json``.

Run ``python build.py`` and ``python check_site.py _site``. In a real browser,
check the root landing, Classifications controls, all four header menus, mobile
widths and navigation among the three MARIO sites in the current tab.

Latest, Dev and Preview publication
----------------------------------

``versions.json`` selects one committed source ref per channel. Latest keeps
the existing root routes, Dev lives under ``/dev/`` and Preview under
``/preview/``. Preview has its own immutable theme pin in ``versions.json``;
Latest and Dev retain ``shared-theme.json``. Preview keeps its source's full
indicator landing instead of the Classifications redirect. ``publish.py`` resolves
each ref once and checks out its SHA into a disposable clone. Each clone runs
its own ``build.py`` and ``check_site.py``, preserving its data processing,
compression, download licences and exact commit-pinned asset transports.
The publisher applies the common theme and ``publishing/explorer_versions.py``
navigation around that application. It never reads uncommitted source files.
The global Explorer dropdown follows the selected source's declared Explorer
section tabs in ``mario_site``. Source builders also publish compatibility
redirects. Verify the dropdown against the source tabs even when an older page
name remains in the built document inventory.

Run ``python publish.py`` for a strict three-channel build and source checks.
The publisher writes ``versions-manifest.json`` with source and publisher
commits, and a shared ``docs-versions.json`` with the actual routes and anchors.
Each channel retains its own ``site-build.json`` and extraction provenance.
In a browser, check Classifications on both roots, page and anchor retention
when switching, fallback for channel-specific pages, narrow screens, and
same-channel links to MARIO and Tutorials. Inspect numerical controls and a
download on Dev as well as the shared header.
The common theme supplies ``partials/versions.html`` as a floating bottom-right
selector outside the header. Verify its fixed position while scrolling, its
upward-opening menu, keyboard access and clearance above the footer on mobile.
Check Preview from the other two selectors, every indicator entry, shared
classification and download controls, and navigation to MARIO/Tutorials Preview.
The catalogue must exclude nested Dev/Preview documents from Latest's inventory.

``pages.yml`` publishes from main after a main push, manual request or successful
development verification. The verification and publisher workflows have distinct
names because GitHub rejects a workflow that listens to its own name through
``workflow_run``. ``refresh.yml`` checks both source refs hourly and requests
publication when either has changed. This also covers development branches
that still contain the previous single-channel workflow. Pull requests build
their candidate as Latest using ``--latest-ref HEAD`` and never deploy.
