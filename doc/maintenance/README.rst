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
