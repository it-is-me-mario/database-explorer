.. _compare-databases:

Compare databases
=================

.. container:: explorer-intro

   Choose an indicator, then compare its available MRIO databases.
   Explore countries, years and macrosectors; download the selected results.

   .. container:: explorer-feedback

      Found an error, or know a database we should add? Tell us on `GitHub Issues <https://github.com/it-is-me-mario/database-explorer/issues>`_.

.. raw:: html

   <span id="trade"></span>
   <div class="economy-browser" data-economy-browser data-root="../../" aria-busy="true">
     <p>Loading the data browser…</p>
     <noscript>Enable JavaScript to explore the data. Sources and methods are documented below.</noscript>
   </div>

.. raw:: html

   <div data-browser-methods hidden>
   <details class="eb-method-notes"><summary>Coverage and aggregation</summary>
   <p>Choose an indicator, then its compatible databases and versions. Each indicator
   remembers its selections. Availability follows the published inventory; missing
   years, extensions, population or exchange rates remain unavailable. No other year
   is substituted and regional aggregates are never disaggregated into countries.
   World sums every native region once, including Rest of World, only where a
   complete global total is available. Sector correspondences retain the source
   classification and combined categories. The source table lists years, geography,
   table formats and licence links. Matrix diagrams are schematic definitions.</p></details>
   <details class="eb-method-notes"><summary>Accounting and scope</summary>
   <p data-method-metrics="gdp">GDP starts from the reviewed value-added factors and
   adds source-specific net product taxes on intermediate and final uses. Imports,
   balancing adjustments and residence-purchase adjustments are excluded from income.
   Where the market-price bridge is unverified, only explicitly labelled source
   estimates are available. GDP covers the whole economy.</p>
   <p data-method-metrics="value_added">Value added sums reviewed income factors,
   retaining signed subsidies and excluding imports, balancing adjustments and
   product taxes. Select the producer region and eligible macrosectors. Each native
   category enters once according to the downloadable sector correspondence.</p>
   <p data-method-metrics="ghg">Production emissions use E for IOTs and Ea for SUTs.
   Whole-economy totals include direct final-demand emissions from EY where supplied.
   EY remains a separate Households component when selecting macrosectors; it is never
   allocated to producers. Unavailable EY is not estimated or treated as an observed
   zero. Gas selections, unit conversions and GWP conventions remain source-specific.
   CO₂-only and three-gas proxies retain their qualifications.</p>
   <p data-method-metrics="trade">Trade sums intermediate transactions and final demand
   once, from Z and Y for IOTs or U and Yc for SUTs. No Leontief inverse is required.
   Origins and destinations accept multiple individually represented countries. Their
   Cartesian product is aggregated after excluding domestic pairs, retaining signed
   entries. Every selected country must be covered. The goods-producing-group scope
   selects agriculture, mining and manufacturing according to the native classification;
   it is a proxy, with no HS-to-industry allocation. Trade sector breakdowns are deferred.</p>
   <p data-method-metrics="gross_output domestic_use final_demand">Gross output
   sums native producing nodes. Domestic use selects intermediate and final users
   by model destination and separates domestic-origin and imported output. Final
   demand distinguishes consumption, fixed investment, and inventories/valuables.
   These are country totals in the 2015/2022 IOT pilot; macrosector breakdowns have
   not yet been collected. Combined source regions retain their native boundary.</p>
   <p data-method-metrics="value_added_footprint ghg_footprint">Final-demand footprints
   retain consumer columns while solving the production system. Regional direct
   accounts identify production origins; they are combined with each consumer's
   final demand, including investment and signed stock changes. Domestic and foreign
   refer to the same/different native origin and consumer regions. The World split
   sums these regional components. GHG adds eligible directly emitted final-demand
   accounts once. Zero-output production accounts remain a separately quantified
   residual, with no invented consumer allocation. No full inverse is constructed.
   Summing MARIO F/M columns by producer region does not establish the consumer's
   footprint.</p>
   <p data-method-metrics="ghg_trade">GHG embodied in trade multiplies signed
   intermediate and final international output flows by their global upstream GHG
   intensities. Domestic pairs are excluded. A flow can contain upstream emissions
   already counted at another border crossing; gross trade is not final-consumption
   accounting. Direct final-user emissions and unallocable zero-output accounts are
   not assigned to traded output. No monetary Comtrade reference is used.</p>
   <p>Current-price monetary comparisons use same-year exchange rates. Per-capita
   national totals use the corresponding population; World uses the published WLD
   population rather than a sum of ratios. Per-capita sector and aggregate-region
   values are unavailable. Current-dollar trends also reflect prices and exchange rates.</p>
   </details>
   <details class="eb-method-notes"><summary>Database-specific recipes</summary>
   <div data-method-recipes></div></details>
   <details class="eb-method-notes"><summary>Reference series</summary>
   <p data-method-metrics="gdp value_added">World Bank WDI supplies GDP references,
   population and exchange rates. Value added has no GDP benchmark. EUR values use
   Germany's reported EUR/USD rate from 1999; 1995–1998 use the published Eurostat
   EUR/ECU annual series. DEM/USD is never interpreted as EUR/USD. The GDP difference
   is (database GDP / WDI GDP − 1) × 100, a comparison affected by accounting boundaries,
   source vintages and projections. It is not an accuracy score.</p>
   <p data-method-metrics="ghg">EDGAR 2026 supplies unchanged country and World cells
   with territorial AR5 GWP100 boundaries, including households and excluding LULUCF.
   International aviation/shipping and grouped territories retain the published
   geography. References are not interpolated, redistributed across countries or
   allocated to sectors. Their boundary can differ from MRIO production accounts;
   no percentage accuracy score is calculated.</p>
   <p data-method-metrics="gross_output domestic_use final_demand value_added_footprint ghg_footprint ghg_trade">These indicators have no external numerical benchmark in the pilot.
   World Bank exchange rates and population support conversions where applicable.
   GDP, EDGAR territorial production totals and monetary customs declarations do
   not have the same accounting boundary as these footprint and use measures.</p>
   <p data-method-metrics="trade">UN Comtrade merchandise TOTAL appears only with the
   goods-producing-group proxy and complete Total use. The pilot covers China and
   Italy as reporters, their collected partners, and 2015/2022. Export and mirror-import
   declarations are summed independently over exactly the selected pairs before
   forming a range. Incomplete sides remain unavailable; one complete side is a line.
   Exports are usually FOB and imports usually CIF. Customs flows, re-exports, timing
   and national-accounts adjustments differ from MRIO flows. The range is neither a
   confidence interval nor a bound on a true value. It is hidden for partial uses and
   when a stacked component is hidden in the legend.</p></details>
   <details class="eb-method-notes"><summary>Downloads and reproduction</summary>
   <p>The CSV records the current observations, units, boundaries and attribution.
   Download MARIO code provides small source/indicator scripts and their shared
   recipes. Source files are supplied locally under their own terms. The package
   records the selected readings, filters, sector correspondence and same-year
   conversion inputs. Source matrices and coefficients are not embedded. Builds and
   visitors do not request numerical data from source-provider APIs.</p></details>
   </div>
   <div data-reference-licence-notice hidden><p>© European Union 2026, European Commission JRC, EDGAR Community GHG
   database, comprising IEA–EDGAR CO₂, EDGAR CH₄, EDGAR N₂O and EDGAR F-gases.
   Crippa et al. (2026), <em>GHG emissions of all world
   countries – 2026 Report</em>,
   <a href="https://doi.org/10.2760/7717504">doi:10.2760/7717504</a>.
   </p></div>


.. raw:: html

   <script>
   function followExplorerAnchor() {
   if (["#database-coverage", "#geographical-coverage"].includes(location.hash)) {
     location.replace("scope.html#geographical-coverage");
   } else if (location.hash === "#analyses") {
     location.replace("analyses.html");
   } else if (["#electricity-carbon-footprint", "#by-country-and-data-source",
               "#by-generation-technology", "#sources-and-reproducibility"].includes(location.hash)) {
     location.replace("electricity_carbon_footprint.html" + location.hash);
   }
   }
   followExplorerAnchor();
   window.addEventListener("hashchange", followExplorerAnchor);
   </script>
