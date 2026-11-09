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


Integrated comparison browser
----------------------------

Trade belongs to the shared Indicator selector in Compare databases. Its pure
aggregation and chart adapters live in ``trade-model.js`` and ``trade-charts.js``;
``economy-browser.js`` owns the shared filters, views, notes and downloads.
Keep the former Trade URL as a redirect to ``compare.html#trade``. Test switching
back to economic indicators as well as direct entry through that fragment.

Group comparisons require complete individual-country coverage on each native
reading. Remove domestic country pairs before aggregation, including overlapping
origin/destination sets. Aggregate each complete Comtrade reporting side before
forming bounds; never sum pairwise minima/maxima or partial reporting coverage.
Comtrade merchandise references appear only with the goods-producing-group proxy:
no band, hover values, table columns or CSV reference fields accompany all-sector
MRIO totals. Keep both scopes explicit. References are contextual, with no accuracy
ratio, and are hidden on the chart when only one use component is displayed.
Check scope changes as well as legend and dropdown visibility; reference bounds
must not expand the all-sector chart axis.

For this totals-only release, preserve sector controls for other indicators but
disable the Trade sector picker. Offer the native all-sector total and the
existing goods-producing-group proxy as distinct scopes, with unknown proxies
unavailable. A shared concordance lookup does not imply a
numerical HS-to-industry allocation. Do not introduce sector estimates silently.

The browser regression is ``npm run test:browser`` after building ``_site``.
Install Node dependencies with ``npm ci`` and a test browser with
``npx playwright install chromium``. Set ``EXPLORER_PREVIEW_URL`` to test an
existing local or public preview; otherwise the checker starts its own loopback
server. ``EXPLORER_BROWSER_CHANNEL=chrome`` uses an existing Chrome installation.
Screenshots go to a temporary QA directory, never published data assets.
Check rendered bar centres against category ticks for Total, Intermediate and
Final, including mobile layouts. Check annual legend toggles before and after
resizing, observed-year labels, missing groups, scope changes and restoration of
economic filters when switching back from Trade.


Indicator-first controls and explanations
----------------------------------------

``comparison-guide.js`` owns the Compare release curation, published-availability
filter, exact-release licence routing and schematic matrix definitions.
``economy-browser.js`` applies them and remembers filters separately per indicator.
Keep missing years within an eligible series so that chart gaps and CSV caveats
remain explicit. Filter version options using actual published availability;
changing an indicator must not silently substitute another indicator.
The Trade manifest's ``scopes`` field is emitted by ``trade_collect.py`` and
allows the proxy selector to exclude unsupported readings before fetching them.

``compare.rst`` owns the explanatory recipes. Three independent, initially closed
disclosures separate comparison notes, How it works and Sources & coverage.
The source table includes a licence column with the exact release label/link;
keep attribution and source notices below it, without adding permission summaries.
Long accounting recipes remain individually expandable. Matrix diagrams
are schematic definitions; never include numerical source matrices. Keep native
IOT/SUT block names, producer/final-demand axes and GDP-proxy qualifications.
Licence labels and links come from ``database_licences.json`` matched to each
exact release;
its code licence and reference-data terms are separate.

``npm test`` includes the pure availability/method checks in
``test_comparison_guide.cjs``. ``npm run test:browser`` runs Trade and then the
economic/GHG regression, each with its own temporary loopback server by default.
Both accept ``EXPLORER_PREVIEW_URL`` and ``EXPLORER_BROWSER_CHANNEL``. Set
``EXPLORER_SITE`` for an already-built tree outside ``_site``. Screenshots go to
``EXPLORER_QA_DIR`` (economic checks in its ``economy`` subdirectory); the CI
artifact includes both suites. Inspect desktop/mobile and both themes, independent
accordion state, compatible source/year choices, per-indicator restoration, matrix
format switching and release-specific licences. A successful DOM check alone is
not a visual review.

Multiselect options use the explicit ``.economy-browser .eb-picker-options label``
row layout so dimension-field label styling cannot stack and centre their
checkboxes. The browser regressions check rendered checkbox alignment on desktop
and mobile, including country, year, sector and Trade origin/destination pickers.


Modular recipes and country accounts
-----------------------------------

All indicators have the same How it works anatomy: coverage, accounting,
database-specific recipe table, reference series, and downloads. Do not add
special top-level disclosures for a single provider. ``comparison-guide.js``
owns the schematic definitions, ``compare.rst`` the common explanation, and
source-specific facts remain in the reviewed reading recipe metadata.

Canonical executable Python lives under
``doc/source/_static/reproduce/recipes/``. Keep source adapters/tax bridges in
``databases/``, indicator functions in ``indicators/`` and numerical/unit checks
in ``common/``. ``economy_browser.py`` remains a compatibility entry point for
historical collectors. ``pipelines/accounts.py`` orchestrates the small job lists
in ``pipelines/account_jobs/``; the trade collector imports the same public-flow
aggregation primitive as downloaded code. Work on one source/year at a time.

``build.py`` generates the downloadable source manifest and checksums after
Sphinx copies the canonical files. ``reproduction-download.js`` packages the
selected configs and small entry scripts with those exact files, the shared
chart adapters and GPL notice. Both individual-reading scripts and
``run_selection.py`` recalculate local values; expected aggregates are validation
targets only. Keep frozen year, region, sector, population, conversion inputs,
reference boundaries and attribution. Missing readings remain gaps. Changing
source code during a download must fail its checksum check rather than mix
versions. ``check_site.py`` verifies every packaged source checksum.

Country-account snapshots under ``_static/data/accounts`` publish aggregate
flows/results, not source matrices or coefficient/multiplier arrays. Their
manifest is the availability source. ``account-model.js`` attaches them to
existing reading identities without altering production/GDP observations.
Do not infer an uncollected account year from the production catalogue.
Footprint calculations retain producer and consumer geography, solve the
production system without constructing a full inverse, and reconcile each
producer-origin sum independently. Signed final demand is retained.
Zero-output emissions stay a quantified, production-origin unallocated residual;
never invent a final-consumer allocation. Carbon in gross trade can count
upstream emissions at multiple border crossings and has no monetary Comtrade
reference. Keep direct final-user emissions separate from traded output.

Run ``pytest tests/trade tests/recipes -q``, ``npm test``, the strict build and
``check_site.py``. ``npm run test:browser`` includes
``check_accounts_browser.cjs`` with artifacts under the ``accounts`` subdirectory.
Verify origin components, demand categories, annual-stack centring, temporal
markers, per-capita units, missing years, code downloads, sources and both themes.
Execute downloaded bundles on fixtures and on available real source files;
report real-source coverage separately from fixture runs. New classifications
or SUT model assumptions need their own reviewed adapter before publication.

When the supplied source cache differs from a frozen production snapshot, compare
its source checksum and independently reconcile income/tax rows before attaching
new account results to the same reading identity. The account collector rejects
income mismatches. Refresh the numeric observation provenance explicitly, retain
the previous checksum, and leave frozen classification extracts/workbooks intact
when native labels, geography and units are unchanged. Do not loosen a footprint
conservation check to accommodate a changed source vintage.

For the reviewed FIGARO pilot, use ``python -m pipelines.refresh_figaro
--source-root /path/to/databases`` to stage and independently audit changed local
CSV caches; add ``--publish`` only when intentionally replacing the numeric
snapshot. The helper compares native geography, sectors, income rows and units,
retains the prior checksum and classification-vintage link, and skips identical
source files. Then recollect the corresponding country accounts and rebuild.
