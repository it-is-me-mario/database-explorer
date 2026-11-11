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

The public Download MARIO code button is owned by ``mario-code-guides.js``.
It produces one ``.py`` per database with literal public parser calls, an optional
year loop and the selected indicator through MARIO APIs. GHG examples use the
bundled database profile in its native units and state its gas scope. The numerical
comparison can use a separately documented broader characterisation; do not claim
exact chart reproduction from these guides. Keep them readable native analysis
guides. Do not add chart assets, manifests, config files or recipe packages
to this download. ``check_guides_and_sector_proxies.cjs`` verifies the actual
archive, a common manufacturing comparison, and REX3 heatmap data/label geometry
in the normal browser suite. ``reproduction-download.js`` supplies only its ZIP utility to
this flow; its older exact-chart machinery remains for legacy regression fixtures.
Check generated Python syntax and execute IOT/SUT examples against the released
library, then inspect an actual browser download for the one-file-per-source rule.


All indicators have the same How it works anatomy: coverage, accounting,
database-specific recipe table, reference series, and downloads. Do not add
special top-level disclosures for a single provider. ``comparison-guide.js``
owns the schematic definitions, ``compare.rst`` the common explanation, and
source-specific facts remain in the reviewed reading recipe metadata.

Canonical executable Python lives under
``doc/source/_static/reproduce/recipes/``. Keep source adapters/tax bridges in
``databases/``, indicator functions in ``indicators/`` and numerical/unit checks
in ``common/``. ``economy_browser.py`` remains a compatibility entry point for
historical collectors. ``pipelines/public_accounts.py`` resolves reviewed monetary source jobs through
``pipelines/account_jobs/catalogue.py``; the historical ``accounts`` CLI forwards
to it; the trade collector imports the same public-flow
aggregation primitive as downloaded code. Work on one source/year at a time.

``build.py`` generates the downloadable source manifest and checksums after
Sphinx copies the canonical files. The legacy ``reproduction-download.js`` exact-chart API packages configs and
entry scripts with these files for its regression fixtures. Both individual-reading scripts and
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
Footprint calculations retain producer and consumer geography, use public
``calc_m_from_z``/``calc_f_from_z`` without constructing a full inverse, and
reconcile each producer-origin sum independently. Signed final demand is retained.
Unrepresented production accounts and upstream requirements outside observed
final demand stay quantified production-origin residuals;
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

For the reviewed FIGARO series, use ``python -m pipelines.refresh_figaro
--source-root /path/to/databases`` to stage and independently audit changed local
CSV caches; add ``--publish`` only when intentionally replacing the numeric
snapshot. The helper compares native geography, sectors, income rows and units,
retains the prior checksum and classification-vintage link, and skips identical
source files. Then recollect the corresponding country accounts and rebuild.

Before expanding account years, inventory the local source files against each
reviewed production recipe and expand the per-source job list. Use
``public_accounts --source-root /path/to/databases --source <family> --resume`` to process missing observations and retain
completed years. The aggregate reconciliation test compares the manifest against
the full reviewed job list, so an incomplete collection cannot pass as a complete
time series. Audit source-vintage mismatches explicitly; never copy a neighbouring
year or interpolate an uncollected account.

For temporal account comparisons, calculation notes identify each reading and
its observed years; a residual must never lose its source/year when grouping
notes. Keep these labels in downloaded chart notes as well as the explorer.
When extending years, execute a downloaded historical reading with same-year
population/conversion inputs in addition to verifying manifest completeness.


Annual monetary Trade collection
-------------------------------

``pipelines/trade_jobs/`` owns the per-source annual lists and exact local filename
selection from reviewed reading provenance. Keep standard FIGARO reading identities
stable even though its production recipe has an empty release label. Keep WIOD
previous-year-price readings outside these nominal trade comparisons. REX/E3 and
EMERGING benchmark years must not be expanded into fictional annual series.

FIGARO annual jobs cover industry IOT, product IOT and SUT for each reviewed year.
The supplied ``FIGARO/SUT/<year>`` directories also contain industry IOT caches;
the 2024 product IOT is supplied there too. Folder names do not determine the
native format: retain the production recipe's explicit parser options. Preserve
previous product job IDs and their source layout. The collector verifies the
selected economic CSV pins against the reviewed numeric reading and records
only those caches and their metadata companions, excluding unrelated matrices
in the same directory. A changed pin requires the existing FIGARO refresh audit.
Finalization also compares intermediate and final domestic use separately, plus
domestic/imported final demand by consumer, against the independent account
snapshots. This catches component cancellation and shifted bilateral imports
that a grand total would miss; signed values and same-year currency conversion
are retained.
Annual public Python guides select ``SOURCE_PATH / str(year)``; E3 keeps its
archive root. Verify a downloaded multi-format guide on actual IOT/SUT inputs.

``trade_collect --family <source> --years <observed years> --resume`` selects
collection work. Each process reads one source/year at a time. Distinct jobs may
run concurrently with bounded memory; the manifest rebuild is locked and individual
JSON replacement is atomic. Finish with ``python -m pipelines.finalize_trade``:
it requires all reviewed jobs, refreshes source terms, and independently reconciles
monetary country-use totals where country accounts exist. A manifest-completeness
test prevents missing years being mistaken for a finished collection.

