import fs from 'node:fs/promises';
import {Workbook, SpreadsheetFile} from '@oai/artifact-tool';
const [input,out,commonInput]=process.argv.slice(2);
if(!input||!out)throw new Error('Usage: node build_sector_correspondence.mjs sector-sections.json output-directory [common-sector-sections.json]');
await fs.mkdir(out,{recursive:true});
const {mappings}=JSON.parse(await fs.readFile(input,'utf8'));
// One sheet per distinct native classification, shared across identical years.
const groups=new Map();
for(const [id,main] of Object.entries(mappings))for(const m of [main,...(main.additional_mappings||[])]){
 const key=JSON.stringify([m.family,m.classification_id,m.entries.map(e=>[e.native_code,e.native_label,e.section]).sort((a,b)=>a[1].localeCompare(b[1]))]);
 if(!groups.has(key))groups.set(key,{m,ids:[]});
 groups.get(key).ids.push(id);
}
const wb=Workbook.create();let index=0;
for(const {m,ids} of groups.values()){
 const name=m.family==='EXIOBASE'?(ids[0].includes('hybrid')?(m.classification_id==='cpa-2002'?'EXIOBASE Hybrid products':'EXIOBASE Hybrid activities'):m.classification_id==='cpa-2002'?'EXIOBASE products':'EXIOBASE industries'):m.family==='OECD'?'OECD ICIO':m.family==='FIGARO'?(m.classification_id==='cpa-2.1'?'FIGARO products':'FIGARO activities'):m.family==='WIOD'?(m.dimension==='Activity'?'WIOD activities':'WIOD industries'):m.family==='EMERGING'?(m.variant==='E'?'EMERGING-E products':m.entries.length===134?'EMERGING 1.0 products':'EMERGING products'):m.family;
 const s=wb.worksheets.add(name);s.showGridLines=false;s.tabColor='#245b6a';
 s.getRange('A2').values=[[`${m.family}: ${m.classification} sections`]];
 s.getRange('A2').format.font={name:'Arial',size:14,bold:true,color:'#202c38'};
 s.getRange('A3').values=[['Sum each native category once into its section; weights are all 1. Readings with identical classifications share this sheet.']];
 s.getRange('A4').values=[['Section letters from different revisions are not a cross-database concordance. Combined categories stay combined.']];
 s.getRange('A5').values=[['Source: '+m.source_url]];
 s.getRange('A6').values=[['Classification: '+m.classification_url]];
 s.getRange('A3:E6').format={font:{name:'Arial',size:10,color:'#566675'},rowHeight:19};
 s.getRange('A2:E2').format.borders={bottom:{style:'thin',color:'#245b6a'}};
 const rows=[['Native code','Native category (unchanged)','Section','Section label (short)','Weight'],...m.entries.map(e=>[e.native_code||'',e.native_label,e.section,m.sections[e.section],1])];
 const last=rows.length+7;s.getRange(`A8:E${last}`).values=rows;
 s.getRange(`A8:E${last}`).format={font:{name:'Arial',size:10,color:'#202c38'},verticalAlignment:'center',rowHeight:28};
 s.getRange(`A9:D${last}`).setNumberFormat('@');s.getRange(`E9:E${last}`).setNumberFormat('0');
 const widths=[16,74,10,48,10];'ABCDE'.split('').forEach((c,i)=>s.getRange(`${c}8:${c}${last}`).format.columnWidth=widths[i]);
 s.getRange(`B9:B${last}`).format.wrapText=true;s.getRange(`D9:D${last}`).format.wrapText=true;s.getRange(`B9:D${last}`).format.autofitRows();
 s.getRange('A8:E8').format={fill:'#245b6a',font:{name:'Arial',size:10,bold:true,color:'#ffffff'},horizontalAlignment:'center',rowHeight:30};
 s.tables.add(`A8:E${last}`,true,'NativeSections'+(++index));s.freezePanes.freezeRows(8);s.freezePanes.freezeColumns(1);
}
// Common comparison mappings are additional sheets. Native source classifications
// above retain their original revisions, labels and aggregation instructions.
if(commonInput){
 const common=JSON.parse(await fs.readFile(commonInput,'utf8'));
 if(common.schema_version!==2||!common.definitions||!common.evidence||!common.qualifications)
  throw new Error('Expected the reviewed version-2 common-section mapping.');
 const used=new Map(), readingRows=[];
 function collect(id,ref){
  const definition=common.definitions[ref.definition];
  if(!definition)throw new Error(`Missing common definition: ${ref.definition}`);
  if(!used.has(ref.definition))used.set(ref.definition,{definition,families:new Set(),versions:new Set()});
  const group=used.get(ref.definition);group.families.add(ref.family);group.versions.add(ref.version||'Unversioned');
  readingRows.push([id,ref.family,ref.version||'',definition.dimension,definition.kind,ref.definition,ref.source_url||'']);
  for(const extra of ref.additional_mappings||[])collect(id,extra);
 }
 for(const [id,ref] of Object.entries(common.mappings))collect(id,ref);
 function sheet(name,title,notes,headers,rows,widths){
  const s=wb.worksheets.add(name);s.showGridLines=false;s.tabColor='#245b6a';
  const lastColumn=String.fromCharCode(64+headers.length),last=rows.length+8;
  s.getRange(`A2:${lastColumn}2`).format={font:{name:'Arial',size:14,bold:true,color:'#202c38'},borders:{bottom:{style:'thin',color:'#245b6a'}}};
  const noteColumn=String.fromCharCode(64+Math.min(6,headers.length));
  s.mergeCells(`A2:${noteColumn}2`);s.getRange('A2').values=[[title]];
  notes.forEach((note,i)=>{s.mergeCells(`A${i+3}:${noteColumn}${i+3}`);s.getRange(`A${i+3}`).values=[[note]];});
  s.getRange(`A3:${noteColumn}6`).format={font:{name:'Arial',size:10,color:'#566675'},rowHeight:36,wrapText:true,verticalAlignment:'center'};
  s.getRange(`A8:${lastColumn}${last}`).values=[headers,...rows];
  s.getRange(`A8:${lastColumn}${last}`).format={font:{name:'Arial',size:10,color:'#202c38'},verticalAlignment:'top',wrapText:true,rowHeight:48};
  s.getRange(`A9:${lastColumn}${last}`).setNumberFormat('@');
  widths.forEach((width,i)=>{const col=String.fromCharCode(65+i);s.getRange(`${col}8:${col}${last}`).format.columnWidth=width;});
  s.getRange(`A8:${lastColumn}8`).format={fill:'#245b6a',font:{name:'Arial',size:10,bold:true,color:'#ffffff'},verticalAlignment:'center',horizontalAlignment:'left',rowHeight:32};
  s.tables.add(`A8:${lastColumn}${last}`,true,'CommonSections'+(++index));
  s.getRange(`A9:${lastColumn}${last}`).format.autofitRows();
  s.freezePanes.freezeRows(8);s.freezePanes.freezeColumns(2);
  return s;
 }
 sheet('Common sections',`${common.classification}: comparison reference`,[
  'Read Common groups for each unchanged native category; use Common readings to identify its exact source and axis.',
  common.note,
  'Unassigned categories remain visible. A correspondence does not allocate a native category among sections.',
  'The original source-classification sheets remain separate; their letter codes can belong to different revisions.'
 ],['Section','Label'],Object.entries(common.sections),[18,105]);
 const nativeRows=[];
 for(const [key,group] of [...used].sort((a,b)=>[...a[1].families].join().localeCompare([...b[1].families].join())||a[0].localeCompare(b[0]))){
  const d=group.definition;
  for(const e of d.entries){
   const evidence=common.evidence[e.evidence],qualification=common.qualifications[e.qualification];
   if(!evidence||typeof qualification!=='string')throw new Error(`Unresolved evidence or qualification: ${key}/${e.native_label}`);
   nativeRows.push([[...group.families].sort().join(' / '),[...group.versions].sort().join(' / '),`${d.dimension} (${d.kind})`,e.native_code||'',e.native_label,e.section,d.sections[e.section]||'',qualification,
    JSON.stringify(evidence),key]);
  }
 }
 sheet('Common groups',`${common.classification}: native categories`,[
  'Filter Family, Source releases and Native axis. Each native category is retained whole and appears once per mapping.',
  'Read Qualification before comparing a group; a combined section code is not a numerical split.',
  'Mapping key connects this table to Common readings. Evidence cites the source IDs listed in Common sources.',
  'Underlying source classifications and original labels remain available in the preceding native sheets.'
 ],['Family','Source releases','Native axis','Native code','Native category (unchanged)','Section group','Section label','Qualification','Evidence / source IDs','Mapping key'],nativeRows,[18,22,22,17,64,18,50,80,72,29]);
 sheet('Common readings',`${common.classification}: reading identities`,[
  'Each reading and native axis points to one shared mapping; identical mappings are not repeated for every year.',
  'Activity and Commodity mappings are distinct for supply-use tables. Use the axis required by the indicator.',
  'Reading IDs preserve the exact release, year and table format used by the explorer.',
  'Source URLs identify the database; correspondence-source details are listed in Common sources.'
 ],['Reading ID','Family','Source release','Dimension','Native kind','Mapping key','Database source'],readingRows,[65,18,22,18,18,29,90]);
 const sources=Object.entries(common.sources).sort(([a],[b])=>a.localeCompare(b)).map(([id,s])=>[id,s.title||'',s.publisher||'',s.url||'',s.role||'',s.sha256||'']);
 sheet('Common sources',`${common.classification}: correspondence provenance`,[
  'Source IDs match the Evidence column in Common groups. Editorial macro reviews are identified explicitly.',
  'Source URLs are preserved as published, with checksums where recorded in the classification metadata.',
  'A route or producing-scope review establishes only the interpretation stated in each category qualification.',
  'The exact machine-readable mapping is common-sector-sections.json in the explorer data downloads.'
 ],['Source ID','Title','Publisher','URL','Role / interpretation','SHA256'],sources,[24,65,35,95,80,70]);
 console.log(`Added common sections: ${used.size} native mappings, ${nativeRows.length} categories, ${readingRows.length} reading axes.`);
}
wb.recalculate();
console.log((await wb.inspect({kind:'table',range:"'EXIOBASE industries'!A8:E12",include:'values',tableMaxRows:5,tableMaxCols:5,maxChars:1600})).ndjson);
console.log((await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!',options:{useRegex:true,maxResults:10},maxChars:400})).ndjson);
for(let i=0;i<index;i++){
 const s=wb.worksheets.getItemAt(i);
 if(process.env.SECTOR_PREVIEW_FAMILY&&!s.name.startsWith(process.env.SECTOR_PREVIEW_FAMILY))continue;
 const range=s.name==='Common sections'?'A1:B17':s.name.startsWith('Common')?'A1:G13':'A1:E17';
 const image=await wb.render({sheetName:s.name,range,scale:1,format:'png'});
 await fs.writeFile(`${out}/${s.name.replaceAll(' ','-')}.png`,new Uint8Array(await image.arrayBuffer()));
}
await(await SpreadsheetFile.exportXlsx(wb)).save(`${out}/sector-correspondence.xlsx`);
console.log(`Exported ${groups.size} distinct native classifications and ${index-groups.size} common-reference sheets.`);
