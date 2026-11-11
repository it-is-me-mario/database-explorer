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
   it is a proxy, with no HS-to-industry allocation. Trade sector breakdowns are deferred.
   MRIO years follow the collected source series; available years are independent
   of the separate Comtrade reference. EMERGING-E uses only release V3 for 2018, labelled E3.0. Its monetary Trade
   needs no CO₂ companion or emissions projection. EMERGING goods proxies use reviewed
   NACE Rev. 2 producing-section groups: whole groups contained in agriculture, mining
   and manufacturing enter once; mixed service/production and unclassified groups are
   excluded without allocation. This macro mapping is separate from fine-class concordances. Benchmark-only sources retain their actual
   years. WIOD international SUT keeps ROW imports as external accounts, rather
   than reconstructing a complete ROW economy.</p>
   <p data-method-metrics="gross_output domestic_use final_demand">Gross output
   reads X for IOTs and Xc for SUTs, summing each native producing node once.
   Domestic use retains only matching origin and destination regions in Z and Y
   (IOT) or U and Yc (SUT), with intermediate/final/total uses available. Final demand
   selects consumer columns of Y or Yc and separates Domestic from Imported supply.
   The shared category menu is Households + NPISH, government consumption, gross
   capital formation, and other final demand. Household and NPISH columns are combined
   where supplied. <a href="https://www.oecd.org/content/dam/oecd/en/publications/reports/2023/11/development-of-the-oecd-inter-country-input-output-database-2023_3fa45b4c/5a5d0665-en.pdf">OECD methodology</a>
   includes NPISH in household consumption for some economies; its
   <a href="https://webfs-sti.oecd.org/files/STI-PIE/ICIO/2025/ICIO2025annex.pdf">2025 edition follows those methods</a>.
   EMERGING shows its reported household amount, whose NPISH coverage is undocumented;
   it is not presented as a verified complete combined SNA amount, and missing NPISH
   is never set to zero. Gross capital formation
   combines fixed capital formation, changes in inventories and valuables where these
   are separate. A source category that is not separately observed stays unavailable;
   a combined source category is never split. Native signed adjustments are retained.
   Coverage follows the collected indicator inventory in Sources &amp; coverage, including
   reviewed monetary IOTs and SUTs. Sector breakdowns follow the published
   coverage of each reading. Available sector sections follow the common
   classification named in the selector. Combined regions retain their native boundary.</p>
   <p data-method-metrics="value_added_footprint ghg_footprint">Final-demand footprints
   retain consumer columns while solving the production system. Regional direct
   accounts identify production origins; they are combined with each consumer's
   final demand, including investment and signed stock changes. Selecting sectors
   restricts the products or industries supplying final demand; their upstream
   contributions still include every producing sector. Direct final-user emissions
   have no supplying sector and stay outside sector slices, while the whole-economy
   GHG footprint retains them once. Domestic and foreign
   refer to the same/different native origin and consumer regions. The World split
   sums these regional components. GHG adds eligible directly emitted final-demand
   accounts once. Zero-output production accounts remain a separately quantified
   residual, with no invented consumer allocation. This also includes upstream
   requirements of intermediate users whose output is zero: their purchases cannot
   enter a per-output coefficient or be assigned to an observed final consumer.
   Parser-preserved source output references retain their explicit source treatment.
   The signed residual is traced by production origin, without adding demand or
   changing a coefficient. No full inverse is constructed.
   Summing MARIO F/M columns by producer region does not establish the consumer's
   footprint. Value added embodied in final demand uses the reviewed income accounts, including
   both activity and commodity accounts for SUTs; GHG footprints require an available
   reviewed environmental extension. The recipe performs the projected
   solve with origin-specific direct coefficients; the same result can be written
   as m @ Y by consumer (mc @ Yc for SUTs), with the origin split retained before
   calculating the multipliers. The public matrix methods
   <a href="https://www.marioproject.com/en/latest/api_document/mario.calc_m_from_z.html"><code>calc_m_from_z</code></a>
   and <a href="https://www.marioproject.com/en/latest/api_document/mario.calc_f_from_z.html"><code>calc_f_from_z</code></a>
   perform the solve; <code>calc_ghg</code> applies the source-specific characterisation.
   Value-added and GHG rows can share one linear-system solution while retaining
   separate units, origins and checks. Footprints are collected first for the latest
   available year of each indicator and native release/format; uncollected histories
   remain gaps. REX3 footprints are deferred to a later collection phase; its
   gross output, domestic use and final demand remain available.</p>
   <p data-method-metrics="value_added_footprint ghg_footprint ghg_trade value_added_trade">Hybrid SUT activities co-produce outputs in incompatible units. Upstream results
   are unavailable because the current allocation changes with those unit scales.
   Production value-added and GHG accounts remain available; Hybrid IOTs are
   assessed separately.</p>
   <p data-method-metrics="trade ghg_trade value_added_trade">All origins and All destinations sum every native region of each reading, including intact aggregate regions. Within-region pairs are excluded before aggregation. Explicit country selections still require individual coverage; an aggregate is never split.</p>
   <p data-method-metrics="ghg_trade">GHG embodied in gross trade multiplies signed
   intermediate and final international output flows by their global upstream GHG
   intensities. Domestic pairs are excluded. A flow can contain upstream emissions
   already counted at another border crossing; gross trade is not final-consumption
   accounting. Direct final-user emissions and unallocable zero-output accounts are
   not assigned to traded output. Sector selections restrict the exporting supplying
   sectors, with upstream emissions from all industries. No monetary Comtrade
   reference is used.</p>
   <p data-method-metrics="value_added_trade">Value added embodied in gross trade
   multiplies signed intermediate and final international output flows by upstream
   value-added intensities. Domestic value added is generated in the exporting
   native region; Foreign value added is generated in other native regions. Total
   is their sum. Selecting sector sections restricts the exported supplying
   sectors, while upstream value added still includes every producing sector.
   The origin and destination pickers identify the exporter and
   immediate importer, not the upstream source of every contribution. A chain can
   cross borders more than once, so the same value added can appear in multiple
   gross flows. This is not a full TiVA decomposition of final absorption, returned
   domestic value added and pure double counting. Native within-region pairs are
   excluded. No monetary Comtrade reference is used.</p>
   <p data-method-metrics="value_added ghg gross_output domestic_use final_demand value_added_footprint ghg_footprint ghg_trade value_added_trade">Sector comparisons use NACE Rev. 2 macrosector proxies based on the main activity or product of each native category. Boundary differences remain documented in the notes and sector correspondence.
   Each native category enters one proxy group once. Broad inseparable groups
   such as utilities or business services can remain combined; select the full
   combination when the source does not distinguish its components. Missing sector coverage is not zero. Source-specific
   sector detail is never inferred by splitting a combined group. Where a source
   has unassigned native categories, named sections describe the identified mapped
   portion. Unassigned categories remain a separate selectable group with their
   exact values, and enter the whole-economy total.</p>
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
   <p data-method-metrics="gross_output domestic_use final_demand value_added_footprint ghg_footprint ghg_trade value_added_trade">These indicators have no external numerical benchmark in the collected series.
   World Bank exchange rates and population support conversions where applicable.
   GDP, EDGAR territorial production totals and monetary customs declarations do
   not have the same accounting boundary as these footprint and use measures.</p>
   <p data-method-metrics="trade">UN Comtrade merchandise TOTAL appears only with the
   goods-producing-group proxy and complete Total use. The reference covers China and
   Italy as reporters and their collected partners; Sources &amp; coverage lists
   the observed years. Export and mirror-import
   declarations are summed independently over exactly the selected pairs before
   forming a range. Incomplete sides remain unavailable; one complete side is a line.
   Exports are usually FOB and imports usually CIF. Customs flows, re-exports, timing
   and national-accounts adjustments differ from MRIO flows. Composite reporting
   areas retain their original boundaries and visible qualifications; group sums
   with unverified compatible boundaries remain unavailable. Historical or
   unspecified areas are not assigned to a present-day country. The range is neither a
   confidence interval nor a bound on a true value. It is hidden for partial uses and
   when a stacked component is hidden in the legend. Comtrade World-partner totals
   have not been collected, so All origins or All destinations has no reference
   band.</p></details>
   <details class="eb-method-notes"><summary>Downloads and reproduction</summary>
   <p>The CSV contains the displayed observations, units, boundaries and attribution.
   Download MARIO code provides one readable Python file per selected database.
   Each guide shows the public parser call, editable local paths and the selected
   indicator through MARIO APIs. Multiple years use a loop. The guides work in
   native units and geography and can be adapted for further analysis.</p>
   <p>GDP uses <code>db.GDP()</code>; gross output uses <code>db.X</code> or
   <code>db.Xc</code>; domestic use and final demand select the relevant native
   <code>Z/Y</code> or <code>U/Yc</code> blocks. Footprint guides use
   <code>F/M</code> or <code>Fc/Mc</code>. Trade content uses
   <code>db.calc_trades_content(...)</code>. Environmental guides use <code>db.calc_ghg(...)</code> with the database profile
   bundled with MARIO; that profile determines the gases and native units. Supply the source
   files locally under their original terms.</p></details>
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