GLORIA uses one bounded pass through the selected T/Y members and retains exact
S/U/Ya/Yc source cells for a small direct-flow check through public ``calc_trades``.
The slice is not a closed technology model and must never be inverted or used for
production/footprint indicators. Compare every bilateral cell of a new extraction
path with an already reviewed full pilot before expanding its use. Hash selected
members while parsing; record both archive and member names with each SHA256,
without rereading unused markups. Private aggregate caches bind member identity,
axes and goods selection, and retain their member fingerprints.

Downloads use the reading's canonical production recipe identity and concordance.
For monetary Trade, unrelated WIOD/ADB satellite companions are omitted; supported
large parsers may select only the requested countries because direct bilateral
flows do not require a complete technology system. Never apply this shortcut to
footprints or other upstream indicators. Verify downloaded historical OECD and
WIOD bundles on real inputs, including the goods proxy and SUT.

Expand MRIO years independently from Comtrade collection. The browser must show
no reference band, hover values or numerical substitute for an uncollected
country/year/reporting side. Keep the documented reference reporters and years
explicit when the MRIO series is broader. Preserve the original two-year marker
regression, and separately check the full year selector and historical downloads.

The optional python-calamine reader is confined to the ADB monetary-Trade adapter
when installed with a compatible pandas version. Validate all bilateral cells and
both scopes against a reviewed ordinary-reader pilot before using a new reader.
Every newly collected ADB reading also reconciles native income rows by country
and sector to its reviewed production snapshot. Record the actual reader in
provenance; ordinary reproduction remains possible without the optional package.

For GLORIA, ``--gloria-reader polars`` uses the validated optional CSV reader in
``requirements-dev.txt``. It stages only the selected member, SHA256-hashes bytes
during extraction, then reads ordered Float64 batches. Temporary members are
removed after each pass. Keep ``POLARS_MAX_THREADS`` bounded for concurrent jobs
and record the actual reader in cache/provenance. Both CSV backends are tested
on plain and archived inputs; compare every real pilot bilateral cell and both
scopes before changing a backend. Incomplete private caches are recomputed from
source, never treated as observations or filled with zeros.

Comtrade collection defaults to observed MRIO-manifest years; ``--years`` selects
an explicit period. Cache complete queries and preserve already published query
snapshots when their raw response is unavailable. Reject truncated, non-finite or
wrong-scope responses as whole queries, retain reported zeros, and distinguish
no-data responses from HTTP/provider failures. Rate-limit all network calls and
stop new requests after a provider block or consecutive failures. Publish only
valid observations; record requested/observed years and request status. No visitor
or ordinary build calls the API. Country-code conversion is cached independently
from data observations.

Before enlarging original-reference downloads, review the official
`redistribution guidance <https://uncomtrade.org/docs/re-dissemination-of-data/>`_
and `public preview scope <https://uncomtrade.org/docs/data/>`_. Enforce the
collector's original-record ceiling and preserve ``Source: UN Comtrade.``
attribution. Product source tables show terms labels/links, not permission prose.
The browser source table derives reference years from actual observations rather
than a hard-coded pilot period. Missing reporting sides remain gaps.

Use provider ``reporterISO``/``partnerISO`` when present, otherwise the official
``partnerAreas.json`` metadata, when normalising Comtrade reporting areas. Retain
original numeric codes and names, and the metadata query, date and checksum. UN Comtrade area codes
need not equal UN M49 country codes (for example, reporting area 842). An
unresolved/historical area must not be mapped onto one successor country.
Increment the normalisation version when this mapping changes; reprocess raw
cached queries and fetch missing raw responses rather than reusing incomplete
legacy normalised snapshots. Verify an official-ISO reporting-area case and an
unresolved area in the collector tests.

The public preview can omit ISO fields. Verify this case against official area
metadata, rather than assuming an M49 converter covers every reporting code.
Exclude historical and unspecified areas even when their metadata carries a
current-country ISO alias. Reviewed composite reporting areas retain their full
boundary qualification (for example USA, Puerto Rico and US Virgin Islands);
never split them across countries. Keep qualifications in comparison notes, CSV,
PNG credits and downloaded charts. Withhold a reporting-side group sum when a
qualified area appears on a multi-region axis whose compatible boundaries
cannot be established; preserve the reason even when no reference survives.

Validate goods proxies against each classification revision, including native
combined section labels. ADB uses ``nace-1.1-adb``: manufacturing is D and
agriculture/fishing is A+B. A combined group is eligible only when every
constituent section belongs to the goods proxy. Keep collector and downloaded
selection logic aligned; independently inspect the selected native labels.

EMERGING-E Trade uses only the supplied V3 release (displayed E3.0, year 2018),
with its own MRIO_Z_E/MRIO_F_E layout. Native countries come from the adjacent
Figure data.xlsx; retain its checksum. Verify the economic MAT checksum and
country/sector axes against the reviewed production reading, and independently
reconcile all native income rows before publishing. Check country aggregation
against public calc_trades with variant=E and load_co2=False. Do not project
emissions for a monetary Trade reading or invent a goods proxy without a reviewed
classification concordance. Execute its downloaded bundle on the real latest
source, retaining the figure workbook beside the MAT file.

Browser CSV checks must retain the last record when an export has no trailing
newline. Verify the last selected release against its aggregate snapshot as
well as the first, including quoted provenance fields.

