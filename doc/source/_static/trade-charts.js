/* Trade reuses the comparison chart grammar and adds reported Comtrade ranges. */
((global)=>{
  'use strict';
  function figure(rows,references,options,C) {
    const temporal=options.years.length>1,use=options.state.tradeUse||'total';
    const components=!temporal&&use==='total';
    const showReference=options.state.tradeScope==='goods_proxy'&&use==='total';
    const plotted=components?rows.flatMap(row=>['intermediate','final'].map(part=>({...row,
      sector:part,sector_name:part==='intermediate'?'Intermediate':'Final',value:row[part]}))):rows;
    const result=C.figure(plotted,{...options,forceTemporal:true,verticalBars:true});
    if(!result.data.length)return {...result,referenceIndices:[]};
    if(components)result.layout.barmode='relative';
    result.data.forEach(trace=>{
      if(components) {
        trace.meta={tradeComponent:trace.legendgroup.replace('sector:','')};
        // Each database/version already has its own x category. Separate
        // offset groups reserve extra slots and shift the stacks off the ticks.
        delete trace.offsetgroup;
      }
    });
    const indices=[];
    if(showReference)for(const ref of references) {
      if(ref.lower==null)continue;
      const band=ref.complete&&ref.lower!==ref.upper;
      indices.push(result.layout.shapes.length);
      result.layout.shapes.push({type:band?'rect':'line',xref:temporal?'x':'paper',
        x0:temporal?ref.year-.4:0,x1:temporal?ref.year+.4:1,yref:'y',
        y0:ref.lower/result.scale.factor,y1:ref.upper/result.scale.factor,
        layer:'below',fillcolor:options.colors.reference,opacity:band?.2:.8,
        line:{color:options.colors.reference,width:band?1:2,dash:band?'solid':'dash'},
        name:'Comtrade goods · reported range',legendgroup:'comtrade',legendrank:10000,
        showlegend:indices.length===1});
    }
    if(showReference)for(const [side,label] of [['exports','Comtrade export · goods'],['imports','Comtrade mirror import · goods']]) {
      const available=references.filter(r=>r[side]);
      if(!available.length)continue;
      const categories=[...new Set(result.data.flatMap(t=>t.x||[]))];
      const points=temporal?available.map(r=>({x:r.year,y:r[side].value/result.scale.factor})):
        categories.map(x=>({x,y:available[0][side].value/result.scale.factor}));
      result.data.push({type:'scatter',mode:'markers',name:label,legendgroup:'comtrade',showlegend:false,
        x:points.map(p=>p.x),y:points.map(p=>p.y),meta:{tradeReference:true},zorder:0,
        marker:temporal?{symbol:'line-ew',size:9,color:options.colors.reference,line:{width:1.4,color:options.colors.reference}}:{size:8,opacity:0},
        hovertemplate:label+': %{y:,.3~f} '+result.scale.unit+'<extra></extra>'});
    }
    result.layout.legend.groupclick='togglegroup';
    if(indices.length&&(options.width||900)<600){result.layout.margin.b+=24;result.layout.height+=24;}
    if(temporal){
      result.layout.xaxis.range=[options.years[0]-.6,options.years.at(-1)+.6];
      if(options.years.length<=12){result.layout.xaxis.tickmode='array';result.layout.xaxis.tickvals=options.years;}
    }
    // Shapes must contribute to the value-axis range, even when a reported
    // customs total exceeds every plotted MRIO observation.
    const values=[...plotted.map(r=>r.value),...(showReference?references.flatMap(r=>[r.lower,r.upper]):[])].filter(Number.isFinite).map(v=>v/result.scale.factor);
    if(values.length){
      const stacked=components?rows.flatMap(r=>[Math.max(0,r.intermediate||0)+Math.max(0,r.final||0),Math.min(0,r.intermediate||0)+Math.min(0,r.final||0)]).map(v=>v/result.scale.factor):values;
      const low=Math.min(0,...values,...stacked),high=Math.max(0,...values,...stacked),pad=(high-low||1)*.08;
      result.layout.yaxis.range=[low<0?low-pad:0,high+pad];
    }
    return {...result,referenceIndices:indices};
  }
  const api={figure};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else global.MarioTradeCharts=api;
})(globalThis);
