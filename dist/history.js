(() => {
  'use strict';
  const $=id=>document.getElementById(id),M=MapleMath,key='maple-journal-history-v1';
  const n=new Intl.NumberFormat('en-US',{maximumFractionDigits:2}),compact=new Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:1});
  let records=[],page=0,selected=null;
  const text=(tag,value,className)=>{const e=document.createElement(tag);e.textContent=value;if(className)e.className=className;return e;};
  const fmt=value=>n.format(Math.abs(value)<.005?0:value);
  const time=ms=>{const m=Math.floor(ms/60000),s=Math.floor(ms/1000)%60;return m>=60?Math.floor(m/60)+'h '+m%60+'m':m+'m '+s+'s';};
  function notice(message){$('history-error').textContent=message;$('history-error').hidden=!message;}
  function svgElement(tag,attrs={},value){const node=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v]of Object.entries(attrs))node.setAttribute(k,String(v));if(value!==undefined)node.textContent=value;return node;}
  function baseChart(container,title,xLabel,yLabel,xMin,xMax,yMin,yMax){
    container.replaceChildren();const width=720,height=260,left=78,right=24,top=22,bottom=48;
    if(xMin===xMax)xMax=xMin+1;if(yMin===yMax)yMax=yMin+1;
    const X=x=>left+(x-xMin)*(width-left-right)/(xMax-xMin),Y=y=>height-bottom-(y-yMin)*(height-top-bottom)/(yMax-yMin);
    const svg=svgElement('svg',{viewBox:'0 0 '+width+' '+height,role:'img','aria-label':title});svg.append(svgElement('title',{},title));
    for(let i=0;i<=4;i++){const v=yMin+(yMax-yMin)*i/4,py=Y(v);svg.append(svgElement('line',{x1:left,x2:width-right,y1:py,y2:py,class:'chart-grid'}),svgElement('text',{x:left-10,y:py+4,'text-anchor':'end',class:'chart-label'},compact.format(v)));}
    for(let i=0;i<=4;i++){const v=xMin+(xMax-xMin)*i/4;svg.append(svgElement('text',{x:X(v),y:height-bottom+20,'text-anchor':'middle',class:'chart-label'},compact.format(v)));}
    if(yMin<=0&&yMax>=0)svg.append(svgElement('line',{x1:left,x2:width-right,y1:Y(0),y2:Y(0),class:'chart-zero'}));
    svg.append(svgElement('text',{x:(left+width-right)/2,y:height-4,'text-anchor':'middle',class:'chart-axis'},xLabel),svgElement('text',{x:left,y:12,class:'chart-axis'},yLabel));container.append(svg);return {svg,X,Y};
  }
  function emptyChart(container,message){container.replaceChildren(text('p',message,'chart-empty'));}
  function lineChart(container,rows,metric){
    if(!rows.length){emptyChart(container,'Your pace chart appears after the first checkpoint or completed run.');return;}
    const points=rows.map(r=>({x:r.to/60000,y:r[metric]})),ys=points.map(p=>p.y),min=Math.min(0,...ys),max=Math.max(0,...ys),pad=Math.max(1,(max-min)*.12);
    const {svg,X,Y}=baseChart(container,'Interval '+(metric==='expHour'?'EXP':'net mesos')+' per hour','Active minutes',metric==='expHour'?'EXP / hour':'Net mesos / hour',0,Math.max(...points.map(p=>p.x)),min-pad,max+pad);
    svg.append(svgElement('polyline',{points:points.map(p=>X(p.x)+','+Y(p.y)).join(' '),class:'trend-line',fill:'none'}));
    for(const p of points){const dot=svgElement('circle',{cx:X(p.x),cy:Y(p.y),r:5,class:'trend-dot'});dot.append(svgElement('title',{},fmt(p.y)+' per hour at '+fmt(p.x)+' active minutes'));svg.append(dot);}
  }
  function filtered(){
    const job=$('filter-class').value,min=$('filter-min').value?Number($('filter-min').value):1,max=$('filter-max').value?Number($('filter-max').value):100;
    if(!Number.isInteger(min)||!Number.isInteger(max)||min<1||max>100||min>max)throw new Error('Choose a starting-level range between 1 and 100, with From no higher than To.');
    const levelFilter=$('filter-min').value!==''||$('filter-max').value!=='';
    return records.filter(r=>(!job||(r.meta?.class||'Unspecified class')===job)&&(!levelFilter||(r.start.level&&r.start.level>=min&&r.start.level<=max)));
  }
  function review(record){
    selected=record.id;const box=$('history-review'),r=M.calculate(record.start,record.end,M.activeElapsed(record));box.hidden=false;box.replaceChildren(text('h3',record.meta.map||'Unspecified map'));
    box.append(text('p',new Date(record.stoppedAt).toLocaleString()+' · '+(record.meta.class||'Unspecified class')+' · '+(record.start.level?'Lv '+record.start.level+' → '+record.end.level:'No level metadata'),'form-note'));
    const stats=document.createElement('div');stats.className='insight-grid';
    for(const [label,value]of [['Active / breaks',time(r.durationMs)+' / '+time(record.pausedMs)],['EXP gained',fmt(r.exp)],['Original net',fmt(r.net)],['Adjusted cash net',fmt(r.adjustedNet)],['Estimated net with loot',fmt(r.estimatedNet)],['Checkpoints',String(record.checkpoints.length)]]){const div=document.createElement('div');div.append(text('span',label),text('strong',value));stats.append(div);}box.append(stats);
    const list=document.createElement('ul');for(const item of record.end.ledger||[])list.append(text('li',item.label+' · '+item.kind+' · '+fmt(item.value)+' mesos'));box.append(list);
    const close=text('button','Close review','secondary');close.type='button';close.addEventListener('click',()=>{selected=null;box.hidden=true;});box.append(close);
  }
  function render(){
    const selectedClass=$('filter-class').value;
    $('filter-class').replaceChildren(new Option('All classes',''),...[...new Set(records.map(r=>r.meta.class||'Unspecified class'))].sort().map(c=>new Option(c,c)));$('filter-class').value=selectedClass;
    for(const [id,field]of [['known-maps','map'],['known-classes','class']])$(id).replaceChildren(...[...new Set(records.map(r=>r.meta[field]).filter(Boolean))].sort().map(v=>new Option(v,v)));
    let sessions;try{sessions=filtered();}catch(e){notice(e.message);return;}
    const rows=$('history-rows');rows.replaceChildren();page=Math.max(0,Math.min(page,Math.ceil(sessions.length/20)-1));
    for(const record of sessions.slice(page*20,page*20+20)){
      const r=M.calculate(record.start,record.end,M.activeElapsed(record)),tr=document.createElement('tr'),map=document.createElement('td'),job=document.createElement('td');
      map.append(text('strong',record.meta.map||'Unspecified map'),text('small',new Date(record.stoppedAt).toLocaleString()));job.append(text('span',record.meta.class||'Unspecified class'),text('small',record.start.level?'Lv '+record.start.level+' → '+record.end.level:'Level not entered'));tr.append(map,job,text('td',time(r.durationMs)),text('td',fmt(r.rates.hour.exp)),text('td',fmt(r.rates.hour.mesos)));
      const td=document.createElement('td'),button=text('button','Review','secondary');button.type='button';button.addEventListener('click',()=>review(record));td.append(button);tr.append(td);rows.append(tr);
    }
    if(!sessions.length){const td=text('td',records.length?'No sessions match these filters.':'Your completed sessions will appear here. No sample data is mixed into your history.','empty-state');td.colSpan=6;const tr=document.createElement('tr');tr.append(td);rows.append(tr);}
    const status=$('history-status');status.replaceChildren(document.createTextNode(sessions.length+' matching / '+records.length+' saved sessions. '));
    if(sessions.length>20){status.append(document.createTextNode('Page '+(page+1)+' of '+Math.ceil(sessions.length/20)+' '));for(const [label,delta,disabled]of [['Previous',-1,page===0],['Next',1,(page+1)*20>=sessions.length]]){const b=text('button',label,'secondary');b.type='button';b.disabled=disabled;b.addEventListener('click',()=>{page+=delta;render();});status.append(b);}}
    renderMaps(sessions);if(selected){const r=records.find(r=>r.id===selected);if(r)review(r);}
  }
  function renderMaps(sessions){
    const metric=$('compare-metric').value,groups=M.groupMaps(sessions,metric),body=$('map-rows');body.replaceChildren();
    for(const [i,g]of groups.entries()){const tr=document.createElement('tr');for(const value of [(i+1)+'. '+g.map,g.runs+' / '+time(g.time),fmt(g.expHour),fmt(g.netHour)])tr.append(text('td',value));body.append(tr);}
    if(!groups.length){$('map-highlights').textContent=records.length?'No maps match the current history filters.':'Finish and save your first session to start comparing maps.';emptyChart($('map-chart'),records.length?'Change the class or level filters above to see your maps.':'Every map you log gets a place on this chart.');return;}
    const profitable=[...groups].sort((a,b)=>b.netHour-a.netHour)[0];$('map-highlights').textContent='Fastest EXP: '+groups[0].map+' · Highest net rate: '+profitable.map+'. '+(metric==='estimatedNet'?'Profit includes estimated unsold loot.':'');
    const xs=groups.map(g=>g.expHour),ys=groups.map(g=>g.netHour),xLow=Math.min(0,...xs),xHigh=Math.max(1,...xs),yLow=Math.min(0,...ys),yHigh=Math.max(1,...ys),pad=Math.max(1,(yHigh-yLow)*.15);
    const {svg,X,Y}=baseChart($('map-chart'),'Map EXP per hour versus '+metric+' mesos per hour','EXP / hour',metric==='estimatedNet'?'Estimated mesos / hour':'Net mesos / hour',xLow,xHigh*1.08,yLow-pad,yHigh+pad);
    for(const [i,g]of groups.entries()){const dot=svgElement('circle',{cx:X(g.expHour),cy:Y(g.netHour),r:7,class:'map-dot'});dot.append(svgElement('title',{},g.map+' · '+fmt(g.expHour)+' EXP/h · '+fmt(g.netHour)+' mesos/h · '+g.runs+' runs'));svg.append(dot,svgElement('text',{x:X(g.expHour)+11,y:Y(g.netHour)+4,class:'chart-marker'},String(i+1)));}
  }
  function save(session){
    try{const stored=localStorage.getItem(key);if(stored)records=M.mergeHistory(records,JSON.parse(stored));}
    catch{records=M.mergeHistory(records,[session]);render();throw new Error('Existing browser history could not be read safely. This run is in memory; use Back up JSON before closing. Existing storage has not been overwritten.');}
    records=M.mergeHistory(records,[session]);render();try{localStorage.setItem(key,JSON.stringify(records));}catch{throw new Error('History is available in this tab but could not be written to browser storage. Use Back up JSON before closing.');}
  }
  function download(filename,type,contents){const url=URL.createObjectURL(new Blob([contents],{type})),a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  $('export-json').addEventListener('click',()=>download('maple-journal-history.json','application/json',JSON.stringify({schemaVersion:1,exportedAt:new Date().toISOString(),sessions:records},null,2)));
  function csvCell(value){let s=String(value??'');if(/^\s*[=+@\-]/.test(s)||/^[\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
  $('export-csv').addEventListener('click',()=>{
    const header=['Date','Map','Class','Starting level','Ending level','Active seconds','Paused seconds','EXP gained','Original net','Adjusted cash net','Estimated net with loot','EXP/hour','Net mesos/hour'];
    const lines=records.map(s=>{const r=M.calculate(s.start,s.end,M.activeElapsed(s));return [new Date(s.stoppedAt).toISOString(),s.meta.map,s.meta.class,s.start.level,s.end.level,r.durationMs/1000,s.pausedMs/1000,r.exp,r.net,r.adjustedNet,r.estimatedNet,r.rates.hour.exp,r.rates.hour.mesos].map((v,i)=>i<3?csvCell(v):String(v??'')).join(',');});download('maple-journal-history.csv','text/csv;charset=utf-8','\uFEFF'+[header.join(','),...lines].join('\r\n'));
  });
  $('import-json').addEventListener('change',async event=>{
    const file=event.target.files[0];if(!file)return;
    try{if(file.size>5000000)throw new Error('Choose a JSON backup smaller than 5 MB.');const data=JSON.parse(await file.text());if(data.schemaVersion!==1||!Array.isArray(data.sessions))throw new Error('Choose a Maple Journal schema-version 1 backup.');const merged=M.mergeHistory(records,data.sessions);records=merged;render();try{localStorage.setItem(key,JSON.stringify(records));}catch{throw new Error('Import is in memory only; browser storage is full. Export a backup before closing.');}notice('');$('history-status').prepend(document.createTextNode('Backup restored. Matching IDs were updated; other sessions were kept. '));}catch(e){notice('Backup could not be restored: '+e.message);}finally{event.target.value='';}
  });
  for(const id of ['filter-class','filter-min','filter-max','compare-metric'])$(id).addEventListener(id==='filter-min'||id==='filter-max'?'input':'change',()=>{page=0;notice('');render();});
  try{const raw=JSON.parse(localStorage.getItem(key)||'[]');records=M.mergeHistory([],raw);}catch(e){notice('Saved history could not be read: '+e.message+'. Existing storage has not been overwritten.');}
  window.addEventListener('storage',event=>{if(event.key===key&&event.newValue){try{records=M.mergeHistory(records,JSON.parse(event.newValue));render();}catch(e){notice('History in another tab could not be loaded: '+e.message);}}});
  window.MapleHistory={save,render,lineChart};render();
})();