The EMERGING-E workbook uses title-case sector labels while the released built-in
classification uses lower case. Its monetary-Trade adapter permits only a
case-folded, bijective match in the same native order when checking units. Keep
unit values strict; changed order, extra labels and ambiguous aliases must fail.


Public IOT/SUT indicator collection
----------------------------------

``pipelines.public_accounts`` resolves actual monetary source files through
``account_jobs/catalogue.py`` and collects direct indicators independently from
footprints. A footprint failure must never remove X/Xc or native U/Z and Y/Yc.
Audit every expected metric error before reporting coverage complete. Reconcile
reviewed native income with the frozen production reading before publication;
footprints additionally reconcile allocated plus unallocated value added by origin.
Never use a country slice as a closed production system.

``recipes/indicators/public_accounts.py`` owns the released-API calculations;
``demand_categories.py`` owns exact source-label aliases. The UI exposes one common
category menu. Households + NPISH combines observed native consumption columns
once: OECD HFCE already includes NPISH for some economies, so a universal
household-only comparison is not supported. EMERGING keeps its reported household
amount with an explicit undocumented-NPISH-boundary qualification; never infer a
zero NPISH account or claim complete SNA equivalence. ``consumption_note`` supplies
the same qualification to published notes and standalone source cells. Schema 2
account snapshots use ``households_npish``; when migrating prior aggregates, verify
that the observed component sum matches exactly and every Total, other category,
footprint and residual remains unchanged. Do not race a live collector publication.
Gross capital formation combines fixed investment, inventories and valuables; do
not fabricate a split for a source that publishes only capital.
Domestic use is the domestic region-to-itself part of Z/U and Y/Yc. Its final
component is the Domestic component of total final demand, not all final demand.

``source-recipe.template.txt`` and ``source-recipes.js`` produce transparent
cell-based scripts and notebooks per reading. ``build.py`` inlines the canonical
public-API helpers and adds the template checksum to the reproduction manifest.
Execute both the source cells and the selected-chart runner on real IOT and SUT
inputs when changing them. Keep full native systems for footprints, source
companions explicit, local paths editable, and unallocated residuals visible.

EMERGING macro producing-section reviews live in
``doc/classifications/sectoral/emerging-sections.json``. Apply them with
``python -m doc.scripts.emerging.sections``; the EMERGING publisher uses the same
function. These unions do not add fine CPA/NACE class equivalences or economic
allocation weights. ``build_sector_correspondence.mjs`` regenerates the macro
workbook; ``SECTOR_PREVIEW_FAMILY`` restricts optional render previews, not sheets.
Inspect the changed sheets and the error scan before replacing the public workbook.


Native boundary residuals and collection phases
---------------------------------------------

A zero-output intermediate user can still purchase inputs. Those requirements
cannot be divided by that user's output and do not reach observed final consumers.
The accounting helper traces the independently formed native boundary vector
``x_reference - z @ x_reference - Y_total`` through the same public multiplier
system. Keep its upstream contribution separate from direct unrepresented native
accounts; do not insert it into Y, alter a diagonal, clip signed values, or call it
an observed consumer footprint. The analogous SUT system uses ``u @ s``, Xc and
Yc. Absolute native V/E and original X/Xa/Xc references are preserved when large
transaction storage is released after the direct indicators.

``footprints`` combines requested origin-specific direct rows in one public
linear solve, then separates VA and GHG units, production checks and errors.
VA-only calls use ``calc_m_from_z``; the combined extension system uses
``calc_f_from_z``. The two matrix APIs implement the same linear operation. An
unusable GHG characterisation must not suppress native direct indicators or VA.
The downloaded selected-chart runner uses these APIs as well, including gross
GHG trade; it does not invoke the historical bespoke IOT solver.

``doc/account-collection-scope.json`` records required direct readings and the
latest available footprint year for each indicator/release/native format, plus
explicitly approved historical batches. The source and extension can have different latest years. The default collector
follows this priority; ``--all-footprints`` opts into deferred footprint work,
including historical readings.
A requested footprint deferral stays explicit in the scope inventory and reading
provenance while retaining valid direct accounts. Resuming a deferred reading
requires a targeted ``--all-footprints`` invocation; an interrupted solve has no
intermediate numerical checkpoint and must be recomputed from its exact inputs.
After successful collection, clear the deferral in the scope, reading provenance
and coverage explanations, then rerun their verification together.

``--direct-only`` omits optional EE companions, including matching IOT satellites
for monetary SUT indicators. GDP tax-bridge checks still require their original
companions. The source classifier and shared SNA menu do not fabricate a split
for a one-category final-demand source such as REX3.

A corrupt or unavailable source is an explicit inventory observation with no
numeric metrics, rather than zero-filled accounts or a neighbouring year.
Keep the reason in its chart/CSV gap note. Audit required failures independently
from deferred historical work before reporting completion; preserve the latter's
private diagnostic records for resumption.

``pipelines.gloria_accounts`` expands direct GLORIA demand categories with one
bounded Yc pass, reusing complete U/Yc country totals from validated Trade. Full
public-API pilots must match every country and category before expansion. Bind
reused T/Y sums to the archive SHA256, or to the previously validated member
identity/cache and a newly checked Y-member SHA256. This shortcut is confined to
direct indicators: a footprint always uses the complete production system.
The source-cell download still uses the released public parser and native Xc/U/Yc.

