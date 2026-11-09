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
stacked components; multiple years show database/version markers. The 2015/2022
pilot shows UN Comtrade merchandise export/import ranges as context only with
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
reference. `python -m pipelines.finalize_trade` checks all 13 pilot readings,
source terms and reference completeness before the website build. `--resume`
retains previously collected snapshots; use a fresh collection when reviewing
changed source inputs. No API keys or source databases belong in Git.


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
