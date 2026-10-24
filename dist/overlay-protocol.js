(function(root,factory){const api=factory();root.MapleOverlayProtocol=api;if(typeof module==='object')module.exports=api;})(typeof window==='object'?window:globalThis,function(){
  'use strict';
  const defaults={layout:'stats',exp:true,mesos:true,showTime:false,opacity:.88,textSize:24};
  const dimensions={stats:[480,180],graphs:[640,280],combined:[640,400]};
  const exact=(obj,keys)=>{if(!obj||typeof obj!=='object'||Array.isArray(obj)||Object.keys(obj).some(k=>!keys.includes(k))||keys.some(k=>!Object.hasOwn(obj,k)))throw new Error('Invalid overlay fields.');};
  function display(value={}){const v={...defaults,...value};exact(v,Object.keys(defaults));if(!Object.hasOwn(dimensions,v.layout)||!['exp','mesos','showTime'].every(k=>typeof v[k]==='boolean')||(!v.exp&&!v.mesos)||!Number.isFinite(v.opacity)||v.opacity<0||v.opacity>1||![20,24,32].includes(v.textSize))throw new Error('Invalid overlay display settings.');return v;}
  function select(snapshot,settings){
    const d=display(settings);if(!snapshot)return hidden(d);
    return {...snapshot,activeMs:d.showTime?snapshot.activeMs:null,expHour:d.exp?snapshot.expHour:null,expTotal:d.exp?snapshot.expTotal:null,netHour:d.mesos?snapshot.netHour:null,netTotal:d.mesos?snapshot.netTotal:null,series:snapshot.series.map(p=>({ms:p.ms,exp:d.exp?p.exp:null,mesos:d.mesos?p.mesos:null})),display:d};
  }
  function hidden(settings=defaults){return {version:1,session:'',phase:'hidden',activeMs:null,sampleAt:0,captureAt:0,rateReady:false,expHour:null,netHour:null,expTotal:null,netTotal:null,series:[],display:display(settings)};}
  function validate(s){
    exact(s,['version','session','phase','activeMs','sampleAt','captureAt','rateReady','expHour','netHour','expTotal','netTotal','series','display']);
    const numeric=(v,positive=false)=>v===null||Number.isFinite(v)&&Math.abs(v)<=Number.MAX_SAFE_INTEGER&&(!positive||v>=0);
    if(s.version!==1||typeof s.session!=='string'||s.session.length>100||!['starting','running','paused','ending','complete','hidden'].includes(s.phase)||typeof s.rateReady!=='boolean'||!numeric(s.activeMs,true)||!Number.isSafeInteger(s.sampleAt)||s.sampleAt<0||!Number.isSafeInteger(s.captureAt)||s.captureAt<0||!['expHour','netHour','expTotal','netTotal'].every(k=>numeric(s[k]))||!Array.isArray(s.series)||s.series.length>241)throw new Error('Invalid overlay snapshot.');
    const d=display(s.display);let previous=-1;for(const p of s.series){exact(p,['ms','exp','mesos']);if(!Number.isFinite(p.ms)||p.ms<=previous||p.ms<0||!numeric(p.exp)||!numeric(p.mesos)||(!d.exp&&p.exp!==null)||(!d.mesos&&p.mesos!==null))throw new Error('Invalid overlay graph.');previous=p.ms;}
    if((!d.showTime&&s.activeMs!==null)||(!d.exp&&(s.expHour!==null||s.expTotal!==null))||(!d.mesos&&(s.netHour!==null||s.netTotal!==null)))throw new Error('Disabled metric present.');
    if(s.phase==='hidden'&&(s.session||s.series.length||s.activeMs!==null||['expHour','netHour','expTotal','netTotal'].some(k=>s[k]!==null)))throw new Error('Hidden overlays cannot contain data.');
    return structuredClone(s);
  }
  function status(envelope,now=Date.now()){
    if(!envelope?.snapshot||envelope.snapshot.phase==='hidden')return 'Hidden';const s=envelope.snapshot;
    if(s.phase==='complete')return 'Completed';if(now-envelope.publishedAt>90000)return 'Disconnected';if(s.phase==='paused')return 'Paused';if(s.phase==='ending')return 'Awaiting final review';
    if(now-s.captureAt>180000)return 'Readings stale';return s.phase==='starting'?'Gathering first minute':'Live averages';
  }
  return {defaults,dimensions,display,select,hidden,validate,status};
});