The local accelerated runtime can use an isolated copy of the pinned released
MARIO wheel with an already installed UMFPACK runtime. Check ``mario.__file__``
and version so an editable library checkout is not executed accidentally; record
Python, pandas, NumPy and compute settings in observation provenance. Keep these
local paths outside published files and source-download bundles.

Successful parser calls apply their compute profile to the active Python session.
Public matrix helpers inherit those settings unless their call options override
them. A collector override must therefore be passed to the matrix call itself;
setting only the global solver before parsing can be superseded by the parser.
The default footprint strategy is direct; the collector accepts
``--solver umfpack`` when that optional backend is available. A factorization
can exceed available RAM even when its input fits. For an explicitly selected
SciPy iterative calculation, ``--strategy iterative --refinement-steps 1`` solves
the equation residual once through the same public API. This numerical correction
is separate from the native accounting boundary residual. Store the effective
solver, strategy and refinement count with the recipe for exact downloads.
A standalone all-indicator companion downloaded from Trade uses the same reading's
collected footprint compute options; the selected Trade runner retains only its
own economic inputs. Resolve this from the loaded account inventory, without an
extra network lookup or a neighbouring source/year fallback.
Record the effective backend and retain the independent origin reconciliation.
An iterative stopping criterion is not a substitute for that accounting check.

On macOS, RSS alone can understate a process's compressed or swapped memory.
Inspect its current and peak physical footprint before scheduling another large
source job. The released SciPy projected solver prepares sparse coefficient
systems for its singularity check and solve, so an iterative strategy can still
have a large temporary CSC-conversion footprint. Keep large models sequential;
an active conversion is not evidence of a failed or stalled solve.

Trade All origins/destinations expand against each reading's complete native axis,
including intact aggregates, rather than the union of ISO countries in the picker.
Use the same native pairs in aggregation and code downloads; remove native
within-region pairs first. No Comtrade World total may be inferred by summing
collected partner subsets. Keep the missing World-partner reason in goods-proxy
CSV reference fields as well as the chart; all-sector CSVs have no Comtrade fields.
Database/version options follow the dimension filters
in a native details disclosure, initially closed; keep it keyboard accessible and
preserve its open state while filters update.

When an update changes native region order, reorder every preserved bilateral
axis and every production-origin residual/proof vector before retaining it.
Country-keyed rows alone do not preserve a matrix's positional geography.
Carbon-trade snapshots record their explicit region order; the static-site check
requires it to match the account rows. Verify a downloaded bilateral result on
real inputs after updating the direct-account collection path.

If a required local archive is corrupt, recover only the exact pinned official
release/year into a separate private cache. Verify its full published checksum
and independently reconcile the existing production reading before replacing an
unavailable inventory marker. Keep the supplied file intact, and publish only
the official URI/checksums, never the private recovery path.

Legacy full-parser snapshots can retain float32 aggregate rounding even when
annual native-block collections use float64. Do not weaken an income or footprint
check to accommodate it. ``python -m pipelines.refresh_gloria --source-root
/path/to/GLORIA/060 --year 2024`` stages native indicator blocks in float64, checks
the unchanged GDP tax-source identities and rereads all five final valuations.
Use ``--publish`` only after inspecting its validation. This updates numeric
snapshots and their parser precision; native classifications and workbooks remain
frozen. Browser summary assets are regenerated by the ordinary HTML build.

EMERGING collection requires an explicit CO2 companion path when loading emissions,
verifies the frozen economic and CO2 input hashes separately before parsing, and
records them per metric. A matching country income total alone
does not prove that the technology or environmental source vintage is unchanged.

Native finite checks precede aggregation, because pandas sums otherwise skip missing
cells and can publish a partial sum as a valid account. Inspect dense columns and
sparse stored values/implicit fill semantics without allocating a mask or copy of
the entire native transaction matrix. Sparse multiplication retains the labelled
inner axis and rejects missing or ambiguous nodes. Cover observed NaNs in native
flows, output, income and environmental accounts as well as structural sparse zeros.

A direct-account refresh or failed footprint retry preserves the compute options
of retained successful footprint values. Selected footprint downloads use their
per-metric compute provenance when available; a new attempt is not provenance for
an older published result.

Required latest footprints retain independent allocated and production vectors for
replaying origin conservation. A historical collector may have executed that check
without retaining the vectors: identify this explicitly in the reading's provenance,
keep its global and boundary-component checks, and never reconstruct an allegedly
independent allocated vector by subtracting a residual from production. The current
verification permits only the specifically documented legacy reading; new collection
must persist the complete evidence.


Classification overview annotations
-----------------------------------

``database-scope.js`` keeps marker families and their licences separate from
annotation groups. REX3 has its own annotation; standard FIGARO remains separate
from the nearby EXIOBASE industry and FIGARO E3 classifications. Annotation
sharing does not change native geography, sector counts or the family legend.
Recalculate placement on width changes and when restoring a hidden scope tab.

After the build, run ``node doc/scripts/check_scope_annotations.cjs`` against
``EXPLORER_PREVIEW_URL`` with ``EXPLORER_BROWSER_CHANNEL=chrome`` when using
an installed Chrome. Inspect its desktop/tablet/mobile screenshots in both themes
under ``EXPLORER_QA_DIR``. Check the four specific annotations, marker visibility,
year-filter wording and the absence of connector lines together with
``node --test tests/docs/test_database_scope.cjs``.


