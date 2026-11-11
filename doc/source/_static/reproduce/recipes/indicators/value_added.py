"""Reviewed factor rows, retaining the native producer axis and signed entries."""
from ..common.validation import strict_sum, characterise

def values(db, recipe):
    block=db.get_block(recipe.get('value_added_block','V'))
    weights=recipe.get('value_added_factors')
    if weights is not None and set(weights)!=set(recipe['value_added_rows']):
        raise ValueError('Value-added weights must match the reviewed rows')
    native=characterise(block,weights) if weights is not None else strict_sum(block,recipe['value_added_rows'])
    return native*recipe['currency_scale']
