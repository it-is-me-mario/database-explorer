/* Transparent cell-based MARIO scripts; source matrices remain local. */
((global)=>{
 'use strict';
 function literal(value){
  if(value===null||value===undefined)return 'None';
  if(value===true)return 'True';if(value===false)return 'False';
  if(typeof value==='string')return JSON.stringify(value);
  if(Array.isArray(value))return '['+value.map(literal).join(', ')+']';
  if(typeof value==='object')return '{'+Object.entries(value).map(([k,v])=>literal(k)+': '+literal(v)).join(', ' )+'}';
  if(!Number.isFinite(value))throw Error('Non-finite recipe constant');return String(value);
 }
 function inputInstructions(recipe){
  const layout=recipe.input_layout;if(!layout)return [];
  const lines=['Full-source companion inputs:'];
  for(const file of layout.files||[]){
   if(typeof file.name!=='string'||!file.name||/[\\/\x00-\x1f:]/.test(file.name)||['.','..'].includes(file.name))throw Error('Source input names must be portable basenames');
   lines.push('- '+file.name+(file.role?' — '+file.role:''));
  }
  if(layout.metadata_boundary)lines.push('Metadata boundary: '+layout.metadata_boundary);
  if(layout.instructions)lines.push(layout.instructions);
  return lines.flatMap(line=>line.split(/\r?\n/));
 }
 function inputGuard(recipe,options,hasGHG){
  const layout=recipe.input_layout;
  if(layout?.kind!=='isolated_directory'){
   if(recipe.source!=='GLORIA'||!hasGHG)return '';
   const selected=Object.entries(options).filter(([key])=>['year','valuation'].includes(key)).map(([key,value])=>key+'='+literal(value)).join(', ');
   return '# Historical GLORIA: presence-only check; no exact input-layout or metadata-hash claim.\nfrom mario.parsers.gloria import detect_gloria_layout\n_gloria_inputs, _ = detect_gloria_layout(SOURCE_PATH'+(selected?', '+selected:'')+')\nif _gloria_inputs.TQ_path is None or _gloria_inputs.YQ_path is None:\n    raise ValueError("The full source companion requires both GLORIA GHG satellite inputs TQ and YQ")\n\n';
  }
  if(!hasGHG||!['GLORIA','EMERGING'].includes(recipe.source))throw Error('The isolated input guard needs a reviewed full-source GLORIA or EMERGING GHG recipe');
  inputInstructions(recipe);
  const bindings=layout.bindings||{},names=(layout.files||[]).map(file=>file.name),roles=Object.keys(bindings),same=(a,b)=>a.length===b.length&&a.every(x=>b.includes(x));
  if(!roles.length||new Set(names).size!==names.length||new Set(Object.values(bindings)).size!==roles.length||!same(names,Object.values(bindings)))throw Error('Input layout must bind each distinct filename to one role');
  const emerging=recipe.source==='EMERGING',variant=String(options.variant||'standard').toUpperCase(),required=emerging?['economic','co2',...(variant==='E'?['figure']:[]),...(options.labels_path?['labels']:[])]:['economic','readme','satellites'];
  if(!same(roles,required))throw Error('Input layout bindings differ from the full-source parser roles');
  if(emerging&&!same(layout.absent_roles||[],['labels','figure'].filter(role=>!roles.includes(role))))throw Error('Input layout must retain explicitly absent metadata roles');
  if(emerging&&variant==='E'&&!roles.includes('labels')&&layout.sector_labels_source!=='released MARIO 1.3.4 built-in emerging_e_sectors.yaml')throw Error('EMERGING-E input layout must identify its reviewed built-in sector labels');
  const pins={};
  for(const [role,pin] of Object.entries(layout.metadata_equivalence||{})){
   const digest=pin.observed_sha256||pin.frozen_sha256;
   if(!['readme','figure','labels'].includes(role)||pin.name!==bindings[role]||!/[.]xlsx?$/i.test(pin.name)||!(/^[a-f0-9]{64}$/).test(digest||''))throw Error('Input layout has an invalid small metadata workbook fingerprint');
   pins[role]=digest;
  }
  const detectorKeys=emerging?['year','load_co2','co2_path','labels_path','variant']:['year','valuation'];
  const detectorOptions=Object.entries(options).filter(([key])=>detectorKeys.includes(key)).map(([key,value])=>literal(key)+': '+(value?.pathVariable?'str('+value.pathVariable+')':literal(value))).join(', ');
  return `# Verify declared companions and small metadata files before parsing.
# This guard does not hash or authenticate the original large matrix contents.
import hashlib
_INPUT_BINDINGS = ${literal(bindings)}
_INPUT_METADATA_SHA256 = ${literal(pins)}
_INPUT_DETECTOR_OPTIONS = {${detectorOptions}}

def _verify_source_inputs():
    root = SOURCE_PATH.absolute()
    if not root.is_dir():
        raise ValueError("SOURCE_PATH must be the declared dedicated input directory")
    children = list(root.iterdir())
    if (set(child.name for child in children) != set(_INPUT_BINDINGS.values())
            or any(not child.is_file() for child in children)
            or len({child.resolve() for child in children}) != len(children)):
        raise ValueError("Dedicated input directory differs from its exact declared file list")

    def check_selected(role, selected):
        expected = root / _INPUT_BINDINGS[role] if role in _INPUT_BINDINGS else None
        # Lexical comparison permits declared symlinks without hiding discovery elsewhere.
        if ((selected is None) != (expected is None)
                or (selected is not None and Path(selected).absolute() != expected.absolute())):
            raise ValueError("Parser discovered an undeclared or differently selected input for " + role)

    for option, role in [("co2_path", "co2"), ("labels_path", "labels")]:
        if option in _INPUT_DETECTOR_OPTIONS:
            check_selected(role, _INPUT_DETECTOR_OPTIONS[option])
    for role, digest in _INPUT_METADATA_SHA256.items():
        metadata = root / _INPUT_BINDINGS[role]
        if metadata.stat().st_size > 64 * 1024 * 1024:
            raise ValueError("Declared small metadata workbook is unexpectedly large: " + role)
        if hashlib.sha256(metadata.read_bytes()).hexdigest() != digest:
            raise ValueError("Metadata fingerprint differs from the reviewed input for " + role)
${emerging?`    from mario.parsers.emerging import detect_emerging_layout
    selected = detect_emerging_layout(root, **_INPUT_DETECTOR_OPTIONS)
    for role, field in [("economic", "data_path"), ("co2", "co2_path"), ("labels", "labels_path"), ("figure", "figure_data_path")]:
        check_selected(role, getattr(selected, field))`:`    from mario.parsers.gloria import detect_gloria_layout
    selected, _ = detect_gloria_layout(root, **_INPUT_DETECTOR_OPTIONS)
    check_selected("readme", selected.readme_path)
    for field in ["T_path", "Y_path", "V_path"]:
        check_selected("economic", getattr(selected, field).container)
    for field in ["TQ_path", "YQ_path"]:
        resource = getattr(selected, field)
        check_selected("satellites", resource.container if resource is not None else None)
    if selected.use_adjustments:
        raise ValueError("Additional GLORIA valuation inputs need their own reviewed layout")`}

_verify_source_inputs()

`;
 }
 function render(template,recipe){
  const hasGHG=Object.keys(recipe.ghg_factors||{}).length>0&&recipe.ghg_usable!==false;
  const options={...recipe.parser_options},paths=[...inputInstructions(recipe).map(line=>'# '+line),'SOURCE_PATH = Path("/path/to/source")'];
  // Account scripts require all nodes, even when the downloaded chart selects countries.
  delete options.regions;delete options.calc_all;
  if(recipe.source==='EMERGING'){options.load_co2=hasGHG;if(hasGHG&&!options.co2_path)options.co2_path='/path/to/matching/CO2-companion';if(!hasGHG)delete options.co2_path;}
  if(['ADB','WIOD','EXIOBASE'].includes(recipe.source)&&!hasGHG)delete options.add_extensions;
  for(const key of Object.keys(options))if(key.endsWith('path')||key==='add_extensions'){
   const variable=key.toUpperCase(),role={co2_path:'co2',labels_path:'labels'}[key],bound=recipe.input_layout?.kind==='isolated_directory'&&role&&recipe.input_layout.bindings?.[role];paths.push(variable+' = '+(bound?'SOURCE_PATH / '+literal(bound):'Path('+literal(typeof options[key]==='string'&&options[key].startsWith('/path/to/')?options[key]:'/path/to/'+key)+')'));options[key]={pathVariable:variable};
  }
  const argumentsText=Object.entries(options).map(([k,v])=>k+'='+(v&&typeof v==='object'&&v.pathVariable?'str('+v.pathVariable+')':literal(v)));
  const parser=inputGuard(recipe,options,hasGHG)+'db = mario.'+recipe.parser+'(path=str(SOURCE_PATH), calc_all=False'+(argumentsText.length?',\n    '+argumentsText.join(',\n    '):'')+')';
  const constants=Object.fromEntries(['id','source','year','table','currency','currency_scale','price_basis','gwp_basis','gwp_horizon','value_added_rows','ghg_factors','ghg_usable','ghg_note','final_demand_emissions_loaded','demand_category_policy','footprint_compute','trade_compute','direct_account_usable','upstream_account_usable','upstream_account_note'].filter(k=>recipe[k]!==undefined).map(k=>[k,recipe[k]]));
  const hybrid=recipe.source==='EXIOBASE'&&(recipe.parser_options?.unit==='Hybrid'||recipe.native_units==='Hybrid');
  if(hybrid)constants.direct_account_usable=false;
  if(hybrid&&(recipe.table||recipe.parser_options?.table)==='SUT'){
   constants.upstream_account_usable=recipe.upstream_account_usable===true;
   if(!constants.upstream_account_usable)constants.upstream_account_note=recipe.upstream_account_note||'Upstream allocation is unavailable because native activities co-produce outputs in incompatible units; the current model is not invariant to their unit scales.';
  }
  const units=new Set(Object.entries(recipe.expected_units||{}).filter(([name])=>['Sector','Activity','Commodity'].includes(name)).flatMap(([,items])=>Object.values(items)));
  if(recipe.native_monetary_unit)constants.native_monetary_unit=recipe.native_monetary_unit;else if(units.size===1)constants.native_monetary_unit=[...units][0];
  if(!constants.currency_scale||!constants.value_added_rows?.length)throw Error('This reading has no reviewed native account recipe');
  const replacements={SOURCE_URL:recipe.source_url||'',ATTRIBUTION:recipe.attribution||'',LICENSE_URL:recipe.license_url||'',PATHS:paths.join('\n'),RECIPE:literal(constants),PARSER:parser,OUTPUT:literal('results_'+recipe.id.replace(/[^a-zA-Z0-9_-]/g,'_'))};
  return template.replace(/__(SOURCE_URL|ATTRIBUTION|LICENSE_URL|PATHS|RECIPE|PARSER|OUTPUT)__/g,(_,key)=>replacements[key]);
 }
 function notebook(script){
  const cells=script.split(/^# %% /m).filter(Boolean).map(text=>{const end=text.indexOf('\n'),title=text.slice(0,end),body=text.slice(end+1);return [{cell_type:'markdown',metadata:{},source:['## '+title+'\n']},{cell_type:'code',metadata:{},execution_count:null,outputs:[],source:body.match(/.*(?:\n|$)/g).filter(Boolean)}];}).flat();
  return JSON.stringify({nbformat:4,nbformat_minor:5,metadata:{kernelspec:{display_name:'Python 3',language:'python',name:'python3'},language_info:{name:'python',version:'3.12'}},cells},null,2)+'\n';
 }
 const api={literal,inputInstructions,render,notebook};if(typeof module!=='undefined'&&module.exports)module.exports=api;else global.MarioSourceRecipes=api;
})(globalThis);
