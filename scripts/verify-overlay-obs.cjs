'use strict';
// Optional real-OBS acceptance check. Uses a disposable portable copy of the
// installed OBS; never modifies the user's profiles/scenes or starts a stream.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),net=require('node:net'),{spawn}=require('node:child_process');
const {createHelper}=require('../local-overlay/server.cjs'),P=require('../dist/overlay-protocol.js'),{decode}=require('../lib/png-rgba.cjs');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),sha=value=>crypto.createHash('sha256').update(value).digest('base64');
async function connect(port,password){
  let last;for(let attempt=0;attempt<60;attempt++){
    try{return await new Promise((resolve,reject)=>{const ws=new WebSocket('ws://127.0.0.1:'+port);const timer=setTimeout(()=>{ws.close();reject(new Error('OBS connection timeout.'));},1500),pending=new Map();let requestId=0;
      ws.addEventListener('error',()=>{clearTimeout(timer);reject(new Error('OBS WebSocket not ready.'));});
      ws.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.op===0){const a=m.d.authentication,authentication=a?sha(sha(password+a.salt)+a.challenge):undefined;ws.send(JSON.stringify({op:1,d:{rpcVersion:1,eventSubscriptions:0,...(authentication?{authentication}:{})}}));}
        if(m.op===2){clearTimeout(timer);resolve({ws,call:(requestType,requestData={})=>new Promise((yes,no)=>{const id=String(++requestId),timeout=setTimeout(()=>{pending.delete(id);no(new Error('OBS request timed out: '+requestType));},12000);pending.set(id,{yes,no,timeout});ws.send(JSON.stringify({op:6,d:{requestType,requestId:id,requestData}}));})});}
        if(m.op===7){const p=pending.get(m.d.requestId);if(!p)return;pending.delete(m.d.requestId);clearTimeout(p.timeout);m.d.requestStatus.result?p.yes(m.d.responseData||{}):p.no(new Error('OBS '+m.d.requestType+': '+m.d.requestStatus.comment));}
      });
    });}catch(e){last=e;await sleep(500);}
  }throw last;
}
(async()=>{
  if(typeof WebSocket!=='function')throw new Error('Run this optional check with Node.js 24.');
  const installed=process.env.OBS_INSTALL_DIR||'C:/Program Files/obs-studio',output=path.resolve(process.argv[2]||path.join(__dirname,'../../overlay-obs-proof'));if(!fs.existsSync(path.join(installed,'bin/64bit/obs64.exe')))throw new Error('OBS installation not found.');
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'grind-obs-qa-')),runtime=path.join(temp,'obs'),dataDir=path.join(temp,'relay');let child,helper,connection,completed=false;
  try{
    console.log('Preparing an isolated portable OBS copy.');for(const folder of ['bin','data','obs-plugins'])await fs.promises.cp(path.join(installed,folder),path.join(runtime,folder),{recursive:true});
    const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});}),password=crypto.randomBytes(32).toString('base64url'),config=path.join(runtime,'config/obs-studio');
    fs.mkdirSync(path.join(config,'plugin_config/obs-websocket'),{recursive:true});fs.writeFileSync(path.join(config,'plugin_config/obs-websocket/config.json'),JSON.stringify({first_load:false,server_enabled:true,server_port:port,auth_required:true,server_password:password,alerts_enabled:false}));
    fs.mkdirSync(path.join(config,'basic/profiles/OverlayQA'),{recursive:true});fs.writeFileSync(path.join(config,'global.ini'),'[General]\nFirstRun=true\nLastVersion=536870912\n[Basic]\nProfile=OverlayQA\nProfileDir=OverlayQA\nSceneCollection=OverlayQA\nSceneCollectionFile=OverlayQA\n');fs.copyFileSync(path.join(config,'global.ini'),path.join(config,'user.ini'));fs.writeFileSync(path.join(config,'basic/profiles/OverlayQA/basic.ini'),'[General]\nName=OverlayQA\n[Video]\nBaseCX=640\nBaseCY=400\nOutputCX=640\nOutputCY=400\nFPSType=0\nFPSCommon=30\n');
    helper=createHelper({dataDir});const base=await helper.listen(0),created=await(await fetch(base+'/v1/overlays',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).json();
    const owner={Authorization:'Bearer '+created.publishToken,'Content-Type':'application/json'},claimed=await(await fetch(base+'/v1/overlays/'+created.id+'/lease',{method:'POST',headers:owner,body:JSON.stringify({clientId:'obs-acceptance-test'})})).json();owner['X-Maple-Lease']=claimed.leaseToken;let revision=0;
    const n=Date.now(),snapshot={version:1,session:'obs-acceptance',phase:'complete',activeMs:1800000,sampleAt:n,captureAt:n,rateReady:true,expHour:126500,netHour:38400,expTotal:63250,netTotal:19200,series:[{ms:0,exp:0,mesos:0},{ms:600000,exp:108000,mesos:31000},{ms:1200000,exp:118000,mesos:35000},{ms:1800000,exp:126500,mesos:38400}]};
    const publish=async s=>{const r=await fetch(base+'/v1/overlays/'+created.id+'/state',{method:'PUT',headers:owner,body:JSON.stringify({revision:++revision,snapshot:s})});if(!r.ok)throw new Error('Fixture publish failed: '+r.status);};
    await publish(P.select(snapshot,{...P.defaults,layout:'combined',showTime:true}));
    child=spawn(path.join(runtime,'bin/64bit/obs64.exe'),['--portable','--multi','--profile','OverlayQA','--collection','OverlayQA','--minimize-to-tray','--disable-updater','--disable-shutdown-check','--websocket_ipv4_only'],{cwd:path.join(runtime,'bin/64bit'),windowsHide:true,stdio:'ignore'});child.on('error',()=>{});
    console.log('Launching isolated OBS and connecting to its authenticated test API.');connection=await connect(port,password);let version;for(let attempt=0;attempt<30;attempt++){try{version=await connection.call('GetVersion');break;}catch(e){if(!e.message.includes('not ready'))throw e;await sleep(700);}}if(!version)throw new Error('OBS stayed in its startup phase.');console.log('OBS '+version.obsVersion+' connected.');
    await connection.call('CreateScene',{sceneName:'Overlay acceptance'});const url=base+'/overlay.html#'+new URLSearchParams({id:created.id,key:created.readToken});await connection.call('CreateInput',{sceneName:'Overlay acceptance',inputName:'Grind Journal test widget',inputKind:'browser_source',inputSettings:{url,width:640,height:400,fps:30,shutdown:false},sceneItemEnabled:true});await connection.call('SetCurrentProgramScene',{sceneName:'Overlay acceptance'});
    fs.mkdirSync(output,{recursive:true});
    async function screenshot(name,expectVisible=true){let pixels,bytes;for(let attempt=0;attempt<16;attempt++){await sleep(700);const r=await connection.call('GetSourceScreenshot',{sourceName:'Grind Journal test widget',imageFormat:'png'});bytes=Buffer.from(r.imageData.split(',')[1],'base64');pixels=decode(bytes);let visible=0,transparent=0;for(let i=3;i<pixels.data.length;i+=4){if(pixels.data[i]>100)visible++;if(pixels.data[i]===0)transparent++;}if(expectVisible?visible>1000&&transparent>0:visible===0){fs.writeFileSync(path.join(output,name+'.png'),bytes);return {width:pixels.width,height:pixels.height,visible,transparent};}}throw new Error('OBS did not render expected '+(expectVisible?'transparent widget':'hidden state')+'.');}
    const results={};results.combined=await screenshot('combined');
    for(const layout of ['stats','graphs']){await publish(P.select(snapshot,{...P.defaults,layout,showTime:true,textSize:layout==='stats'?32:24}));const [width,height]=P.dimensions[layout];await connection.call('SetInputSettings',{inputName:'Grind Journal test widget',inputSettings:{width,height},overlay:true});await sleep(5500);results[layout]=await screenshot(layout);if(results[layout].width!==width||results[layout].height!==height)throw new Error('Wrong OBS widget dimensions.');}
    await publish(P.hidden());await sleep(5500);results.hidden=await screenshot('hidden',false);
    const result={obsVersion:version.obsVersion,passed:true,checks:results};fs.writeFileSync(path.join(output,'verification.json'),JSON.stringify(result,null,2)+'\n');completed=true;console.log(JSON.stringify(result));
  }finally{
    if(!completed){const folder=path.join(runtime,'config/obs-studio/logs');if(fs.existsSync(folder)){const logs=fs.readdirSync(folder).sort(),last=logs.at(-1);if(last)console.log(fs.readFileSync(path.join(folder,last),'utf8').split('\n').slice(-28).filter(line=>!line.includes('/overlay.html')).join('\n'));}else console.log('No portable OBS log directory was created.');}
    connection?.ws.close();if(child&&child.exitCode===null){child.kill();await Promise.race([new Promise(resolve=>child.once('exit',resolve)),sleep(5000)]);}if(helper)await helper.close();
    const resolved=path.resolve(temp);if(!resolved.startsWith(path.resolve(os.tmpdir())+path.sep)||!path.basename(resolved).startsWith('grind-obs-qa-'))throw new Error('Unsafe test cleanup target.');await fs.promises.rm(resolved,{recursive:true,force:true,maxRetries:5,retryDelay:1000});
  }
})().catch(e=>{console.error(e.message);process.exitCode=1;});
