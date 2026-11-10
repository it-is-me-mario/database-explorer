# MARIO Database Explorer

Independent home of the explorer extracted from MARIO 1.3.4. The target domain
is `explorer.marioproject.com`. MARIO remains the Python calculation library.

Install `requirements-dev.txt`, then build with `python build.py` and verify with
`python check_site.py _site`. Run `pytest`, `npm test` and `npm run test:browser` (after building `_site`).
The browser checks cover economic/GHG comparisons, integrated Trade and the
country-accounting indicators.
Source databases and API credentials are never website inputs. Published assets
contain reviewed aggregate observations, classifications and source attribution.
Data retain their individual source licences; the application code retains GPL-3.0.

Compare starts with the indicator and offers only databases and versions with
published observations for it. Choices are remembered separately for each indicator.
EXIOBASE is curated to recent monetary releases and structurally distinct readings;
historical classification metadata remain available. Three independent disclosures
below the plot separate comparison notes, schematic calculation methods, and
source coverage with a licence column. Source matrix values are never part of the diagrams.

Trade is an Indicator in Compare databases. Select one or more origin and
destination countries, the native goods-and-services total or the available
goods-producing-group proxy, and Total, Intermediate or Final use. One year shows
stacked components; multiple years show database/version markers. The cached
UN Comtrade reference shows merchandise export/import ranges as context only with
the goods-producing-group proxy. All-sector totals have no Comtrade reference. Services
references and a detailed HS-to-industry concordance are deferred.
All origins and All destinations sum the complete native region axis of each
reading, including intact aggregates, and remove within-region flows first.
Comtrade World-partner totals are not yet collected; no partial partner sum is
substituted. Database/version choices follow the dimension controls in a
collapsible panel, initially closed.
Original, domestic and aggregate regions remain distinct. No country flow is
inferred from a Rest of World aggregate and no missing year is substituted.

`source-manifest.json` records the exact upstream extraction. Data preparation
is explicit and separate from the Sphinx build. See `doc/maintenance/README.rst`
for ownership, validation and deployment checks.

The local trade collector is `python -m pipelines.trade_collect --source-root /path/to/databases`.
For an already extracted REX3 bundle, set `MARIO_REX3_PREPARED_ROOT` to its common
root. Otherwise, explicitly extract the three supplied archives using
`python pipelines/unpack_rex.py --source-root /path/to/REX3 --destination /path/to/work`.
The collector streams the entire REX3 T/Y system and validates direct aggregation
on a source slice. It does not solve an open REX3 submodel or derive its GHG accounts.

`python -m pipelines.comtrade` explicitly refreshes the small cached merchandise
reference (reporters China/Italy; observed years recorded in its metadata). `python -m pipelines.finalize_trade`
checks all 226 Trade readings,
source terms and reference completeness before the website build. `--resume`
retains previously collected snapshots; use a fresh collection when reviewing
changed source inputs. Use `--family OECD` or `--years 2015 2022` to select work.
Source job lists are split under `pipelines/trade_jobs/`. The annual Trade series
cover EXIOBASE 3.11.2 (1995–2024, ixi/pxp), OECD ICIO (1995–2022,
Regular/Extended), FIGARO standard (2010–2023, pxp), GLORIA 060 (2000–2025),
WIOD 2016 current-price IOT/international SUT (2000–2014), and the supplied ADB
editions (62/71/72/74 economies). EMERGING 2.2 retains its four benchmark years
2015/2018/2021/2023, and EMERGING-E V3 adds 2018 (245 regions, 146 sectors).
Only the latest supplied EMERGING-E release is offered for Trade. REX3 retains 2022 and FIGARO E3 retains its 2015 formats.
The current Comtrade snapshot covers 1995–2025 for reporters China and Italy
and their collected partners. Reporting-area qualifications remain attached to
observations, and uncertain composite-area group sums are withheld. Collection
is explicit and independent of MRIO extraction. Missing references stay absent; there is no interpolation or neighbouring-year substitution.
No API keys or source databases belong in Git.


The country-account indicators use native IOT and SUT blocks: gross output is
X/Xc, domestic use retains matching origin/destination regions in Z/U and Y/Yc,
and final demand separates Domestic and Imported supply. Every source uses the
same category menu: Households + NPISH, government, gross capital formation,
and other final demand. Household and NPISH columns are combined where supplied;
OECD household consumption already includes NPISH for some economies. EMERGING
shows its reported household amount with an explicit qualification: NPISH coverage
is undocumented, so complete equivalence with the combined SNA category is not
claimed. Gross capital formation combines fixed investment, inventories and
valuables. Unobserved categories remain unavailable.

Direct accounts cover the curated monetary EXIOBASE releases and REX3, FIGARO
and FIGARO E3, GLORIA, OECD ICIO, WIOD, ADB and EMERGING, including the latest
EMERGING-E. The reviewed inventory and explicit source gaps are recorded in
`doc/account-collection-scope.json`. Footprints are prioritised for the latest
available year of each indicator/release/native format; REX3 footprints are
deferred to a later collection phase while its direct accounts remain available.
Historical footprints remain a separate collection phase. An extension may end before its monetary
source. GHG embodied in gross trade currently retains the EXIOBASE series.
Macrosector account breakdowns are not implied by country-total availability.

Value-added and GHG footprints retain production origins through public MARIO
matrix APIs and final-consumer Y/Yc columns, without a full inverse. They
reconcile independently to native production accounts by origin. Unrepresented
accounts and requirements outside observed final demand remain signed,
quantified production-origin residuals, without invented consumer allocation.
No coefficient or source diagonal is changed by the explorer.

EMERGING's goods-producing proxy uses the same NACE producing sections as the
other revision-2 sources. Reviewed whole-group section unions, including its
additional electricity groups, are in
`doc/classifications/sectoral/emerging-sections.json` and the downloadable macro
concordance workbook. These are not fine HS-to-industry allocation weights.

Download MARIO code provides `source_<reading>_indicators.py` and a matching
notebook with separate cells for the literal public parser and each indicator.
The helpers are visible and the scripts need no explorer-package import.
The ZIP also includes a script/config for each selected chart reading, modular
source adapters in `recipes/databases/`, indicator functions in
`recipes/indicators/`, and shared selection/unit checks. Edit `paths.json`, run
`python run_selection.py --paths paths.json`, then open `chart.html`.
The package validates local results against selected published aggregates,
retains gaps and source attribution, and supplies the plot's pinned references.
No source database or calculated coefficient/multiplier data is embedded.

Collect accounts explicitly with
`python -m pipelines.public_accounts --source-root /path/to/databases --resume`.
Use `--source exiobase`, `--source oecd`, or another reviewed family to select work.
The default prioritises latest footprints; `--direct-only` collects native flows
without optional EE companions, and a targeted `--all-footprints` invocation
opts into deferred footprints, including histories and REX3.
`--solver umfpack` selects the optional backend when installed; reviewed matrix
recipes default to the direct solve strategy. For memory-limited work, explicit
`--solver scipy --strategy iterative --refinement-steps 1` settings are retained
in the reproducible recipe and remain subject to the same origin checks.
The older `pipelines.accounts`
CLI forwards to this collector. Source discovery lives in
`pipelines/account_jobs/catalogue.py`; special native recipes have their own
reviewed metadata. Eora numerical results are excluded.
