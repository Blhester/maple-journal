(() => {
  'use strict';
  const $=id=>document.getElementById(id),P=MapleOverlayProtocol,section=$('stream-overlay');let client=null;
  const controls=['overlay-layout','overlay-exp','overlay-mesos','overlay-time','overlay-opacity','overlay-size'];
  function paint(view){
    const c=view.credentials,d=view.settings;$('overlay-create').disabled=!!c;$('overlay-copy').disabled=!c;$('overlay-hide').disabled=!c;$('overlay-reset').disabled=!c;$('overlay-reset-stats').disabled=!view.canResetStats;
    $('overlay-share').disabled=!c||!MapleOverlayFeed.session().id;$('overlay-share').checked=view.sharing;$('overlay-status').textContent=view.message;
    const url=c?new URL('overlay.html',location.href):null;if(url)url.hash=new URLSearchParams({id:c.id,key:c.readToken}).toString();$('overlay-url').value=url?.href||'';
    $('overlay-layout').value=d.layout;$('overlay-exp').checked=d.exp;$('overlay-mesos').checked=d.mesos;$('overlay-time').checked=d.showTime;$('overlay-opacity').value=String(d.opacity);$('overlay-size').value=String(d.textSize);
    const [w,h]=P.dimensions[d.layout];$('overlay-dimensions').textContent='OBS Browser Source: '+w+' × '+h+' · 30 FPS · leave custom CSS at its default.';
    $('overlay-preview').href=url?.href||'overlay.html#demo';
  }
  let acting=false;
  async function action(fn){if(acting)return;acting=true;$('overlay-error').hidden=true;try{await fn();}catch(e){if(client)paint(client.view());$('overlay-error').textContent=e.message;$('overlay-error').hidden=false;}finally{acting=false;}}
  for(const id of controls)$(id).addEventListener('change',()=>void action(()=>client.configure({layout:$('overlay-layout').value,exp:$('overlay-exp').checked,mesos:$('overlay-mesos').checked,showTime:$('overlay-time').checked,opacity:Number($('overlay-opacity').value),textSize:Number($('overlay-size').value)})));
  $('overlay-create').addEventListener('click',()=>void action(()=>client.createOverlay()));$('overlay-share').addEventListener('change',()=>void action(()=>$('overlay-share').checked?client.share():client.hide()));$('overlay-hide').addEventListener('click',()=>void action(()=>client.hide()));
  $('overlay-reset-stats').addEventListener('click',()=>void action(()=>client.resetStats()));
  $('overlay-reset').addEventListener('click',()=>{$('overlay-reset-confirm').hidden=false;});$('overlay-reset-cancel').addEventListener('click',()=>{$('overlay-reset-confirm').hidden=true;});$('overlay-reset-confirm-button').addEventListener('click',()=>void action(async()=>{await client.reset();$('overlay-reset-confirm').hidden=true;}));
  $('overlay-copy').addEventListener('click',()=>void action(async()=>{const value=$('overlay-url').value;try{await navigator.clipboard.writeText(value);$('overlay-status').textContent='OBS link copied. Paste it into a Browser Source on this computer.';}catch{$('overlay-url').focus();$('overlay-url').select();$('overlay-status').textContent='Select and copy the OBS link above.';}}));
  async function init(){
    if(location.protocol!=='http:'||location.hostname!=='127.0.0.1')return;
    try{const res=await fetch('/local-info',{cache:'no-store',signal:AbortSignal.timeout(3000)});if(!res.ok||(await res.json()).localHelper!==true)return;}catch{return;}
    $('overlay-hosted-help').hidden=true;$('overlay-local-controls').hidden=false;
    client=MapleOverlayClient.create({getSession:()=>MapleOverlayFeed.session(),getSnapshot:options=>MapleOverlayFeed.snapshot(options),getBaseline:()=>MapleOverlayFeed.baseline(),onChange:paint});window.MapleOverlay=client;paint(client.view());window.addEventListener('pagehide',()=>client.dispose());
  }
  void init();
})();
