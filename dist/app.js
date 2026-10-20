(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const {catalog,integer,calculate} = MapleMath;
  const storageKey = 'maple-journal-session-v1';
  const number = new Intl.NumberFormat('en-US', {maximumFractionDigits:2});
  let state = {stage:'setup'}, timerInterval;
  const startIds = ['start-exp','start-mesos','hp-potion','start-hp','hp-cost','mp-potion','start-mp','mp-cost'];
  const endIds = ['end-exp','end-mesos','end-hp','end-mp','extra-exp','hp-added','mp-added'];
  const format = n => number.format(Object.is(n,-0) || Math.abs(n)<0.005 ? 0 : n);
  function error(id, message) { $(id).textContent=message || ''; $(id).hidden=!message; }
  function fields(ids) { return Object.fromEntries(ids.map(id=>[id,$(id).value])); }
  function restoreFields(values) { for (const [id,value] of Object.entries(values || {})) if ([...startIds,...endIds].includes(id)) $(id).value=value; }
  function persist() {
    state.startFields = fields(startIds); state.endFields = fields(endIds);
    try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch { $('storage-warning').hidden=false; }
  }
  function elapsed() { return state.startedAt ? Math.max(0,(state.stoppedAt ?? Date.now())-state.startedAt) : 0; }
  function tick() {
    const seconds = Math.floor(elapsed()/1000), hours=Math.floor(seconds/3600);
    const parts = [hours,Math.floor(seconds/60)%60,seconds%60].map(x=>String(x).padStart(2,'0'));
    $('timer').innerHTML=parts.join('<span>:</span>');
  }
  function paintNumber(id,value) { $(id).textContent=format(value); $(id).classList.toggle('negative',value<0); }
  function clearResults() {
    for(const id of ['total-exp','total-net','gross','hp-spend','mp-spend','net-breakdown',...['hour','ten','minute'].flatMap(p=>['exp-'+p,'mesos-'+p])]) { $(id).textContent='—'; $(id).classList.remove('negative'); }
    $('hp-used').textContent=''; $('mp-used').textContent='';
    $('results-description').textContent=state.stage==='running' ? 'Finish your session to reveal your pace and profit.' : 'Your results will be waiting at the finish line.';
  }
  function showResults() {
    const r=calculate(state.start,state.end,elapsed());
    paintNumber('total-exp',r.exp); paintNumber('total-net',r.net); paintNumber('gross',r.gross); paintNumber('net-breakdown',r.net);
    $('hp-used').textContent='· '+format(r.hpUsed)+' × '+format(state.start.hpCost);
    $('mp-used').textContent='· '+format(r.mpUsed)+' × '+format(state.start.mpCost);
    $('hp-spend').textContent='−'+format(r.hpCost); $('mp-spend').textContent='−'+format(r.mpCost);
    for(const period of ['hour','ten','minute']) {paintNumber('exp-'+period,r.rates[period].exp);paintNumber('mesos-'+period,r.rates[period].mesos);}
    $('results-description').textContent='Your training, with every potion accounted for.';
  }
  function render() {
    const setup=state.stage==='setup', running=state.stage==='running', ending=state.stage==='ending', complete=state.stage==='complete';
    $('start-form').hidden=!setup&&!running;
    $('start-fields').disabled=!setup;
    $('start-button').hidden=!setup; $('start-note').hidden=!setup;
    $('running-actions').hidden=!running; $('end-form').hidden=!ending; $('completed-actions').hidden=!complete;
    $('discard-button').hidden=setup||complete; $('discard-confirm').hidden=true;
    $('stage-label').textContent=setup?'01 / PREPARE':running?'02 / TRAIN':'03 / REVIEW';
    $('session-title').textContent=setup?'Before the adventure':running?'Enjoy the adventure':ending?'Back from the adventure':'A session well spent';
    $('status').textContent=setup?'Ready when you are':running?'Session in progress':ending?'Timer stopped':'Session complete';
    for (let i=1;i<=3;i++) $('step-'+i).classList.toggle('active', i===(setup?1:running?2:3));
    $('timer-state').textContent=setup?'NOT STARTED':running?'RECORDING':complete?'COMPLETE':'STOPPED';
    $('timer-note').textContent=setup?'Your next adventure starts here.':running?'Every little bit of progress adds up.':'Training time saved. Take your time with the numbers.';
    clearInterval(timerInterval); tick(); if(running) timerInterval=setInterval(tick,250);
    if(complete) showResults(); else clearResults();
  }
  for(const type of ['hp','mp']) {
    $(type+'-potion').replaceChildren(...catalog[type].map(p=>new Option(p.name+(p.id==='custom'?'':' · '+format(p.cost)+' mesos'),p.id)));
    $(type+'-potion').value=type==='hp'?'white':'blue';
    const updatePrice=()=> {const p=catalog[type].find(p=>p.id===$(type+'-potion').value);$(type+'-cost').value=p.cost;};
    updatePrice(); $(type+'-potion').addEventListener('change',()=>{updatePrice();persist();});
  }
  $('start-form').addEventListener('submit',event=>{
    event.preventDefault(); if(state.stage!=='setup')return;
    try {
      const start={};for(const key of ['exp','mesos','hp','mp'])start[key]=integer($('start-'+key).value,'Starting '+key);
      start.hpCost=integer($('hp-cost').value,'HP cost'); start.mpCost=integer($('mp-cost').value,'MP cost');
      start.hpPotion=$('hp-potion').value;start.mpPotion=$('mp-potion').value;
      state={stage:'running',start,startedAt:Date.now()};error('start-error','');persist();render();$('done-button').focus();
    } catch(e){error('start-error',e.message);}
  });
  $('done-button').addEventListener('click',()=>{
    if(state.stage!=='running')return;
    state.stoppedAt=Math.max(Date.now(),state.startedAt+1); state.stage='ending';persist();render();$('end-exp').focus();
  });
  $('end-form').addEventListener('submit',event=>{
    event.preventDefault(); if(state.stage!=='ending')return;
    try {
      const end={};for(const key of ['exp','mesos','hp','mp'])end[key]=$('end-'+key).value;
      end.extraExp=$('extra-exp').value;end.hpAdded=$('hp-added').value;end.mpAdded=$('mp-added').value;
      calculate(state.start,end,elapsed());state.end=end;state.stage='complete';error('end-error','');persist();render();$('results-heading').setAttribute('tabindex','-1');$('results-heading').focus({preventScroll:true});
    } catch(e){error('end-error',e.message);}
  });
  $('edit-button').addEventListener('click',()=>{state.stage='ending';persist();render();$('end-exp').focus();});
  function reset() {
    state={stage:'setup'}; $('start-form').reset();$('end-form').reset();
    $('hp-potion').value='white';$('mp-potion').value='blue';$('hp-cost').value=350;$('mp-cost').value=220;
    $('adjustments').open=false;error('end-error','');error('start-error','');persist();render();$('start-exp').focus();
  }
  $('new-button').addEventListener('click',reset);
  $('discard-button').addEventListener('click',()=>{$('discard-confirm').hidden=false;$('keep-button').focus();});
  $('keep-button').addEventListener('click',()=>{$('discard-confirm').hidden=true;$('discard-button').focus();});
  $('confirm-discard').addEventListener('click',reset);
  for(const id of [...startIds,...endIds]) $(id).addEventListener('input',persist);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick();});
  try {
    const saved=JSON.parse(localStorage.getItem(storageKey));
    if(saved && ['setup','running','ending','complete'].includes(saved.stage)) {
      if(saved.stage!=='setup') {
        for(const key of ['exp','mesos','hp','mp','hpCost','mpCost'])integer(saved.start[key],key);
        if(!Number.isSafeInteger(saved.startedAt)||saved.startedAt<=0)throw new Error('Invalid start time');
        if(saved.stage!=='running'&&(!Number.isSafeInteger(saved.stoppedAt)||saved.stoppedAt<=saved.startedAt))throw new Error('Invalid stop time');
        if(saved.stage==='complete')calculate(saved.start,saved.end,saved.stoppedAt-saved.startedAt);
      }
      state=saved; restoreFields(saved.startFields);restoreFields(saved.endFields);
    }
  } catch { /* An invalid or missing saved session starts cleanly. */ }
  render();
})();
