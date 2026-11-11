const test=require('node:test'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process'),{createHash}=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const S=require('../../doc/source/_static/source-recipes.js'),metadata='reviewed metadata workbook',digest=createHash('sha256').update(metadata).digest('hex');
function recipe(source,variant='standard'){
 const emerging=source==='EMERGING',bindings=emerging?{economic:variant==='E'?'EMERGING_E_2018.mat':'EMERGING_V2_2018_m.mat',co2:'EMERGING_CO2_2018.mat',...(variant==='E'?{figure:'Figure data.xlsx'}:{})}:{economic:'GLORIA_MRIO.zip',readme:'GLORIA_ReadMe.xlsx',satellites:'GLORIA_Satellite.zip'};
 const pinRole=emerging?(variant==='E'?'figure':null):'readme';
 return {id:'guard',source,parser:emerging?'parse_emerging':'parse_gloria',year:2018,table:emerging?'IOT':'SUT',currency_scale:1e6,value_added_rows:['income'],ghg_factors:{CO2:1},parser_options:emerging?{year:2018,variant,load_co2:true,co2_path:'/path/to/companion.mat'}:{year:2018,satellites:'Emissions'},input_layout:{kind:'isolated_directory',bindings,files:Object.values(bindings).map(name=>({name,role:'reviewed input'})),...(emerging?{absent_roles:variant==='E'?['labels']:['labels','figure']}:{}),...(variant==='E'?{sector_labels_source:'released MARIO 1.3.4 built-in emerging_e_sectors.yaml'}:{}),...(pinRole?{metadata_equivalence:{[pinRole]:{name:bindings[pinRole],observed_sha256:digest,frozen_sha256:'0'.repeat(64)}}}:{})}};
}
const harness=String.raw`
import json,sys,tempfile,types
from pathlib import Path
payload=json.load(sys.stdin); recipe=payload['recipe']; mode=payload['mode']; source=recipe['source']; contract=recipe.get('input_layout'); bindings=contract['bindings'] if contract else {'economic':'economic.zip','satellites':'satellites.zip','readme':'readme.xlsx'}
with tempfile.TemporaryDirectory() as folder:
    root=Path(folder)/'inputs'; root.mkdir()
    for role,name in bindings.items(): (root/name).write_bytes(payload['metadata'].encode() if role in {'readme','figure','labels'} else b'matrix placeholder')
    if mode=='missing': (root/bindings.get('satellites',bindings.get('co2'))).unlink()
    if mode=='extra': (root/'Unreviewed labels.xlsx').write_text('extra')
    if mode=='duplicate':
        (root/bindings['co2']).unlink(); (root/bindings['co2']).symlink_to(root/bindings['economic'])
    if mode=='bad_metadata': (root/bindings.get('readme',bindings.get('figure'))).write_text('changed workbook')
    ns={'Path':Path,'SOURCE_PATH':root}
    for option,role in [('CO2_PATH','co2'),('LABELS_PATH','labels')]:
        if role in bindings: ns[option]=root/bindings[role]
    if mode=='outside_explicit': ns['CO2_PATH']=Path(folder)/bindings['co2']
    if mode=='root_file': ns['SOURCE_PATH']=root/bindings['economic']
    calls=[]
    def selected(role): return root/bindings[role] if role in bindings else None
    def detect_emerging_layout(given,**options):
        calls.append((given,options))
        result=types.SimpleNamespace(data_path=selected('economic'),co2_path=selected('co2'),labels_path=selected('labels'),figure_data_path=selected('figure'))
        if mode=='outside_detected': result.data_path=Path(folder)/bindings['economic']
        if mode=='unexpected_labels': result.labels_path=Path(folder)/'undeclared.xlsx'
        return result
    def detect_gloria_layout(given,**options):
        calls.append((given,options)); resource=lambda role:types.SimpleNamespace(container=selected(role))
        result=types.SimpleNamespace(readme_path=selected('readme'),T_path=resource('economic'),Y_path=resource('economic'),V_path=resource('economic'),TQ_path=resource('satellites'),YQ_path=resource('satellites'),use_adjustments=())
        if mode in {'missing_detected','legacy_missing'}: result.YQ_path=None
        if mode=='outside_detected': result.TQ_path=types.SimpleNamespace(container=Path(folder)/bindings['satellites'])
        if mode=='adjustment': result.use_adjustments=(('extra','valuation'),)
        return result,None
    sys.modules['mario.parsers.emerging']=types.SimpleNamespace(detect_emerging_layout=detect_emerging_layout)
    sys.modules['mario.parsers.gloria']=types.SimpleNamespace(detect_gloria_layout=detect_gloria_layout)
    try: exec(payload['guard'],ns)
    except ValueError as error:
        if mode=='valid': raise
        print(json.dumps({'error':str(error),'detector_calls':len(calls)}))
    else:
        assert mode=='valid','Guard accepted '+mode
        assert len(calls)==1
        print(json.dumps({'accepted':True,'detector_calls':len(calls)}))
`;
function execute(r,mode){
 const script=S.render('__PATHS__\n__PARSER__',r),start=script.indexOf('# Verify declared')<0?script.indexOf('# Historical GLORIA'):script.indexOf('# Verify declared'),guard=script.slice(start,script.indexOf('db = mario.'));
 assert.ok(start>=0);const run=spawnSync('python3',['-c',harness],{input:JSON.stringify({recipe:r,mode,guard,metadata}),encoding:'utf8'});assert.equal(run.status,0,run.stderr);return JSON.parse(run.stdout);
}
for(const [source,variant] of [['EMERGING','standard'],['EMERGING','E'],['GLORIA','standard']])test(`${source} ${variant} generated guard rejects missing, extra or differently discovered companions`,()=>{
 const r=recipe(source,variant);assert.equal(execute(r,'valid').accepted,true);
 for(const mode of ['missing','extra','root_file'])assert.equal(execute(r,mode).detector_calls,0);
 assert.match(execute(r,'outside_detected').error,/undeclared or differently selected/);
 if(source==='EMERGING'){
  assert.match(S.render('__PATHS__',r),/CO2_PATH = SOURCE_PATH \/ "EMERGING_CO2_2018.mat"/);
  for(const mode of ['duplicate','outside_explicit'])assert.equal(execute(r,mode).detector_calls,0);
  assert.match(execute(r,'unexpected_labels').error,/undeclared or differently selected/);
 }
 if(source==='GLORIA'||variant==='E')assert.match(execute(r,'bad_metadata').error,/Metadata fingerprint differs/);
 if(source==='GLORIA'){assert.match(execute(r,'missing_detected').error,/undeclared or differently selected/);assert.match(execute(r,'adjustment').error,/Additional GLORIA valuation inputs/);}
});
test('isolated source guards retain twelve cells and the literal parser and numerical cells',()=>{
 const root=path.resolve(__dirname,'../../doc/source/_static/reproduce'),template=fs.readFileSync(path.join(root,'source-recipe.template.txt'),'utf8');
 for(const source of ['EMERGING','GLORIA']){
  const r=recipe(source),script=S.render(template,r),plain=S.render(template,{...r,input_layout:undefined});
  assert.equal(JSON.parse(S.notebook(script)).cells.filter(c=>c.cell_type==='code').length,12);
  assert.equal(script.slice(script.indexOf('db = mario.')),plain.slice(plain.indexOf('db = mario.')));
  assert.match(script,/# This guard does not hash or authenticate the original large matrix contents/);
 }
 const r=recipe('EMERGING');assert.throws(()=>S.render('__PARSER__',{...r,input_layout:{...r.input_layout,bindings:{economic:r.input_layout.bindings.economic}}}),/bind each distinct filename/);
 assert.throws(()=>S.render('__PARSER__',{...r,input_layout:{...r.input_layout,absent_roles:[]}}),/absent metadata roles/);
 const g=recipe('GLORIA');g.input_layout.metadata_equivalence.readme.observed_sha256='bad';assert.throws(()=>S.render('__PARSER__',g),/invalid small metadata workbook/);
});
test('historical GLORIA source scripts require both satellite inputs without claiming an exact layout',()=>{
 const r={...recipe('GLORIA'),input_layout:undefined};assert.equal(execute(r,'valid').accepted,true);assert.match(execute(r,'legacy_missing').error,/requires both GLORIA GHG satellite inputs/);
 const generated=S.render('__PARSER__',r);assert.match(generated,/presence-only check; no exact input-layout or metadata-hash claim/);assert.doesNotMatch(generated,/_INPUT_BINDINGS|sha256/);
 assert.doesNotMatch(S.render('__PARSER__',{...r,ghg_usable:false}),/detect_gloria_layout/);
});
