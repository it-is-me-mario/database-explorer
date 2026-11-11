MARIO comparison reproduction
=============================
Install: python -m pip install mariopy==1.3.4
Edit paths.json with the exact local source file/folder for each reading.
Run: python run_selection.py --paths paths.json
Open chart.html to view the recomputed figure. Results are also in results.csv.
For one reading, use its run_<reading>_<indicator>.py --path /your/source.

Start with source_<reading>_indicators.py (cell markers # %%) or its .ipynb:
edit its source/companion paths and run the cells in order. It contains the actual
public MARIO parser, native matrices and calculations for each indicator. All
helpers are visible in the file; it needs no explorer-package import. Results use
native currency and tonnes; source-specific GHG qualifications remain explicit.
The full technology system is required for footprints, even for one country.

The run_<reading> scripts reproduce the precise selected chart and share recipes/databases and recipes/indicators with collection.
Expected published aggregates validate results; they are never used as computed
values. Missing readings remain gaps. Source year, geography and units are checked.
Reference values and conversion/population inputs are pinned to the selection;
site visitors and ordinary builds never request source-provider numerical data.
The FIGARO public parser can retrieve missing local cache files; provide the complete
matching year/table cache for offline reproduction.

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

For EMERGING-E, keep the source Figure data.xlsx beside EMERGING_E_2018.mat: it
provides the native country ordering. Monetary Trade needs no CO2 companion or
electricity-emissions projection. The E3.0 selection denotes Zenodo release V3.

The footprint recipe retains production origins before the public m/f coefficient
solve, then multiplies by final-consumer Y/Yc columns. It never constructs or
redistributes a full Leontief inverse. A combined solve keeps VA and GHG rows and
units separate. Native accounts not represented by monetary coefficients, and
requirements outside observed final demand (including zero-output intermediate
users), stay in signed production-origin residuals. They are not invented demand.

Source cells calculate direct monetary Trade before releasing large transaction
blocks for footprint work. Native absolute production accounts and original output
references remain available for checks. For large systems the optional UMFPACK
backend can be selected with mario.set_linear_solver("umfpack") when installed;
SciPy remains supported. Direct solves are the default. A reviewed reading may
select SciPy iterative solves plus equation-residual refinement in
RECIPE["footprint_compute"] to bound memory. The frozen settings are explicit,
and override the parser's session preset for these calls. The same origin reconciliation
still applies. Backend choice does
not change the indicator or its scope. Source-native signed entries are retained.

The public explorer prioritises the latest available footprint reading for each
indicator/release/format. The standalone source script can calculate a historical
reading locally even when that footprint has not yet been published on the site.
Households + NPISH combines observed source columns once. EMERGING retains its
reported household amount with an explicit note that NPISH coverage is undocumented;
no missing NPISH amount is zero-filled or claimed to complete the SNA category.
A combined source demand category is never split into unobserved SNA components;
REX3 therefore offers Total final demand only.
