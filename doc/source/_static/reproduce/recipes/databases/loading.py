"""Choose one explicit source adapter and verify its observed year and units."""
from importlib import import_module
ADAPTERS={'EXIOBASE':'exiobase','GLORIA':'gloria','FIGARO':'figaro','WIOD':'wiod','ADB':'adb','OECD':'oecd','EMERGING':'emerging','BONSAI':'bonsai','BEA':'bea','USEEIO':'useeio'}
BRIDGES={'gloria_valuations':'gloria','source_activity_taxes':'exiobase','exiobase_matching_iot':'exiobase','exiobase_factor_inputs':'exiobase','exiobase_satellite':'exiobase','figaro_csv':'figaro','wiod_iot':'wiod','adb_excel':'adb','oecd_csv':'oecd'}

def adapter(source):
    if source not in ADAPTERS:raise ValueError('No reviewed source adapter for '+source)
    return import_module('.'+ADAPTERS[source],__package__)

def final_demand_taxes(path, recipe):
    kind=recipe.get('tax_bridge')
    if not kind or kind in {'sut_supply_product_taxes','wiod_sut_vy'}:return None
    if kind not in BRIDGES:raise ValueError('Unknown tax bridge: '+kind)
    return import_module('.'+BRIDGES[kind],__package__).final_demand_taxes(path,recipe)

def load_database(recipe, path):
    """Parse and verify the source year, axes and measurement units."""
    import mario
    if recipe.get("tax_bridge") == "exiobase_matching_iot":
        from mario.parsers.exiobase_iot import detect_exiobase_iot_layout
        matching = recipe["parser_options"].get("add_extensions")
        if not matching or str(matching).startswith("/path/to/"):
            raise ValueError("Supply the exact same-year EXIOBASE IOT via --extensions-path")
        layout = detect_exiobase_iot_layout(matching)
        if layout.year != recipe["year"] or layout.version != recipe["release"] or layout.system != "ixi":
            raise ValueError("The SUT needs the same-release/year industry-by-industry IOT")
    database = adapter(recipe["source"]).load(recipe,path)
    year = getattr(database.meta, "year", None)
    if year is None or int(year) != recipe["year"]:
        raise ValueError(f"Expected source year {recipe['year']}, parsed {year}")
    if database.table_type != recipe["table"]:
        raise ValueError("The source table format differs from the selected recipe")
    aliases=getattr(adapter(recipe["source"]),"unit_label_aliases",lambda recipe,database:{})(recipe,database)
    for group, expected in recipe.get("expected_units", {}).items():
        units = database.units[group]["unit"]
        for label, unit in expected.items():
            if str(units.loc[aliases.get(group,{}).get(label,label)]) != unit:
                raise ValueError(f"Unexpected unit for {label}; expected {unit}")
    return database
