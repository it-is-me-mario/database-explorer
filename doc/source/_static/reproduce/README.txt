MARIO comparison reproduction
=============================
Install: python -m pip install mariopy==1.3.4
Edit paths.json with the exact local source file/folder for each reading.
Run: python run_selection.py --paths paths.json
Open chart.html to view the recomputed figure. Results are also in results.csv.
For one reading, use its run_<reading>_<indicator>.py --path /your/source.

The small scripts share recipes/databases and recipes/indicators with collection.
Expected published aggregates validate results; they are never used as computed
values. Missing readings remain gaps. Source year, geography and units are checked.
Reference values and conversion/population inputs are pinned to the selection;
no source-provider API request is made by the Python scripts.

Use source files under their own terms. Source attribution and licence links are
retained in the per-reading JSON. No source databases, coefficients or multipliers
are included. The Python/JavaScript code is GPL-3.0; see LICENSE.txt. The figure
uses Plotly 3.6.0 from the same CDN as the explorer and needs an internet connection.

Monetary Trade uses only the monetary source blocks. WIOD/ADB satellite companion
paths are not needed for it. Where supported, large source parsers select the
requested native countries for direct-flow aggregation. This does not create a
complete technology model and is never used for footprints/upstream indicators.
For faster ADB Trade Excel reading with pandas >=2.2, optionally install
python-calamine==0.9.1. The public parser and validation targets are unchanged;
without it the ordinary Excel reader remains available.