Common comparison sections
--------------------------

Numerical comparisons use the user-selected main-activity/product proxy policy.
``common-nace2-proxy-reviews.json`` records exact native identities, the original
concordance scope, proxy assignments and boundary notes. Preserve whole native
categories once and retain genuinely inseparable broad groups. The fine
classification explorer retains its original reference correspondence routes.

``doc/scripts/build_common_sector_sections.py`` owns the common-section asset;
``doc/classifications/sectoral/common-nace2-macro-reviews.json`` contains separate
editorial macro reviews with exact native identities and cited source evidence.
Keep this comparison reference separate from the fine classification explorer's
reference revisions and from the original ``sector-sections.json`` mappings.
Matching letters from different classification editions is not a concordance.

The common asset shares native-axis definitions across reading IDs and stores
evidence and qualifications in separate registries. Resolve the definition and
reference together, including additional SUT axes; never substitute Activity for
Commodity because the names happen to coincide. Preserve exact labels and
codes, combined native groups, and explicit unassigned categories. A reviewed
classification route can describe possible native scope without proving complete
membership in a target section. Keep this interpretation visible in numerical
selection, exports and any subsequent macro-proxy review; do not turn link counts
or candidate correspondences into allocation weights.

Regenerate with ``python doc/scripts/build_common_sector_sections.py --audit
/path/to/private-audit.json`` and run
``pytest tests/docs/test_common_sector_sections.py -q``. Inspect every changed
native axis, unresolved group and revision boundary in the audit. Generation
success alone does not establish numerical comparability.

``build_sector_correspondence.mjs`` accepts the common asset as its optional third
argument after the original native mapping and output directory. It preserves
the source-specific sheets and adds common sections, native groups, exact reading
identities and provenance tables. Generate the workbook using the same common
asset as the browser, inspect the changed sheets and error scan, then replace
the downloadable ``sector-correspondence.xlsx``. Keep render previews outside
the published data directory. ``SECTOR_PREVIEW_FAMILY=Common`` limits previews
only; it must not remove native sheets from the workbook.


Embodied trade and supplying-sector results
------------------------------------------

``pipelines.embodied_trade`` collects the latest reviewed upstream indicators and
explicit historical batches listed in ``doc/embodied-trade-scope.json``. Project native Z/U and Y/Yc onto
destination regions before releasing transactions. Retain origin-specific VA/GHG
multipliers, these supplying-node projections and compact direct aggregates in a
private cache, so a later reviewed sector mapping does not require another solve.
Never publish these multipliers or native-model caches. Published results belong
to the separate embodied-trade manifest, with lazy files for atomic sector groups.

For value added embodied in gross trade, Domestic identifies value added generated
in the exporting native region; Foreign is generated elsewhere and Total is their
sum. Supplying-sector selections restrict the output crossing the border, while
its upstream content includes all producing industries. Final-demand sector
footprints use the same supplying-node boundary. Direct final-user emissions
have no observed supplying-sector allocation: retain them once in the full GHG
footprint and separately from its sector slices and embodied trade. Gross trade
can count content at repeated border crossings; preserve that interpretation in
notes, CSV, PNG credits and downloaded charts.

Cache identities bind actual economic and companion digests, frozen reference
pins including matching-IOT archives, numerical recipe dependencies, preparation
functions, compute settings and runtime. Exclude hidden cache directories from
source inventories. Where a parser accepts a release directory, explicitly retain
the broader inventory qualification rather than claim every hashed file was used.
Load checksum-verified arrays without pickle and recheck native VA/GHG/EY against
the frozen production reference on both fresh results and cache reuse. A matching
global income sum alone does not establish the source technology or EE vintage.

``--cache-only`` saves validated reusable computations; ``--totals-only`` publishes
without resolving a pending sector mapping. Normal collection emits every atomic
group, including an unassigned group where present. Partial required-metric failures
retain successful results and still return a failing status. Keep explicitly
deferred sources separate from failed and uncollected readings; do not restart a
deferred source as a side effect of expanding another indicator.

Mixed-unit upstream calculations require a unit-rescaling check as well as origin
conservation. In particular, a SUT activity supplying unlike commodity units can
introduce an arbitrary allocation through its activity-output denominator. Review
the actual native supply pattern before accepting such a source. Report physical
output gaps by native unit; never add them into a monetary gap. Direct monetary
output/use sums remain unavailable for mixed-unit source axes.

``account-model.js`` resolves shared mapping definitions and merges only observed
metrics with existing country accounts. Preserve reading identity, native format,
valuation, GWP and per-metric compute provenance. Selected downloads freeze the
supplying ``sector_labels`` and exporter-relative ``tradeOrigin``. The original
source-section mappings remain available for reproducing existing monetary-Trade
goods proxies; a new common mapping must not silently change their frozen scope.
Standalone scripts and notebooks contain separate source and indicator cells,
with source-appropriate companion placeholders and visible public-API helpers.

