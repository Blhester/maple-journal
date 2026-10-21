(() => {
  'use strict';
  const $=id=>document.getElementById(id),M=MapleMath,storageKey='maple-journal-session-v1';
  // Switch views without rebuilding the tracker or interrupting an active timer.
  const viewTabs=[$('session-tab'),$('history-tab')];
  function selectView(name,{focus=false,updateHash=false}={}){
    const history=name==='history';
    for(const tab of viewTabs){const selected=tab.id===(history?'history-tab':'session-tab');tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;}
    $('session-view').hidden=history;$('history-view').hidden=!history;
    if(focus)$(history?'history-tab':'session-tab').focus();
    if(updateHash)window.history.replaceState(null,'',history?'#history':'#session');
  }
  function viewFromHash(){return ['#history','#history-view','#history-section','#comparison-section'].includes(window.location.hash)?'history':'session';}
  for(const [index,tab]of viewTabs.entries()){
    tab.addEventListener('click',()=>selectView(index===1?'history':'session',{updateHash:true}));
    tab.addEventListener('keydown',event=>{
      let next;
      if(event.key==='ArrowRight'||event.key==='ArrowLeft')next=1-index;
      else if(event.key==='Home')next=0;else if(event.key==='End')next=1;else return;
      event.preventDefault();selectView(next===1?'history':'session',{focus:true,updateHash:true});
    });
  }
  window.addEventListener('hashchange',()=>selectView(viewFromHash()));
  selectView(viewFromHash());
  const number=new Intl.NumberFormat('en-US',{maximumFractionDigits:2});
  const startIds=['session-map','session-class','start-level','start-exp','start-mesos','hp-potion','start-hp','hp-cost','mp-potion','start-mp','mp-cost'];
  const endIds=['end-level','end-exp','end-mesos','end-hp','end-mp','extra-exp','hp-added','mp-added'];
  let state={stage:'setup',ledger:[],checkpoints:[]},timerInterval,latest=null,autoRecorder=null,autoFilter=null,autoLayout=null,autoPreview=null,autoLastSample=null,autoMessage='Off. Enable Auto screenshots to choose a monitor.';
  MapleEtc.init({getEntries:()=>state.ledger||[],onChange:entries=>{state.ledger=entries;persist();renderLedger();}});
  MapleScreenshot.init({
    onCaptureEnded:()=>{if(autoRecorder?.active())stopAuto('Screen sharing stopped. Turn Auto screenshots on to choose a monitor again.',false);},
    getContext:()=>({stage:state.stage,hasLevel:!!state.start?.level,hpPotion:state.start?.hpPotion||$('hp-potion').value,mpPotion:state.start?.mpPotion||$('mp-potion').value}),
    apply:incoming=>{
      const setup=state.stage==='setup';if(!setup&&state.stage!=='ending')throw new Error('Screenshot values can only fill the setup or ending form.');
      const prefix=setup?'start':'end',level=incoming.level??(setup?$('start-level').value:state.start.level?$('end-level').value:null),exp=incoming.exp??$(prefix+'-exp').value;
      if(level&&exp!=='')M.position(level,exp);
      if(!setup&&incoming.level&&Number(incoming.level)<state.start.level)throw new Error('Ending level cannot be below starting level.');
      for(const [field,value]of Object.entries(incoming)){
        if(['hpPotion','mpPotion'].includes(field))continue;
        const id=field==='map'?'session-map':field==='class'?'session-class':prefix+'-'+field;
        if(!setup&&['map','class'].includes(field))continue;
        if(['hp','mp'].includes(field)&&setup){const select=$(field+'-potion'),item=incoming[field+'Potion'];if(item&&select.value!==item){select.value=item;select.dispatchEvent(new Event('change',{bubbles:true}));}}
        $(id).value=value;$(id).dispatchEvent(new Event('input',{bubbles:true}));
      }
      persist();render();$('screenshot-applied').textContent='Screenshot values applied. Check your supply items and total quantities before continuing.';
    }
  });
  function paintAuto(){
    const on=!!autoRecorder?.active(),running=state.stage==='running';
    $('auto-progress-toggle').checked=on;
    $('auto-progress-toggle').disabled=!running||(!on&&(!!state.pausedAt||!state.start?.level||!MapleScreenCapture.supported()));
    $('auto-progress-status').textContent=running&&!state.start?.level?'Automatic mode needs a recorded starting level. Finish this run manually; add a level before your next session.':autoMessage;
    const cp=state.autoPoints?.at(-1)||state.checkpoints?.filter(point=>point.source==='automatic').at(-1);
    $('auto-progress-last').textContent=cp?'Last confirmed at '+duration(cp.elapsedMs)+' · EXP '+format(cp.end.exp)+' · mesos '+(cp.end.mesos===null?'N/A':format(cp.end.mesos))+' · HP '+cp.end.hp+' · MP '+cp.end.mp+'. Latest unconfirmed readings are not counted.':'No automatic checkpoints confirmed yet. Final values always need your review.';
    paintLive();
    $('auto-progress-log').replaceChildren(...(state.autoLog||[]).slice(-30).reverse().map(item=>{
      const li=document.createElement('li');li.textContent=duration(item.elapsedMs||0)+' · '+item.status+' · '+item.message+(item.values?' [Lv '+item.values.level+', EXP '+item.values.exp+', mesos '+(item.values.mesos===null?'N/A':item.values.mesos)+', HP '+item.values.hp+', MP '+item.values.mp+']':'');return li;
    }));
  }
  function progressPoints(){
    const points=new Map();for(const point of [...(state.checkpoints||[]),...(state.autoPoints||[])])points.set(point.elapsedMs,point);return [...points.values()].sort((a,b)=>a.elapsedMs-b.elapsedMs);
  }
  function paintLive(){
    const running=state.stage==='running';$('live-dashboard').hidden=!running;if(!running)return;
    const confirmed=progressPoints(),points=[...confirmed];if(autoPreview&&autoPreview.elapsedMs>(points.at(-1)?.elapsedMs||0))points.push(autoPreview);
    const point=points.at(-1),pending=!!point?.preview;
    $('live-quality').textContent=point?(pending?'Latest capture · pending':'Confirmed progress'):'Waiting for a capture';
    $('live-context').textContent=[state.meta?.map,state.meta?.class].filter(Boolean).join(' · ')||'Rates use active training time and your validated starting values.';
    for(const id of ['exp-hour','mesos-hour','level','hp','mp','supply-cost','eta'])$('live-'+id).textContent='N/A';
    $('live-confirmed').textContent=String(state.autoPoints?.length||0);$('live-exp-gained').textContent='No usable capture yet';$('live-net-total').textContent='Keep your inventory open to read mesos';
    const rows=[{to:0,expHour:0,netHour:0},...points.map(p=>{const s=MapleAutoProgress.stats(state.start,p);return {to:p.elapsedMs,expHour:s.expHour,netHour:s.netHour,preview:!!p.preview};})];
    if(autoLastSample&&!autoLastSample.mesosReadable&&autoLastSample.elapsedMs>(rows.at(-1)?.to||0))rows.push({to:autoLastSample.elapsedMs,expHour:null,netHour:null});
    MapleHistory.lineChart($('live-exp-chart'),rows,'expHour',{live:true});MapleHistory.lineChart($('live-mesos-chart'),rows,'netHour',{live:true});
    if(!point){$('live-exp-hour').textContent='0';$('live-exp-gained').textContent='0 EXP gained';$('live-mesos-hour').textContent=autoLastSample?'N/A':'0';$('live-net-total').textContent=autoLastSample?'Mesos N/A · awaiting a readable capture':'0 net mesos · starting balance';$('live-snapshot-note').textContent='Rates start at 0. A usable capture after one full active minute starts the rate estimates. Keep the HUD and potion counts visible; mesos needs an open inventory.';return;}
    const stats=MapleAutoProgress.stats(state.start,point),mesosAvailable=point.end.mesos!==null&&autoLastSample?.mesosReadable!==false;
    if(!stats.rateReady)$('live-quality').textContent='Gathering first minute';
    $('live-exp-hour').textContent=format(stats.expHour);$('live-exp-gained').textContent=format(stats.exp)+' EXP gained';
    if(mesosAvailable){$('live-mesos-hour').textContent=format(stats.netHour);$('live-net-total').textContent=format(stats.net)+' net mesos · after potion costs';}
    else $('live-net-total').textContent='Mesos N/A · inventory hidden, unreadable or awaiting validation';
    $('live-level').textContent=(point.end.level||'Level N/A')+' · '+format(point.end.exp)+' EXP';$('live-hp').textContent=format(point.end.hp)+' '+(M.catalog.hp.find(item=>item.id===state.start.hpPotion)?.name||'items');$('live-mp').textContent=format(point.end.mp)+' '+(M.catalog.mp.find(item=>item.id===state.start.mpPotion)?.name||'items');$('live-supply-cost').textContent=format(stats.supplyCost)+' mesos';$('live-eta').textContent=eta(stats.etaMs);
    $('live-snapshot-note').textContent=(pending?'Pending capture':'Confirmed snapshot')+' at '+duration(point.elapsedMs)+' active training. '+(!stats.rateReady?'Rates stay at 0 until a usable capture after one full active minute. Totals still show detected changes. ':pending?'Provisional rates update after each capture; this point is excluded from confirmed history until validated.':'Only confirmed values are counted.')+(!mesosAvailable?' EXP continues while mesos is N/A.':'');
  }
  function autoLog(point,status,message){
    state.autoLog??=[];const at=point?.at||Date.now(),entry={at,elapsedMs:point?.elapsedMs||elapsed(),status,message};
    if(point?.end)entry.values=Object.fromEntries(['level','exp','mesos','hp','mp'].map(k=>[k,point.end[k]]));
    const index=state.autoLog.findIndex(item=>item.at===at);if(index>=0)state.autoLog[index]=entry;else state.autoLog.push(entry);state.autoLog=state.autoLog.slice(-30);
  }
  function stopAuto(message='Automatic screenshots are off. Unconfirmed samples are not counted.',stopSharing=true){
    autoRecorder?.stop(message);autoFilter=null;autoLayout=null;autoPreview=null;
    if(stopSharing)MapleScreenshot.stopSharing();paintAuto();
  }
  function rebaseAuto(){
    if(!autoRecorder?.active())return;
    autoRecorder.cancelPending();autoFilter=MapleAutoProgress.createFilter({start:state.start,anchor:progressPoints().at(-1),mesoAnchor:state.checkpoints.at(-1)});
    autoMessage='Manual checkpoint recorded. Automatic validation now uses its values and cumulative restocks.';paintAuto();
  }
  autoRecorder=MapleAutoProgress.createRecorder({
    now:()=>Date.now(),getContext:()=>({running:state.stage==='running',paused:!!state.pausedAt,sessionId:state.id}),
    sample:args=>MapleScreenshot.sampleProgress(args),
    onStatus:status=>{if(status.message)autoMessage=status.message;paintAuto();},
    onSample:read=>{
      try{
        const layout=read.width+'x'+read.height+':'+read.layout;
        if(autoLayout&&autoLayout!==layout){autoLog(null,'Skipped','Screen size or read settings changed. Recalibrate before restarting.');stopAuto('Capture layout changed. Check your regions and restart automatic mode.');persist();return;}autoLayout=layout;
        autoLastSample={elapsedMs:M.activeElapsed(state,read.at),mesosReadable:false};
        const point=MapleAutoProgress.fromRead(read,state.start,autoLastSample.elapsedMs),result=autoFilter.offer(point);autoPreview=result.preview;autoLastSample.mesosReadable=autoPreview?.end.mesos!==null&&!!autoPreview;
        for(const rejected of result.rejected)autoLog(rejected.point,'Discarded',rejected.reason);
        autoLog(point,result.held?'Held':'Waiting',result.message);
        for(const accepted of result.accepted){
          if((state.autoPoints?.length||0)>=4999||state.checkpoints.length>=4999){stopAuto('Checkpoint limit reached. Finish this session before starting another.');return;}
          state.autoPoints??=[];if(accepted.elapsedMs>(state.autoPoints.at(-1)?.elapsedMs||0))state.autoPoints.push(accepted);
          if(accepted.end.mesos!==null&&accepted.elapsedMs>(state.checkpoints.at(-1)?.elapsedMs||0))state.checkpoints.push(accepted);
          autoLog(accepted,'Confirmed',accepted.end.mesos===null?'EXP and supplies confirmed. Mesos N/A: '+accepted.mesosNote:'Saved as a full progress checkpoint.');
        }
        autoMessage=result.message;persist();paintAuto();tick();
      }catch(error){autoPreview=null;if(autoLastSample)autoLastSample.mesosReadable=false;autoLog(null,'Skipped',error.message);autoMessage=error.message;persist();paintAuto();}
    }
  });
  $('auto-calibrate').addEventListener('click',()=>{if(state.stage!=='running')return;if(autoRecorder.active())stopAuto('Automatic capture stopped for calibration. Enable it again when ready.');MapleScreenshot.openCalibration();});
  $('auto-progress-toggle').addEventListener('change',()=>{
    if(!$('auto-progress-toggle').checked){stopAuto();return;}
    if(state.stage!=='running'||state.pausedAt||!state.start.level){paintAuto();return;}
    autoFilter=MapleAutoProgress.createFilter({start:state.start,anchor:progressPoints().at(-1),mesoAnchor:state.checkpoints.at(-1)});autoLayout=null;autoPreview=null;autoRecorder.start();
  });
  window.addEventListener('pagehide',()=>autoRecorder.stop('Reloaded or left page. Automatic capture must be enabled again.'));
  const format=n=>number.format(Math.abs(n)<.005?0:n);
  function duration(ms){const n=Math.max(0,Math.floor(ms/1000));return [Math.floor(n/3600),Math.floor(n/60)%60,n%60].map(x=>String(x).padStart(2,'0')).join(':');}
  function eta(ms){if(ms===null)return '—';if(ms===0)return 'Reached';if(ms<60000)return '< 1 minute';const min=Math.ceil(ms/60000);return min>=60?Math.floor(min/60)+'h '+min%60+'m':min+' min';}
  function error(id,message){$(id).textContent=message||'';$(id).hidden=!message;}
  function values(ids){return Object.fromEntries(ids.map(id=>[id,$(id).value]));}
  function restoreFields(fields){for(const [id,value]of Object.entries(fields||{}))if([...startIds,...endIds].includes(id))$(id).value=value;}
  function persist(){state.startFields=values(startIds);state.endFields=values(endIds);try{localStorage.setItem(storageKey,JSON.stringify(state));}catch{$('storage-warning').hidden=false;}}
  const elapsed=()=>M.activeElapsed(state);
  function tick(){
    const active=elapsed();$('timer').innerHTML=duration(active).split(':').join('<span>:</span>');
    const wall=state.startedAt?Math.max(0,(state.stoppedAt??Date.now())-state.startedAt):0;
    $('wall-time').textContent='Wall time '+duration(wall)+' · breaks '+duration(wall-active);
    const last=state.checkpoints?.at(-1)?.elapsedMs||0;
    $('checkpoint-reminder').hidden=state.stage!=='running'||!!state.pausedAt||active-last<600000;
  }
  function paint(id,value){$(id).textContent=format(value);$(id).classList.toggle('negative',value<0);}
  function snapshot(){
    if(state.stage==='complete')return {end:state.end,time:elapsed(),label:'Final session results · '+duration(elapsed())+' active training'};
    return null;
  }
  function updateForecast(){
    if(!latest)return;
    try{const plan=M.forecast(latest.end,latest.result,$('target-level').value);$('target-eta').textContent=eta(plan.etaMs);$('target-detail').textContent=plan.reason||(format(plan.remaining)+' EXP remaining to level '+plan.target+'. Based on the observed active-time pace.');for(const p of plan.projections){paint('projection-exp-'+p.minutes,p.exp);paint('projection-mesos-'+p.minutes,p.mesos);}}
    catch(e){$('target-eta').textContent='—';$('target-detail').textContent=e.message;}
  }
  function renderProfit(){
    if(!latest)return;
    const r=latest.result,metric=$('profit-metric').value,rates=M.profitRates(r,metric);
    paint('total-net',r[metric]);
    for(const p of ['hour','ten','minute'])paint('mesos-'+p,rates[p]);
    $('profit-total-label').textContent=metric==='estimatedNet'?'TOTAL NET WITH LOOT':metric==='adjustedNet'?'ADJUSTED CASH NET':'NET MESOS';
    $('profit-column-label').textContent=metric==='estimatedNet'?'NET + LOOT':'NET MESOS';
    $('profit-note').textContent=metric==='estimatedNet'?'Includes unsold loot at its vendor estimate. Cash and estimated value are separated in the breakdown below.':metric==='adjustedNet'?'Includes sales and expenses recorded outside your ending balance. Unsold items are excluded.':'Your ending balance change minus potion costs. Loot and extra ledger entries are excluded.';
  }
  function renderResults(){
    const complete=state.stage==='complete';$('session-results').hidden=!complete;$('review-link').hidden=!complete;$('session-nav').hidden=!complete;latest=null;if(!complete)return;const snap=snapshot();
    for(const id of ['total-exp','total-net','gross','hp-spend','mp-spend','net-breakdown','adjusted-net','estimated-net','loot-total',...['hour','ten','minute'].flatMap(p=>['exp-'+p,'mesos-'+p])]){$(id).textContent='—';$(id).classList.remove('negative');}
    $('hp-used').textContent='';$('mp-used').textContent='';$('ledger-totals').hidden=true;
    for(const id of ['hp-efficiency','mp-efficiency','supply-cost','supply-share','hp-runway','mp-runway','target-eta','projection-exp-30','projection-mesos-30','projection-exp-60','projection-mesos-60'])$(id).textContent='—';
    $('results-description').textContent='Log a checkpoint or finish to see your pace and profit.';$('insight-source').textContent='Log a checkpoint or finish a session to unlock insights.';$('target-detail').textContent='Add starting and ending levels to estimate leveling time.';
    if(snap){
      const r=M.calculate(state.start,snap.end,snap.time);latest={...snap,result:r};
      paint('total-exp',r.exp);paint('total-net',r.net);paint('gross',r.gross);paint('net-breakdown',r.net);
      $('hp-used').textContent='· '+format(r.hpUsed)+' × '+format(state.start.hpCost);$('mp-used').textContent='· '+format(r.mpUsed)+' × '+format(state.start.mpCost);$('hp-spend').textContent='−'+format(r.hpCost);$('mp-spend').textContent='−'+format(r.mpCost);
      for(const p of ['hour','ten','minute']){paint('exp-'+p,r.rates[p].exp);paint('mesos-'+p,r.rates[p].mesos);}
      $('results-description').textContent=snap.label;$('insight-source').textContent=snap.label;
      $('hp-efficiency').textContent=format(r.hpPerMinute);$('mp-efficiency').textContent=format(r.mpPerMinute);$('supply-cost').textContent=format(r.supplyCostPerHour);$('supply-share').textContent=r.supplyShare===null?'N/A':format(r.supplyShare)+'%';
      $('hp-runway').textContent=r.hpRunwayMs===0?'Empty':r.hpRunwayMs===null?'No use recorded':eta(r.hpRunwayMs);$('mp-runway').textContent=r.mpRunwayMs===0?'Empty':r.mpRunwayMs===null?'No use recorded':eta(r.mpRunwayMs);
      if(snap.end.ledger?.length){$('ledger-totals').hidden=false;$('ledger-cash').textContent='+'+format(r.ledger.income)+' / −'+format(r.ledger.expense);paint('adjusted-net',r.adjustedNet);paint('estimated-net',r.estimatedNet);paint('loot-total',r.ledger.loot);}
      renderProfit();updateForecast();
    }
    renderTrend();
  }
  function renderTrend(){
    if(state.stage!=='complete')return;
    const rows=state.start?M.intervals(state.start,state.checkpoints||[],state.stage==='complete'?state.end:null,state.stage==='complete'?elapsed():0):[];
    const body=$('trend-rows');body.replaceChildren();
    for(const row of rows){const tr=document.createElement('tr');for(const v of [duration(row.from)+'–'+duration(row.to),format(row.expHour),format(row.netHour)]){const td=document.createElement('td');td.textContent=v;tr.append(td);}body.append(tr);}
    $('trend-note').textContent=rows.length?rows.length+' interval'+(rows.length===1?'':'s')+' · rates compare consecutive snapshots, with paused time excluded.':'Each checkpoint reveals the pace of the interval before it.';MapleHistory.lineChart($('trend-chart'),rows,$('trend-metric').value);
  }
  function renderLedger(){
    const ul=$('ledger-list');ul.replaceChildren();
    MapleEtc.render(state.ledger||[]);
    for(const [index,item]of(state.ledger||[]).entries()){
      if(item.source==='etc')continue;
      const li=document.createElement('li'),span=document.createElement('span'),button=document.createElement('button');span.textContent=({loot:'Estimated loot',income:'Uncounted income',expense:'Uncounted expense'})[item.kind]+' · '+item.label+' · '+format(item.value)+' mesos';button.type='button';button.className='text-button';button.textContent='Remove';button.setAttribute('aria-label','Remove '+item.label);button.addEventListener('click',()=>{state.ledger.splice(index,1);persist();renderLedger();});li.append(span,button);ul.append(li);
    }
  }
  function render(){
    const setup=state.stage==='setup',running=state.stage==='running',ending=state.stage==='ending',complete=state.stage==='complete',paused=!!state.pausedAt,hasLevel=!!state.start?.level;
    $('ocr-start-actions').hidden=!setup;$('start-form').hidden=!setup;$('start-fields').disabled=!setup;$('start-button').hidden=!setup;$('start-note').hidden=!setup;$('running-actions').hidden=!running;$('end-form').hidden=!ending;$('completed-actions').hidden=!complete;$('discard-button').hidden=setup||complete;$('discard-confirm').hidden=true;
    $('stage-label').textContent=setup?'01 / PREPARE':running?'02 / TRAIN':'03 / REVIEW';$('session-title').textContent=setup?'Before the adventure':running?'Enjoy the adventure':ending?'Back from the adventure':'A session well spent';$('status').textContent=setup?'Ready when you are':running?(paused?'Taking a break':'Session in progress'):ending?'Timer stopped':'Session complete';
    for(let i=1;i<=3;i++)$('step-'+i).classList.toggle('active',i===(setup?1:running?2:3));
    $('timer-state').textContent=setup?'NOT STARTED':running?(paused?'PAUSED':'RECORDING'):complete?'COMPLETE':'STOPPED';$('timer-note').textContent=setup?'Your next adventure starts here.':running?(paused?'Take your time. Breaks do not count toward your pace.':'Every little bit of progress adds up.'):'Training time saved. Take your time with the numbers.';
    $('pause-button').textContent=paused?'▶ Resume':'Ⅱ Pause';$('running-message').textContent=paused?'A well-earned break.':'You’re on the clock.';$('cp-save').disabled=paused;$('end-level-wrap').hidden=!hasLevel;$('end-level').required=hasLevel;$('manual-exp-wrap').hidden=hasLevel;$('cp-level-wrap').hidden=!hasLevel;$('cp-level').required=hasLevel;$('cp-extra-wrap').hidden=hasLevel;
    clearInterval(timerInterval);tick();if(running)timerInterval=setInterval(tick,250);renderLedger();renderResults();updateLevelHint();MaplePotionPicker.syncAll();paintAuto();
  }
  function updateLevelHint(){$('auto-start').disabled=!$('start-level').value||!MapleScreenCapture.supported();try{const v=$('start-level').value;$('level-hint').textContent=v?(Number(v)===100?'Level 100 is the end of the supported EXP table.':format(M.expTable[M.levelNumber(v)])+' EXP needed for this level. Enter within-level EXP below.'):'Add a level to handle level-ups and estimate time to your next level.';}catch(e){$('level-hint').textContent=e.message;}}
  for(const type of ['hp','mp']){
    $(type+'-potion').replaceChildren(...M.catalog[type].map(p=>new Option(p.name+(p.id==='custom'?'':' · '+format(p.cost)+' mesos'),p.id)));$(type+'-potion').value=type==='hp'?'meat':'lemon';const updatePrice=()=>{$(type+'-cost').value=M.catalog[type].find(p=>p.id===$(type+'-potion').value).cost;};updatePrice();$(type+'-potion').addEventListener('change',()=>{updatePrice();persist();});
    MaplePotionPicker.enhance($(type+'-potion'),type);
  }
  $('start-form').addEventListener('submit',event=>{
    event.preventDefault();if(state.stage!=='setup')return;
    try{
      const start={};for(const k of ['exp','mesos','hp','mp'])start[k]=M.integer($('start-'+k).value,'Starting '+k);start.hpCost=M.integer($('hp-cost').value,'HP cost');start.mpCost=M.integer($('mp-cost').value,'MP cost');start.hpPotion=$('hp-potion').value;start.mpPotion=$('mp-potion').value;start.level=$('start-level').value?M.levelNumber($('start-level').value):null;if(start.level)M.position(start.level,start.exp);
      const now=Date.now();state={stage:'running',id:'run-'+now+'-'+Math.random().toString(36).slice(2,8),start,startedAt:now,pausedMs:0,checkpoints:[],ledger:[],meta:{map:$('session-map').value.trim(),class:$('session-class').value.trim()}};$('end-level').value=start.level||'';$('cp-level').value=start.level||'';error('start-error','');persist();render();$('done-button').focus();if($('auto-start').checked&&start.level&&MapleScreenCapture.supported()){autoFilter=MapleAutoProgress.createFilter({start});autoLayout=null;autoRecorder.start();}
    }catch(e){error('start-error',e.message);}
  });
  $('pause-button').addEventListener('click',()=>{if(state.stage!=='running')return;const now=Date.now();if(state.pausedAt){state.pausedMs=(state.pausedMs||0)+Math.max(0,now-state.pausedAt);state.pausedAt=null;}else state.pausedAt=now;if(autoRecorder.active()){autoRecorder.cancelPending();autoMessage=state.pausedAt?'Paused with the session. No screenshots during breaks.':'Resumed. Next automatic snapshot in about one minute.';}persist();render();});
  $('done-button').addEventListener('click',()=>{
    if(state.stage!=='running')return;const wasAutomatic=autoRecorder.active();if(wasAutomatic)stopAuto('Automatic screenshots stopped. Review your ending values.');const now=Date.now();if(state.pausedAt){state.pausedMs=(state.pausedMs||0)+Math.max(0,now-state.pausedAt);state.pausedAt=null;}state.stoppedAt=Math.max(now,state.startedAt+(state.pausedMs||0)+1);state.stage='ending';const cp=progressPoints().at(-1);if(cp){if(cp.source==='automatic'){for(const k of ['exp','mesos','hp','mp'])$('end-'+k).value=cp.end[k]===null?'':cp.end[k];$('screenshot-applied').textContent='Ending fields start from the last confirmed checkpoint at '+duration(cp.elapsedMs)+'. Update and review your actual final values before calculating.';}$('hp-added').value=cp.end.hpAdded;$('mp-added').value=cp.end.mpAdded;$('end-level').value=cp.end.level||'';if(!state.start.level)$('extra-exp').value=cp.end.extraExp;}persist();render();$('end-exp').focus();
  });
  function readEnd(prefix){const e={};for(const k of ['exp','mesos','hp','mp'])e[k]=M.integer($(prefix+'-'+k).value,'Ending '+k);const cp=prefix==='cp';e.hpAdded=M.integer($(cp?'cp-hp-added':'hp-added').value,'HP items added');e.mpAdded=M.integer($(cp?'cp-mp-added':'mp-added').value,'MP items added');e.level=state.start.level?M.levelNumber($(cp?'cp-level':'end-level').value):null;e.extraExp=state.start.level?0:M.integer($(cp?'cp-extra':'extra-exp').value,'Manual level-up EXP');e.ledger=cp?[]:structuredClone(state.ledger||[]);return e;}
  $('checkpoint-form').addEventListener('submit',event=>{
    event.preventDefault();if(state.stage!=='running'||state.pausedAt)return;
    try{const time=elapsed(),end=readEnd('cp');if(time<=(state.checkpoints.at(-1)?.elapsedMs||0))throw new Error('Let some active training time pass before another checkpoint.');M.calculate(state.start,end,time);state.checkpoints.push({end,elapsedMs:time,at:Date.now()});autoPreview=null;autoLastSample=null;rebaseAuto();paintLive();error('cp-error','');$('cp-saved').textContent='Checkpoint saved at '+duration(time)+'.';persist();renderResults();tick();}catch(e){error('cp-error',e.message);}
  });
  $('ledger-add').addEventListener('click',()=>{
    try{const label=$('ledger-label').value.trim();if(!label)throw new Error('Give the entry a description.');const entry={label,value:M.integer($('ledger-value').value,'Ledger value'),kind:$('ledger-kind').value};M.ledgerTotals([...(state.ledger||[]),entry]);state.ledger??=[];state.ledger.push(entry);$('ledger-label').value='';$('ledger-value').value='';error('ledger-error','');persist();renderLedger();}catch(e){error('ledger-error',e.message);}
  });
  $('end-form').addEventListener('submit',event=>{
    event.preventDefault();if(state.stage!=='ending')return;
    try{const end=readEnd('end');M.calculate(state.start,end,elapsed());state.checkpoints=state.checkpoints.filter(cp=>cp.elapsedMs<elapsed());M.intervals(state.start,state.checkpoints,end,elapsed());state.end=end;state.stage='complete';$('profit-metric').value=end.ledger.some(e=>e.kind==='loot')?'estimatedNet':end.ledger.length?'adjustedNet':'net';error('end-error','');persist();try{MapleHistory.save(state);}catch(e){error('history-error',e.message);}render();$('results-heading').setAttribute('tabindex','-1');$('results-heading').focus({preventScroll:true});}catch(e){error('end-error',e.message);}
  });
  $('edit-button').addEventListener('click',()=>{state.stage='ending';state.ledger=structuredClone(state.end.ledger||[]);persist();render();$('end-exp').focus();});
  function reset(){
    if(autoRecorder.active())stopAuto();autoMessage='Off. Enable automatic screenshots when your next session starts.';
    // Keep the last supply choices (and custom prices) in the next saved draft.
    const supplies=values(['hp-potion','hp-cost','mp-potion','mp-cost']);
    $('screenshot-applied').textContent='';MapleEtc.reset();state={stage:'setup',checkpoints:[],ledger:[]};autoPreview=null;autoLastSample=null;$('start-form').reset();$('end-form').reset();$('checkpoint-form').reset();restoreFields(supplies);
    for(const id of ['adjustments','ledger-details','checkpoint-details'])$(id).open=false;for(const id of ['end-error','start-error','cp-error','ledger-error'])error(id,'');$('cp-saved').textContent='';persist();render();$('start-exp').focus();
  }
  $('new-button').addEventListener('click',reset);$('discard-button').addEventListener('click',()=>{$('discard-confirm').hidden=false;$('keep-button').focus();});$('keep-button').addEventListener('click',()=>{$('discard-confirm').hidden=true;$('discard-button').focus();});$('confirm-discard').addEventListener('click',reset);
  for(const id of [...startIds,...endIds])$(id).addEventListener('input',()=>{persist();if(id==='start-level')updateLevelHint();});$('profit-metric').addEventListener('change',renderProfit);$('target-level').addEventListener('input',updateForecast);$('trend-metric').addEventListener('change',renderTrend);document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick();});
  try{
    const saved=JSON.parse(localStorage.getItem(storageKey));
    if(saved&&['setup','running','ending','complete'].includes(saved.stage)){
      saved.checkpoints??=[];saved.ledger??=saved.end?.ledger||[];saved.pausedMs??=0;if(!Array.isArray(saved.checkpoints)||saved.checkpoints.length>5000)throw new Error('Invalid checkpoint list');M.ledgerTotals(saved.ledger);
      if(saved.stage!=='setup'){
        for(const k of ['exp','mesos','hp','mp','hpCost','mpCost'])M.integer(saved.start[k],k);if(!Number.isSafeInteger(saved.startedAt)||saved.startedAt<=0)throw new Error('Invalid start time');M.integer(saved.pausedMs,'Paused time');if(saved.pausedAt&&(!Number.isSafeInteger(saved.pausedAt)||saved.pausedAt<saved.startedAt))throw new Error('Invalid paused time');if(saved.stage!=='running'&&(!Number.isSafeInteger(saved.stoppedAt)||M.activeElapsed(saved)<=0))throw new Error('Invalid stop time');if(saved.pausedMs>(saved.stoppedAt??saved.pausedAt??Date.now())-saved.startedAt)throw new Error('Invalid pause duration');if((saved.checkpoints.at(-1)?.elapsedMs||0)>M.activeElapsed(saved))throw new Error('Checkpoint is beyond session time');if(saved.start.level)M.position(saved.start.level,saved.start.exp);saved.autoPoints=M.normalizeProgress(saved.start,saved.autoPoints||saved.checkpoints.filter(p=>p.source==='automatic'),M.activeElapsed(saved));M.intervals(saved.start,saved.checkpoints,saved.stage==='complete'?saved.end:null,saved.stage==='complete'?M.activeElapsed(saved):0);if(saved.stage==='complete')M.calculate(saved.start,saved.end,M.activeElapsed(saved));saved.id??='run-'+saved.startedAt;saved.meta??={map:saved.startFields?.['session-map']||'',class:saved.startFields?.['session-class']||''};
      }
      state=saved;restoreFields(saved.startFields);restoreFields(saved.endFields);if(saved.start?.level){$('end-level').value=saved.endFields?.['end-level']||saved.end?.level||saved.start.level;$('cp-level').value=saved.checkpoints.at(-1)?.end.level||saved.start.level;}if(saved.stage==='complete')$('profit-metric').value=saved.end.ledger?.some(e=>e.kind==='loot')?'estimatedNet':saved.end.ledger?.length?'adjustedNet':'net';
    }
  }catch(e){error('history-error','A saved session could not be fully restored: '+e.message+'. Your saved history is kept separately.');}
  render();
})();
