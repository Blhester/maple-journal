(function(root,factory){const api=factory(typeof module==='object'?require('./overlay-protocol.js'):root.MapleOverlayProtocol);root.MapleOverlayClient=api;if(typeof module==='object')module.exports=api;})(typeof window==='object'?window:globalThis,function(P){
  'use strict';
  function create({fetch:fetcher=globalThis.fetch,storage=globalThis.localStorage,getSession,getSnapshot,getBaseline,onChange=()=>{},clientId=globalThis.crypto.randomUUID().replaceAll('-',''),setTimer=setTimeout,clearTimer=clearTimeout,setEvery=setInterval,clearEvery=clearInterval}={}){
    const key='maple-journal-overlay-v1';let credentials=null,settings=P.display(),last=null,baseline=null,sharedId=null,leaseToken=null,revision=0,dirty=false,processing=null,retry=null,attempt=0,disposed=false,message='Create an overlay, then share a run.';
    try{const saved=JSON.parse(storage.getItem(key));if(saved){settings=P.display(saved.settings);baseline=saved.baseline||null;if(saved.credentials&&['id','readToken','publishToken'].every(k=>/^[A-Za-z0-9_-]{43}$/.test(saved.credentials[k])))credentials=saved.credentials;if(saved.last?.phase==='complete')last=P.validate(saved.last);}}catch{message='Stored overlay settings could not be restored. Create a new overlay.';}
    function view(){return {credentials:credentials?{id:credentials.id,readToken:credentials.readToken}:null,settings:{...settings},sharing:!!sharedId,canResetStats:!!sharedId&&getSession().id===sharedId&&getSession().stage==='running',message};}
    function fullSnapshot(){const snapshot=getSnapshot({since:baseline});return snapshot?P.select(snapshot,{...P.defaults,showTime:true,expPercent:true,eta:true}):null;}
    function change(text){if(text)message=text;onChange(view());}
    function persist(){try{storage.setItem(key,JSON.stringify({credentials,settings,last,baseline}));}catch{change('Browser storage is unavailable. Keep this tab open; a reload may need a new OBS link.');}}
    async function request(suffix,{method='POST',body={},read=false,keepalive=false}={}){
      const response=await fetcher('/v1/overlays'+suffix,{method,headers:{'Content-Type':'application/json',...(credentials?{Authorization:'Bearer '+(read?credentials.readToken:credentials.publishToken)}:{}),...(leaseToken?{'X-Maple-Lease':leaseToken}:{})},...(method==='GET'?{}:{body:JSON.stringify(body)}),cache:'no-store',credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(10000),keepalive});
      const value=await response.json();if(!response.ok){const e=new Error(value.error||'Local helper request failed.');e.status=response.status;throw e;}return value;
    }
    async function claim(){if(leaseToken)return;const result=await request('/'+credentials.id+'/lease',{body:{clientId}});leaseToken=result.leaseToken;revision=Math.max(revision,result.revision);}
    async function flush(){
      if(disposed||!credentials)return;dirty=true;if(processing)return processing;
      processing=(async()=>{while(dirty&&!disposed){dirty=false;try{await claim();const snapshot=last?P.select(last,settings):P.hidden(settings);await request('/'+credentials.id+'/state',{method:'PUT',body:{revision:++revision,snapshot}});attempt=0;clearTimer(retry);retry=null;persist();change(last?'Sharing confirmed readings on this computer.':'Overlay hidden. The same OBS link can be reused.');}catch(error){leaseToken=null;change(error.message);if([401,404].includes(error.status)){sharedId=null;last=null;clearTimer(retry);retry=null;persist();change('Overlay credentials expired or were reset. Use Reset link to create a replacement.');}else if(!disposed){clearTimer(retry);retry=setTimer(()=>{retry=null;void flush();},Math.min(30000,2000*2**Math.min(attempt++,4)));}break;}}})().finally(()=>{processing=null;});return processing;
    }
    function update(){
      if(disposed)return;
      const session=getSession();if(sharedId&&session.id!==sharedId){sharedId=null;if(last?.phase!=='complete')last=null;persist();void flush();change();return;}
      if(sharedId){last=fullSnapshot();persist();void flush();}
      change();
    }
    const heartbeat=setEvery(()=>{if(last){if(sharedId&&getSession().id===sharedId)last=fullSnapshot();void flush();}},30000);
    return {view,update,
      async createOverlay(){if(credentials)throw new Error('This browser already has an overlay. Copy its link or reset it.');credentials=await request('');revision=credentials.revision;persist();change('Overlay created. Enable Share this run to display it.');return view();},
      async share(){if(!credentials)throw new Error('Create an overlay first.');const session=getSession();if(!session.id||session.stage==='setup')throw new Error('Start a training session first.');await claim();if(baseline?.session!==session.id)baseline=null;sharedId=session.id;last=fullSnapshot();persist();await flush();change();},
      async resetStats(){const session=getSession();if(!sharedId||session.id!==sharedId||session.stage!=='running')throw new Error('Share a running session before resetting its overlay stats.');await claim();baseline=getBaseline();last=fullSnapshot();persist();await flush();},
      async hide(){sharedId=null;last=null;persist();await flush();change();},
      async configure(value){settings=P.display(value);persist();if(sharedId&&getSession().id===sharedId)last=fullSnapshot();if(credentials)await flush();change();},
      async reset(){if(!credentials)throw new Error('Create an overlay first.');let replaced=false;try{await claim();credentials=await request('/'+credentials.id+'/rotate');}catch(e){if(![401,404].includes(e.status))throw e;credentials=null;leaseToken=null;last=null;sharedId=null;persist();credentials=await request('');replaced=true;}revision=credentials.revision;leaseToken=null;last=null;baseline=null;sharedId=null;clearTimer(retry);retry=null;persist();change(replaced?'Expired or reset credentials replaced. Copy the new OBS link.':'Previous link invalidated. Copy the new OBS link.');},
      dispose(){disposed=true;clearEvery(heartbeat);clearTimer(retry);if(credentials&&leaseToken)void request('/'+credentials.id+'/lease',{body:{clientId,release:true},keepalive:true}).catch(()=>{});leaseToken=null;}
    };
  }
  return {create};
});