Run the public-account and embodied-collection Python tests, common-mapping tests,
Node/browser checks, and ``check_site.py`` on the actual build. The site checker
replays native-axis, VA-component and atomic-sector reconciliation; each published
footprint/trade pair requires an origin proof linked to its published residual and
global footprint, excluding direct final-user emissions from upstream allocation.
Check actual account fields as well as advertised metrics, and require the manifest
and parent reading to agree on every declared sector group and shard; removing all
shard references must not bypass completeness checks.
Execute actual downloaded IOT and SUT source cells and selected-chart runners on
the frozen inputs. Distinguish these real-source runs from fixture tests, inspected
code and provisional classification previews when reporting verification.

The ordinary account browser regression verifies the sector availability actually
published in that build; a totals-only inventory must keep the selector disabled
and still provide working whole-economy downloads. Test unpublished sector work
explicitly with ``EXPLORER_EMBODIED_SECTOR_QA`` pointing to one or more private raw
replay folders (separated by the platform path delimiter). The separate
``check_embodied_sector_browser.cjs`` overlays those observed cached results only
for its browser session. Its report distinguishes public availability from private
sector tests, and checks all VA origins, indivisible groups, lazy shards, GHG
availability and qualification text through the chart, CSV and code download.
Do not describe an omitted private replay as a successful sector test.
Origin-proof replay uses the same combined absolute-plus-relative tolerance as
the collector. Keep that convention consistent when comparing large monetary
values after native-to-base-unit conversion. Do not replace it with a maximum
of the two tolerances, and retain rejection tests just beyond the combined limit.

Use ``--audit`` for a read-only comparison of required latest metrics with the
published inventory, and add ``--require-sectors`` for sector-phase completeness.
``--publish-cached`` validates a recorded cache against current recipe, code,
runtime, compute settings and frozen source pins before publishing; it must not
open raw source files or call a parser. Verify its array checksum and production
references again. Unknown or older keys fail explicitly. Keep numerical producer
files frozen while long workers run: their code identity must describe the code
actually executing, including when raw fingerprinting takes a long time.


Lossless publication assets and downloaded figures
-------------------------------------------------

``build.py`` retains canonical JSON and compresses sufficiently large data assets
only in the built site. ``_static/json-assets.json`` maps their logical paths to
gzip transports with original byte lengths and SHA256 values. Keep the registry,
small assets, benchmark downloads and reproduction source files plain. Validate
the entire previous transport registry, including canonical paths and resolved
containment, before any compression or stale-file cleanup. Validate decompressed
bytes before removing a built raw counterpart. The build enforces
its configured size budget; check the official
`GitHub Pages limits <https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits>`_
when changing publication assumptions. Do not round values or discard observations
to fit hosting limits.

``json-assets.js`` is registered before data readers and owns local JSON loading.
Readers for Compare, classifications, geography and environmental extensions share
its registry and in-flight requests. Inspect gzip magic because HTTP decoding may
already have happened, then verify original length and checksum before parsing.
Unsupported native gzip and invalid transports produce visible errors; they must
not become zero observations or an unnoticed raw fallback. A transient registry
failure may be retried. Local evidence links resolve through the same registry
and identify compressed JSON downloads explicitly; external sources and Excel
downloads keep their original URLs. Reproduction Python/JavaScript/text checksums
remain separate from data-transport checksums.

The build captures a manifest-consistent embodied dataset while collection may
publish new reading IDs. A later source manifest belongs to the next build; never
copy a newer manifest without all its referenced files. Serialize builds with
replacement of existing reading files: this copy is not a transaction across
rewritten totals and shards. Use a fresh output tree after removing canonical
assets, as with other Sphinx static files.

``check_site.py`` validates every registered transport and reads numerical assets
through their logical paths before replaying aggregate proofs. The Python JSON
asset tests and common-section tests are part of the ordinary CI pytest run.
``npm run test:browser`` includes compressed-reader and classification-annotation
checks using temporary local servers by default. Inspect the gzip evidence labels,
actual code downloads, error states and annotation screenshots, as well as the
usual Compare layouts. A successful decompression test alone does not establish
correct browser wiring or correct source values.

Downloaded ``chart.html`` rebuilds chart geometry at the current viewport width.
Retain semantic title/subtitle text, GWP and attribution without restoring frozen
desktop axes, margins and height. Width changes must redraw while height-only
notifications do not loop. Run ``node doc/scripts/check_reproduced_chart.cjs
/path/to/executed-download`` on a bundle with independently calculated
``results.js``; this check renders existing values and never runs a source solve.
Inspect actual SVG title/subtitle bounds at narrow widths, not just page overflow,
and confirm that embodied trade keeps its Intermediate/Final stacks.

Implicit source companions
--------------------------

GLORIA and EMERGING parsers discover some metadata beside their economic input.
An economic-file checksum alone therefore does not identify the complete parse.
For embodied collection, prepare a private inventory whose ``recipe.input_layout``
uses ``kind: isolated_directory``, a complete ``files`` list, and one-to-one
``bindings`` from parser roles to plain filenames. Copy the same public-safe layout
into the original recipe retained for downloads. Supply only those files or
symlinks in a dedicated directory; keep raw paths out of published metadata.
EMERGING layouts must explicitly declare absent label/Figure workbooks. When
EMERGING-E uses the released built-in sector list, identify that fallback and do
not claim that an absent sector workbook was consumed.

