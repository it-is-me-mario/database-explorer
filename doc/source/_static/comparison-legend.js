/* Legend dimensions and indivisible sector selections; no numeric allocation. */
((global)=>{
 'use strict';
 function sectorGroups(selection,nativeGroups=[]){
  if(selection==='all'||selection==null)return [];
  let groups=(Array.isArray(selection)?selection:[selection]).map(code=>new Set(String(code).split('+')));
  const selected=new Set(groups.flatMap(g=>[...g]));
  // A combined native group coalesces selected sections in every database.
  // This preserves one common legend and never splits a source category.
  for(const code of [...groups.map(g=>[...g].join('+')),...nativeGroups]){
   const members=String(code).split('+');if(!members.every(m=>selected.has(m)))continue;
   const hits=groups.filter(g=>members.some(m=>g.has(m)));if(hits.length<2)continue;
   const merged=new Set(hits.flatMap(g=>[...g]));groups=groups.filter(g=>!hits.includes(g));groups.push(merged);
  }
  return groups.map(g=>[...g].sort().join('+')).sort();
 }
 function sectorName(code,sections={}){return code==='unassigned'?'Unassigned native groups':code+' · '+code.split('+').map(c=>sections[c]||c).join(' + ');}
 function choices(state,{components=[],sectors=false}={}){
  const options=[{value:'auto',label:'Automatic'},{value:'database',label:'Database'},{value:'series',label:'Database / version'}];
  if(state.metric==='value_added_trade')options.push({value:'component',label:'Value-added origin · Domestic / Foreign'});
  else if(components.length>1)options.push({value:'component',label:state.metric==='final_demand'?'Supply origin · Domestic / Imported':'Contribution origin · Domestic / Foreign'});
  if(['trade','ghg_trade','value_added_trade','domestic_use'].includes(state.metric))options.push({value:'use',label:'Use · Intermediate / Final'});
  if(sectors)options.push({value:'sector',label:state.section==='all'?'Sector aggregates · select sectors first':'Sector aggregates',disabled:state.section==='all'});
  return options;
 }
 const api={sectorGroups,sectorName,choices};if(typeof module!=='undefined'&&module.exports)module.exports=api;else global.MarioLegend=api;
})(globalThis);
