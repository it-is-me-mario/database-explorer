"""Observed same-year exchange rates; no neighbouring-year fallback."""

def usd_factor(recipe, world_bank):
    if recipe["currency"] == "USD":
        return 1.0
    if recipe["currency"] == "EUR":
        explicit = world_bank.get("currency_rates", {}).get("EUR", {}).get("years", {}).get(str(recipe["year"]))
        if explicit is not None:
            return explicit if explicit > 0 else None
        # Before 1999 Germany reports DEM/USD, not EUR/USD. Require the
        # explicit historical EUR/ECU series rather than mislabelling DEM.
        if recipe["year"] < 1999:
            return None
        row = world_bank["countries"].get("DEU", {}).get("years", {}).get(str(recipe["year"]), {})
        rate = row.get("local_currency_per_usd")
        return 1 / rate if rate is not None and rate > 0 else None
    return None