``pipelines.input_layout`` checks the released public detectors before collection,
including GLORIA discovery in parent directories. Every selected resource must
be a declared child of the dedicated directory. It also checks metadata hashes
and GLORIA's retained ZIP member names, sizes, compressed sizes and CRC32 values.
Those member signatures establish the retained member inventory; they are not a
historical whole-archive SHA256. The ordinary collector still fingerprints the
actual archive bytes. Multiple selectable companions, or two role names pointing
to the same physical file, are rejected before a large calculation.

If a metadata workbook has different bytes, retain its original pin. Accept an
observed replacement only after an explicit independent comparison of every
parser-consumed ordered set and unit, with native account-row checks where needed.
Record both hashes and the comparison evidence in ``metadata_equivalence``. Do
not describe the entire workbook as identical or guess why its bytes changed.
Downloaded source cells and selected-bundle READMEs retain the full-source file
list, absence requirements and metadata boundary; distinguish optional GHG
companions from metadata needed even for a value-added calculation.

``--publish-cached`` validates the declared closure against stored input receipts
and current frozen metadata/member declarations without reopening raw inputs.
It does not assert that the original source directory still exists. ``--audit``
remains a separate read-only coverage check. Run
``pytest tests/recipes/test_input_layout.py tests/recipes/test_embodied_collection.py -q``
when changing this workflow. Keep preflight-only checks outside numerical producer
functions; do not edit the canonical recipe tree or shift inspected producer
function definitions while a long-lived collection worker is fingerprinting or
solving.

The selected-download builder has a narrowly pinned GLORIA compatibility step:
released MARIO rejects ``satellites=False`` and an empty selector. After verifying
the canonical source checksum, the builder removes the known invalid override
from the packaged selection runner and retains the configured valid selector.
It records the canonical and resulting SHA256 values in
``download-compatibility.json`` and explains the change in the ZIP README. Both
selection launchers use that packaged module. No MARIO function is patched, and
the collection recipe tree remains unchanged during active numerical jobs.
``test_reproduction.cjs`` checks the exact permitted source versions, Python AST,
forwarded parser options and both launchers; an unreviewed runner version fails
closed. Coordinate a later canonical cleanup with this explicit compatibility
record and the numerical cache contract.

For a declared isolated layout, generated full-source scripts verify the complete
file inventory, unique physical inputs, explicit and detected companion paths,
absence roles, and reviewed small-workbook hashes before the literal public
parser call. Companion path defaults derive from the declared source directory.
This bounded guard does not authenticate all large matrix contents. Historical
GLORIA scripts without a reviewed layout have a narrower satellite-presence check:
TQ and YQ must both exist for a full-source GHG calculation, preventing missing
satellites from becoming placeholder zero emissions. Do not describe that legacy
check as an exact metadata-identity audit. Exercise the generated code itself on
small fixtures and real metadata, stopping before transaction reads when a full
source rerun is unnecessary.


Comparison legend dimensions
----------------------------

``comparison-legend.js`` owns available legend choices and the common grouping of
selected sectors. The browser keeps ``legendBy`` separately for each indicator.
Account and embodied-Trade models expand contribution origin, supplying sections
or use only when requested. Coalesce whole native combined groups across selected
readings before creating sector legend rows; never split a native category or
repeat it in additive bars. Whole economy must not silently become a sector-only
footprint that excludes direct final-user accounts.

Colours and Plotly toggle groups follow the chosen dimension. Preserve values and
CSV component/sector/use identities when changing that dimension. Comtrade remains
a total-use merchandise context: hide it when only part of a database bar remains
visible, but retain it when an entire database is hidden. Temporal use-component
plots have no total Comtrade overlay.

Run ``test_comparison_legend.cjs`` and the ordinary Node checks. The browser suite
includes ``check_comparison_legend.cjs`` for real origin/sector/use switches,
conservation, source grouping, CSV boundaries and desktop/mobile layouts. Inspect
its screenshots as well as its assertions.


Approved ADB upstream histories
------------------------------

The 2017–2022 ADB 62/72-economy batch is declared in
``doc/account-collection-scope.json`` with ``upstream_metrics`` and ``upstream_phase``.
These metrics belong to the embodied publication, which also contains their fresh
footprint proofs; they do not require rewriting the legacy country-account store. ``current_scope``
retains this phase when deriving the embodied work list; do not label historical
work as the latest available year or fill unobserved dates. The existing 2023 EE
and 2024 monetary readings complete their respective published series. Economic
and Air Emissions workbook pins are checked independently, including the reviewed
62-economy remapping into intact Rest of World.

Use exact private inventories to target the batch and the validated public-API
compute options. Keep producer functions and the canonical recipe tree frozen
while workers run. After all writers finish, rebuild the embodied manifest and
run ``--audit --require-sectors`` before building. Check all four upstream
metrics, the complete atomic-sector partition, VA origin sums and independent
production-origin residual proofs. Compare retained direct accounts and prior
footprint aggregates explicitly; a new trade result must not conceal a changed
source vintage or native total. Verify the 2017–2023 GHG time selector, 2017–2024
VA time selector, supplying-section C, origin components, CSV and the one-file
Python download in the ordinary account browser suite. ADB GHG guides select the
matching-year Air Emissions workbook inside the loop; the economic directory is
resolved by the public parser with explicit year/economy arguments.


Approved EMERGING 2.2 benchmark histories
---------------------------------------

