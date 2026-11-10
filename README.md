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


The country-accounting pilot adds gross output, domestic use, final demand,
value-added footprints, allocable GHG consumption footprints and GHG embodied in
trade. The committed IOT country-total series cover EXIOBASE 3.11.2 ixi/pxp
(1995–2024), OECD ICIO Regular/Extended (1995–2022), and standard FIGARO pxp
(2010–2023). GHG footprints/trade currently
have reviewed emissions in EXIOBASE only. Source availability remains explicit;
SUT account pilots and macrosector breakdowns are not implied by parser support.
Zero-output GHG accounts remain a quantified production-origin residual.

Download MARIO code provides a ZIP with one small script/config per selected
reading, source adapters in `recipes/databases/`, indicator functions in
`recipes/indicators/`, and shared selection/unit checks. These same functions
collect the published aggregates. Edit `paths.json`, run
`python run_selection.py --paths paths.json`, then open `chart.html`.
The package validates local results against selected published aggregates,
retains gaps and source attribution, and supplies the plot's pinned references.
No source database or calculated coefficient/multiplier data is embedded.

Collect new accounts explicitly with
`python -m pipelines.accounts --source-root /path/to/databases --resume`.
Use `--source exiobase`, `--source oecd`, or `--source figaro` to collect one family.
`pipelines/account_jobs/` keeps the source-specific job lists small and separate.
