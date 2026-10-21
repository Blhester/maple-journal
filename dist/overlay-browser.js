(function(root,factory){const api=factory(typeof module==='object'?require('./overlay-protocol.js'):root.MapleOverlayProtocol);root.MapleBrowserOverlay=api;if(typeof module==='object')module.exports=api;})(typeof window==='object'?window:globalThis,function(P){
  'use strict';
  const metaKey='maple-journal-browser-overlay-v1',stateKey=id=>'maple-journal-browser-overlay-state:'+id,validId=id=>/^[a-f0-9]{32}$/.test(id||''),DAY=86400000;
  function read(storage,id,now=Date.now()){
    try{const e=JSON.parse(storage.getItem(stateKey(id)));if(!e||e.id!==id||!Number.isSafeInteger(e.revision)||e.revision<1||!Number.isSafeInteger(e.publishedAt)||e.publishedAt>now+60000||now-e.publishedAt>DAY)return null;return {...e,snapshot:P.validate(e.snapshot)};}catch{return null;}
  }
  function create({storage=globalThis.localStorage,locks=globalThis.navigator?.locks,channelFactory=name=>typeof BroadcastChannel==='function'?new BroadcastChannel(name):null,getSession,getSnapshot,getBaseline,onChange=()=>{},now=Date.now,newId=()=>globalThis.crypto.randomUUID().replaceAll('-',''),setEvery=setInterval,clearEvery=clearInterval}={}){
    let saved;try{saved=JSON.parse(storage.getItem(metaKey));}catch{}
    const id=validId(saved?.id)?saved.id:newId();let settings=P.display(),baseline=null,last=null,sharedId=null,release=null,claiming=null,disposed=false,message='Open the overlay window, then enable Share this run.';
    try{settings=P.display(saved?.settings);baseline=saved?.baseline||null;const previous=read(storage,id,now());if(previous?.snapshot.phase==='complete')last=previous.snapshot;}catch{}
    const channel=channelFactory('maple-journal-overlay:'+id);
    function view(){return {mode:'browser',credentials:{id},settings:{...settings},sharing:!!sharedId,canResetStats:!!sharedId&&getSession().id===sharedId&&getSession().stage==='running',message};}
    function change(text){if(text)message=text;onChange(view());}
    function persist(){storage.setItem(metaKey,JSON.stringify({id,settings,baseline}));}
    function fullSnapshot(){return getSnapshot({since:baseline});}
    function unlock(){release?.();}
    async function claim(){
      if(disposed)throw new Error('This overlay publisher is closed.');if(release)return;if(claiming)return claiming;
      if(!locks?.request)throw new Error('Local overlay sharing needs a current Firefox or Chrome browser with Web Locks support.');
      claiming=new Promise((resolve,reject)=>{
        Promise.resolve(locks.request('maple-journal-overlay:'+id,{ifAvailable:true},lock=>{
          if(!lock){reject(new Error('Another tracker tab is sharing this overlay. Hide it or close that tab first.'));return;}
          if(disposed){reject(new Error('This overlay publisher is closed.'));return;}
          return new Promise(done=>{release=()=>{release=null;done();};resolve();});
        })).catch(reject);
      }).finally(()=>{claiming=null;});return claiming;
    }
    function publish(){
      if(disposed||!release)return;
      const snapshot=P.validate(last?P.select(last,settings):P.hidden(settings)),e={id,revision:(read(storage,id,now())?.revision||0)+1,publishedAt:now(),serverNow:now(),snapshot};
      storage.setItem(stateKey(id),JSON.stringify(e));persist();channel?.postMessage({type:'updated'});change(last?'Sharing confirmed readings with your browser overlay.':'Overlay hidden. Reopen the same window for your next shared run.');
    }
    function update(){
      if(disposed)return;const session=getSession();
      if(sharedId&&session.id!==sharedId){sharedId=null;if(last?.phase!=='complete')last=null;}
      else if(sharedId)last=fullSnapshot();
      if(release)try{publish();}catch{change('Could not update browser storage. Keep this tab open and check browser storage settings.');}else change();
    }
    channel&&(channel.onmessage=e=>{if(e.data?.type==='hello'&&release)update();});
    try{persist();}catch(error){channel?.close();throw error;}
    const heartbeat=setEvery(()=>{if(release&&last)update();},30000);
    return {view,update,
      async share(){const session=getSession();if(!session.id||session.stage==='setup')throw new Error('Start a training session first.');await claim();if(baseline?.session!==session.id)baseline=null;sharedId=session.id;last=fullSnapshot();publish();},
      async hide(){await claim();sharedId=null;last=null;publish();unlock();},
      async resetStats(){const session=getSession();if(!sharedId||session.id!==sharedId||session.stage!=='running')throw new Error('Share a running session before resetting its overlay stats.');await claim();baseline=getBaseline();last=fullSnapshot();publish();},
      async configure(value){const next=P.display(value);const existing=read(storage,id,now());if(sharedId||last||(existing&&existing.snapshot.phase!=='hidden'))await claim();settings=next;persist();if(sharedId)last=fullSnapshot();if(release)publish();else change();},
      dispose(){disposed=true;clearEvery(heartbeat);channel?.close();unlock();}
    };
  }
  function subscribe({id,storage=globalThis.localStorage,channelFactory=name=>typeof BroadcastChannel==='function'?new BroadcastChannel(name):null,events=globalThis,onChange,now=Date.now,setEvery=setInterval,clearEvery=clearInterval}){
    if(!validId(id))throw new Error('Invalid browser overlay link.');
    const channel=channelFactory('maple-journal-overlay:'+id);let revision=0,publishedAt=0;
    function refresh(){const e=read(storage,id,now());if(!e){revision=0;publishedAt=0;onChange(null);return;}if(e.publishedAt<publishedAt||e.publishedAt===publishedAt&&e.revision<revision)return;revision=e.revision;publishedAt=e.publishedAt;onChange(e);}
    const listener=e=>{if(e.key===stateKey(id)||e.key===null)refresh();};events.addEventListener('storage',listener);channel&&(channel.onmessage=refresh);const timer=setEvery(refresh,5000);refresh();channel?.postMessage({type:'hello'});
    return ()=>{clearEvery(timer);events.removeEventListener('storage',listener);channel?.close();};
  }
  return {create,subscribe,read,validId};
});