The 2015/2018/2021 benchmark batch uses explicit ``upstream_metrics`` and
``upstream_phase`` in the account work list; the existing 2023 reading completes
this observed series. Preserve the source gaps and fossil-CO2-only qualification.
For each year, use an isolated two-file directory with the frozen economic MAT
and matching CO2 MAT, native embedded labels, and explicit absent label/Figure
roles. The reviewed 2023 input-layout contract supplies the same role structure.
Keep both input pins separate and retain the public-safe layout in the published
recipe. Run the large years sequentially using the validated SciPy iterative
strategy with one public-API residual refinement, then replay production-origin
conservation and native unit checks before publishing.

Public EMERGING guides group only observed compatible years, select
``EMERGING_CO2_{year}.mat`` inside the parser loop and apply public compute
setters after parsing. This overrides the session profile with a memory-bounded
solve strategy for upstream examples; it is a native analysis guide rather than
the refined origin-specific collector. Monetary examples do not load CO2. Check
the source's embedded-label boundary, benchmark spacing, common macrosector
proxies, exporter-relative VA components, CSV and one-Python-file download.

Sparse native-region projections use a zero-fill sparse column-to-region product
before materialising the compact supplying-node by destination array. Dense and
nonzero-fill frames retain the pandas grouping path. Preserve signed cells, row
order and whole native regions, and reject missing geography or nonfinite input.
When changing this preparation, compare all projected use and retained direct
accounts against a checksum-verified earlier cache on a real source before
restarting workers. The full-source EMERGING control must reconcile both use
components and every retained direct-account category within numerical precision.
A changed producer still requires a new cache identity;
the earlier cache is a comparison reference, never an identity bypass. Run
``pytest tests/recipes/test_public_accounts.py -q`` for signed, missing, zero and
nonzero-fill projection cases.

For bounded real-source checks of a downloaded EMERGING trade-content guide,
retain the complete native technology. Change only local paths, the selected
benchmark years and public ``clusters`` on the reported trade axes. Small groups
that preserve the selected exporter and importer allow a nontrivial bilateral
check without solving every native country pair through that guide. Compare both
Intermediate and Final components to the private projected result, using the
actual native satellite unit for conversion. Group diagonals include native
domestic use and within-group crossings; report that boundary explicitly. This
is a native API integration check, not a claim that all ungrouped pairs were rerun.

The ordinary embodied-collection tests also compare the committed work list to
``current_scope`` and require every approved published reading and sector group
to be present. An incomplete collection must fail CI even when individual existing
assets are internally consistent. Explicitly deferred sources stay outside this
required set.


Approved EXIOBASE 3.11.2 upstream histories
-----------------------------------------

The ixi/pxp historical batch is declared through ``upstream_metrics`` and
``upstream_phase`` in the account work list. The existing latest readings and
the approved history together cover the years recorded in that canonical list.
Each job selects its exact annual IOT archive and verifies the frozen whole-file
checksum. Use the reviewed native value-added rows and source GHG characterisation.
The validated direct SciPy solve supplies origin-specific VA and GHG results.

A pilot of both native IOT systems establishes numerical and memory bounds before
parallel work. Separate per-system inventories allow bounded workers with distinct
reading IDs. Keep producer code frozen during collection, wait for every writer,
and rebuild the embodied manifest before the coverage audit and build. Compare
all prior direct accounts, footprint components and intermediate/final GHG trade
by native region order. Check signed residual proofs, VA origin components and the
complete supplying-sector partition through ``check_site.py``.

Annual monetary EXIOBASE guides select ``IOT_{year}_{system}.zip`` inside a public
parser loop. The value-added trade guide sums ``calc_trades_content`` for the
reviewed factor rows. Product taxes have their own native row in EXIOBASE, while
value added at basic prices uses the separate selection stored in the recipe.
The same row selection is used for production and final-demand VA examples.
Execute the downloaded ixi/pxp guide on real historical archives and compare its
native monetary results before applying the site's currency conversion.

``check_exiobase_history_browser.cjs`` is called by the ordinary account browser
suite. It verifies every annual ixi/pxp point, NACE C, exporter-relative VA origins,
sector footprints, CSV and the one-file Python download. EUR/ECU conversion is
checked against the observed same-year reference, including the pre-euro period.

The CI workflow uses Chrome installed in the pinned Ubuntu runner family and
records its version before executing the browser suites. Playwright selects it
through ``EXPLORER_BROWSER_CHANNEL=chrome``. The official runner software inventory
is maintained in the
`Ubuntu runner image reference <https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md>`_.
If browser setup fails before tests, inspect the failed step and logs. The observed
APT failure resolving the Ubuntu mirror belongs to system dependency installation.
Keep the full browser suite enabled when correcting that installation path.


When new country accounts replace legacy footprint notes, retain the quantified
GHG residual in the rendered note. ``mergeCountryAccounts`` derives its signed
whole-source total from the published origin residual array. Label that boundary
before sector selection and preserve the per-origin values. The browser regression
and account-model test verify this disclosure after the merge.


Exclusive-family browser checks inspect the input's DOM ``checked`` property.
A partially selected database has an indeterminate checkbox, which the CSS
``:checked`` selector omits. Assert the resulting family selection before checking
CSV row counts. Annual footprint CSVs retain Domestic/Foreign components for each
native format, so compare both components against their corresponding shard values.
