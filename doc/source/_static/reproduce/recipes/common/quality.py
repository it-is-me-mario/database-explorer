"""Reviewed source exclusions and GHG-account conventions."""

def annotate_source_quality(recipe):
    """Withhold reviewed defective readings, never impute or rescale the source.

    Independently reread original F/F_Y and verified their CRC/SHA256 against
    the extraction. These are explicit release/year exclusions, not an
    automatic outlier threshold. Keep raw aggregate vectors for audit only.
    """
    if recipe.get("source") != "EXIOBASE" or recipe.get("parser_options", {}).get("unit") == "Hybrid":
        return recipe
    release, year = str(recipe.get("release", "")), recipe.get("year")
    if (release == "3.10.1" and year in (2022, 2023, 2024)) or (release == "3.10.2" and year in (2023, 2024)):
        problems = []
        if release == "3.10.1":
            problems.append("anomalous non-combustion source extensions (corrected in release 3.10.2)")
        if year in (2023, 2024):
            problems.append("all combustion rows and direct final-demand combustion accounts are zero in the source")
        recipe.update(ghg_usable=False, ghg_quality_status="withheld_source_error",
            ghg_unavailable_reason=f"EXIOBASE {release}, {year}: GHG total withheld; " + "; ".join(problems) + ". No replacement year or release is used.",
            ghg_quality_sources=["https://zenodo.org/records/20051562", "https://github.com/EXIOBASE/exiobase-bugs-public/issues/1"])
    return recipe

def annotate_ghg_method(recipe):
    """Retain reviewed source methods; disclose mixed characterisation."""
    annotate_source_quality(recipe)
    if not recipe.get("ghg_factors"): return recipe
    source=recipe.get("source")
    recipe["ghg_method"] = recipe.get("ghg_method", "").replace("direct household emissions reported separately", "direct final-demand emissions calculated separately and included once in Whole economy").replace("Direct final-demand emissions kept separately", "Direct final-demand emissions stored separately and included once in Whole economy")
    if source == "EXIOBASE":
        recipe["gwp_basis"] = "AR5 (EDGAR CH4=28); source HFC/PFC CO2eq retained" if recipe.get("parser_options", {}).get("unit") != "Hybrid" else "AR5 (CO2, CH4, N2O only; mixed CH4 origins)"
        recipe["gwp_horizon"] = 100
        recipe["ghg_note"] = "EXIOBASE: mass-reported gases use EDGAR-compatible AR5 GWP100 (CH4=28). HFC/PFC already in source CO2eq retain their original characterisation; its IPCC basis is not independently verified. Production accounts and EDGAR territorial totals have different boundaries."
        if recipe.get("parser_options", {}).get("unit") == "Hybrid":
            recipe["ghg_note"] = "EXIOBASE Hybrid: this is a three-gas CO2/CH4/N2O subtotal, not a complete GHG inventory. F-gas rows are unavailable; mixed-origin CH4 uses EDGAR-compatible AR5 GWP100 of 28. The source has separate unregistered-waste accounts; their overlap is not independently verified."
        recipe["ghg_basis"] = "Producer accounts plus direct final-demand emissions where supplied; " + recipe["gwp_basis"]
    elif source == "GLORIA":
        recipe.update(gwp_basis='Native CO2eq; IPCC AR5 GWP100 verified for CO2, CH4, N2O, SF6 and NF3; other F-gases unverified',gwp_horizon=100,ghg_note='GLORIA retains its native EDGAR-consistent CO2eq total. Independent checks of the 2001 and 2024 gas rows recover AR5 GWP100 factors for CO2, CH4, N2O, SF6 and NF3. Individual factors for all fluorinated gases remain unverified; the 2024 cell-level gas-row fit has a relative L2 residual of about 0.15%. The EDGAR 2026 territorial boundary also differs.')
    elif source == "ADB":
        recipe.update(gwp_basis="IPCC AR5 (source-characterised)",gwp_horizon=100,
          ghg_note="ADB: source AR5 GWP100 totals are converted from Gg to tonnes once. SEEA uses residence-based accounts; EDGAR uses a territorial boundary.",
          ghg_basis="SEEA residence-based producer and direct final-demand accounts; AR5 GWP100; excludes LULUCF")
    elif source == "USEEIO":
        recipe.update(gwp_basis="Source characterisation (CH4 27.9; N2O 273)",gwp_horizon=100,
          ghg_note="USEEIO: native workbook C factors are retained, including CH4 27.9. Commodity flows include import-related emissions; direct final-demand accounts are unavailable. This is not a US territorial inventory.")
    return recipe
