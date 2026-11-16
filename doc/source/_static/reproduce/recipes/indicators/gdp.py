"""The income-to-GDP bridge uses exact source valuation accounts."""
from ..common.validation import strict_sum

def taxes(db, recipe, final_demand):
    kind=recipe.get('tax_bridge')
    if kind=='gloria_valuations' and final_demand is not None:
        return {r['label']:0.0 for r in recipe['regions']}, final_demand
    if kind=='sut_supply_product_taxes':
        return strict_sum(db.get_block('Vc'),recipe['product_tax_rows']).groupby(level='Region').sum(), {r['label']:0.0 for r in recipe['regions']}
    if recipe.get('product_tax_rows'):
        if kind=='wiod_sut_vy' and final_demand is None:
            final_demand=strict_sum(db.get_block('VY'),recipe['product_tax_rows']).groupby(level='Region').sum().to_dict()
        if final_demand is not None:
            return strict_sum(db.get_block(recipe.get('value_added_block','V')),recipe['product_tax_rows']).groupby(level='Region').sum(), final_demand
    return None, final_demand
