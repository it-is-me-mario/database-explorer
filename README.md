# MARIO Database Explorer

Independent home of the explorer extracted from MARIO 1.3.4. The target domain
is `explorer.marioproject.com`. MARIO remains the Python calculation library.

Install `requirements-dev.txt`, then build with `python build.py` and verify with
`python check_site.py _site`. Run `pytest` and the Node checks from the Pages workflow.
Source databases and API credentials are never website inputs. Published assets
contain reviewed aggregate observations, classifications and source attribution.
Data retain their individual source licences; the application code retains GPL-3.0.

The first Trade release compares annual bilateral flows for local 2015 and 2022
readings against UN Comtrade merchandise totals. Services references are deferred.
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

