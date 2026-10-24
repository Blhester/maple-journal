(() => {
  'use strict';
  const $=id=>document.getElementById(id),P=MapleOverlayProtocol;let client=null,browserMode=false,acting=false,popup=null;
  const controls=['overlay-layout','overlay-exp','overlay-mesos','overlay-time','overlay-opacity','overlay-size'];
  function overlayUrl(c){if(!c)return null;const url=new URL('overlay.html',location.href);url.hash=new URLSearchParams(browserMode?{browser:c.id}:{id:c.id,key:c.readToken}).toString();return url;}
  function paint(view){
    const c=view.credentials,d=view.settings;$('overlay-create').disabled=!!c;$('overlay-copy').disabled=!c;$('overlay-hide').disabled=!c;$('overlay-reset').disabled=!c;$('overlay-reset-stats').disabled=!view.canResetStats;
    $('overlay-share').disabled=!c||!MapleOverlayFeed.session().id;$('overlay-share').checked=view.sharing;$('overlay-status').textContent=view.message;
    const url=overlayUrl(c);$('overlay-url').value=url?.href||'';
    $('overlay-layout').value=d.layout;$('overlay-exp').checked=d.exp;$('overlay-mesos').checked=d.mesos;$('overlay-time').checked=d.showTime;$('overlay-opacity').value=String(d.opacity);$('overlay-size').value=String(d.textSize);
    const [w,h]=P.dimensions[d.layout];$('overlay-dimensions').textContent=browserMode?'Overlay content: '+w+' × '+h+' · resize the pop-out to fit. OBS: Window Capture + Magenta Chroma Key.':'OBS Browser Source: '+w+' × '+h+' · 30 FPS · leave custom CSS at its default.';
    $('overlay-preview').href=url?.href||'overlay.html#demo';
  }
  async function action(fn){if(acting||!client)return;acting=true;$('overlay-error').hidden=true;try{await fn();}catch(e){paint(client.view());$('overlay-error').textContent=e.message;$('overlay-error').hidden=false;}finally{acting=false;}}
  for(const id of controls)$(id).addEventListener('change',()=>void action(()=>client.configure({layout:$('overlay-layout').value,exp:$('overlay-exp').checked,mesos:$('overlay-mesos').checked,showTime:$('overlay-time').checked,opacity:Number($('overlay-opacity').value),textSize:Number($('overlay-size').value)})));
  $('overlay-create').addEventListener('click',()=>void action(()=>client.createOverlay()));$('overlay-share').addEventListener('change',()=>void action(()=>$('overlay-share').checked?client.share():client.hide()));$('overlay-hide').addEventListener('click',()=>void action(()=>client.hide()));
  $('overlay-reset-stats').addEventListener('click',()=>void action(()=>client.resetStats()));
  $('overlay-reset').addEventListener('click',()=>{$('overlay-reset-confirm').hidden=false;});$('overlay-reset-cancel').addEventListener('click',()=>{$('overlay-reset-confirm').hidden=true;});$('overlay-reset-confirm-button').addEventListener('click',()=>void action(async()=>{await client.reset();$('overlay-reset-confirm').hidden=true;}));
  $('overlay-open').addEventListener('click',()=>{
    if(!client)return;$('overlay-error').hidden=true;
    if(popup&&!popup.closed){popup.focus();return;}
    const v=client.view(),[width,height]=P.dimensions[v.settings.layout];popup=window.open(overlayUrl(v.credentials).href,'grind-journal-overlay-'+v.credentials.id,'popup=yes,width='+width+',height='+height+',resizable=yes,scrollbars=no');
    if(popup){popup.opener=null;$('overlay-status').textContent='Overlay window opened. Enable Share this run, then select this window in OBS Window Capture.';}
    else{$('overlay-error').textContent='Pop-up blocked. Allow pop-ups for this site, click again, or copy the window link into a new window in this browser.';$('overlay-error').hidden=false;}
  });
  $('overlay-copy').addEventListener('click',()=>void action(async()=>{const value=$('overlay-url').value;try{await navigator.clipboard.writeText(value);$('overlay-status').textContent=browserMode?'Window link copied. Open it in this browser profile; use OBS Window Capture.':'OBS link copied. Paste it into a Browser Source on this computer.';}catch{$('overlay-url').focus();$('overlay-url').select();$('overlay-status').textContent='Select and copy the overlay link above.';}}));
  async function init(){
    if(!['http:','https:'].includes(location.protocol)){$('overlay-file-note').hidden=false;return;}
    let helper=false;if(location.protocol==='http:'&&location.hostname==='127.0.0.1')try{const res=await fetch('/local-info',{cache:'no-store',signal:AbortSignal.timeout(3000)});helper=res.ok&&(await res.json()).localHelper===true;}catch{}
    browserMode=!helper;
    const options={getSession:()=>MapleOverlayFeed.session(),getSnapshot:options=>MapleOverlayFeed.snapshot(options),getBaseline:()=>MapleOverlayFeed.baseline(),onChange:paint};
    try{client=browserMode?MapleBrowserOverlay.create(options):MapleOverlayClient.create(options);}catch{$('overlay-file-note').hidden=false;$('overlay-file-note').textContent='Browser storage is unavailable. Enable storage for this site to share a local overlay. Ordinary tracking still works.';return;}
    $('overlay-local-controls').hidden=false;$('overlay-open').hidden=!browserMode;$('overlay-create').hidden=browserMode;$('overlay-reset').hidden=browserMode;$('overlay-preview').hidden=browserMode;$('overlay-opacity-wrap').hidden=browserMode;
    $('overlay-browser-instructions').hidden=!browserMode;$('overlay-helper-instructions').hidden=browserMode;$('overlay-helper-download').hidden=!browserMode;$('overlay-hosted-help').hidden=!browserMode;
    $('overlay-copy').textContent=browserMode?'Copy window link':'Copy OBS link';
    if(!browserMode){$('overlay-mode-note').textContent='Only validated captures appear; meso averages can include estimates on stream. Share each run separately; completed results remain visible. Keep the helper and this browser tab open.';$('overlay-url-label').textContent='OBS Browser Source URL';$('overlay-link-note').textContent='This link is read-only and works on this computer. Keep it private. Reset link invalidates the old URL.';}
    window.MapleOverlay=client;paint(client.view());window.addEventListener('pagehide',()=>client.dispose());
  }
  void init();
})();
