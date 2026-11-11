"""Characterised production accounts and separate direct final-demand accounts."""
from ..common.validation import characterise

def values(db, recipe):
    return characterise(db.get_block(recipe.get('emissions_block','E')),recipe['ghg_factors'])

def direct(db, recipe):
    if recipe.get('final_demand_emissions_loaded',True) is False:
        return None
    return characterise(db.get_block('EY'),recipe['ghg_factors']).groupby(level='Region').sum()
