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

Latest and Dev publication
--------------------------

``versions.json`` selects the application source for each channel. Latest at
the root pins the approved application commit, independently of the publisher
on main. Update that full commit explicitly when promoting a new application.
Dev follows its development ref under ``/dev/``. Both use ``shared-theme.json``.
Latest preserves its full indicator landing; Dev keeps its source navigation
and Classifications landing. ``publish.py`` resolves each ref once, checks out
its SHA into a disposable clone and runs that source's own strict builder and
checker. This preserves data processing, compression, licences and transports.

The publisher applies the common theme and ``publishing/explorer_versions.py``
navigation. Each channel owns its own data; Latest must not depend on Dev's
changing payload. The global Explorer dropdown follows the source's declared
tabs. Existing compatibility routes remain available.

Run ``python publish.py`` for both channels and their source checks. The
``versions-manifest.json`` records source, theme and publisher commits; each
channel retains ``site-build.json`` and extraction provenance. The common
``docs-versions.json`` inventories actual pages and anchors. Nested Dev and
retired Preview routes are excluded from Latest's inventory.

Preview is retired. Its HTML routes redirect to matching Latest pages, with a
Dev fallback for Dev-only pages. Redirects preserve queries and anchors and do
not duplicate data. Verify these old links, the two-option selector, indicator
controls, downloads, desktop/mobile layouts and links to MARIO and Tutorials.

``pages.yml`` publishes on main after push, dispatch or successful development
verification. ``refresh.yml`` detects source changes hourly. PRs build the exact
configured application sources with the candidate publisher and never deploy.
The optional ``--latest-ref`` override is for explicitly testing an application
candidate; ordinary publication and PR checks use the approved source pin.


Legacy build-only geography input
--------------------------------

Older application sources use ``country-scope.json`` while generating geography
and classification views. The runtime consumes embedded native-set profiles and
the generated sectoral snapshot. After the source checker passes, the publisher
omits the unused uncompressed country input when no built HTML or JavaScript
references its filename. The source snapshot remains committed. Its omitted
path, byte count and SHA256 are recorded in ``site-build.json``. A runtime or
download reference retains the asset. Compressed application assets are handled
by their own source builder.

Run ``pytest tests/publishing -q`` and a full ``publish.py`` build with the actual
Latest source when checking the Pages size budget. A pull-request candidate can
have a newer compression pipeline than the stable source. Verify the final
combined bytes and inspect geography, sectoral scope, comparisons and downloads
on both packaged channels before deploying.
