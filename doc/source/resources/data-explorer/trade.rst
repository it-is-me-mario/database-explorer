Bilateral trade
===============

Compare one origin–destination flow across databases for the same year.
Values include intermediate purchases and final demand. The first reference
release covers **goods in UN Comtrade**. Service-trade references are deferred.

.. raw:: html

   <div class="trade-browser" data-trade-browser data-root="../../" aria-busy="true">
     <p role="status">Loading bilateral trade observations…</p>
   </div>

Interpret the comparison
------------------------

* **MRIO total** includes goods and services. **Goods-producing groups**, where
  available, are a separately identified proxy based on the source classification.
  They are not an exact HS merchandise concordance. Unmapped groups are not
  assumed to be services or zero.
* Comtrade export values and the destination's mirror import values are separate
  references. Exports are generally FOB and imports CIF. Neither is averaged
  into a supposed true value. The original reporting and aggregation flags remain
  in the download.
* Monetary values are converted to current USD using an observed annual exchange
  rate. Source basic-price accounting remains distinct from customs valuation.
  Ratios describe the displayed values and do not measure database accuracy.
* Countries are compared only where the database identifies them individually.
  A Rest of World aggregate is never split into invented country flows. Missing
  years and references are displayed as unavailable.

The pilot uses the locally supplied 2015 and 2022 files. Each reading retains its
release, parser options, source units, scope and attribution. REX3 is a version
within EXIOBASE, and E3 a version within FIGARO. Physical hybrid units are not
summed into a monetary total.

The Comtrade pilot collects China and Italy as reporters, with all their available
partner countries, for 2015 and 2022. Other pairs may have MRIO readings without
a collected Comtrade reference. An unavailable reference is not a zero flow.

Sources and reproduction
-------------------------

The collectors use MARIO 1.3.4 and validate direct intermediate/final aggregation
against ``Database.calc_trades``. They do not calculate a Leontief inverse.
Large sources are aggregated in bounded batches where needed. Ordinary website
builds and visitors make no Comtrade API requests.

See the `collection code <https://github.com/it-is-me-mario/database-explorer/tree/main/pipelines>`_,
`MARIO trade API <https://www.marioproject.com/en/latest/api_document/mario.Database.calc_trades.html>`_,
`UN Comtrade API <https://uncomtrade.org/docs/un-comtrade-api/>`_ and
`Comtrade reuse conditions <https://uncomtrade.org/docs/re-dissemination-of-data/>`_.

