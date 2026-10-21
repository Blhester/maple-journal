'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),P=require('../dist/overlay-protocol.js');
const DAY=86400000,hash=token=>crypto.createHash('sha256').update(token).digest('hex'),token=()=>crypto.randomBytes(32).toString('base64url');
function createHelper({root=path.resolve(__dirname,'../dist'),dataDir=path.join(os.homedir(),'.grindjournal-overlay'),now=Date.now}={}){
  const file=path.join(dataDir,'state.json');let records={},origin,saveQueue=Promise.resolve(),budget={at:0,count:0,creates:0};
  try{const value=JSON.parse(fs.readFileSync(file,'utf8'));if(value.version!==1||!value.records||typeof value.records!=='object')throw new Error();records=value.records;for(const r of Object.values(records)){if(!Number.isFinite(r.expiresAt)||!Number.isSafeInteger(r.revision)||!/^[-\w]{43}$/.test(r.id)||!/[a-f0-9]{64}/.test(r.readHash)||!/[a-f0-9]{64}/.test(r.publishHash))throw new Error();if(r.snapshot)P.validate(r.snapshot);r.lease=null;}}catch(error){if(error.code!=='ENOENT')throw new Error('Local overlay state could not be read. Back up state.json before resetting it.');}
  function save(){const bytes=JSON.stringify({version:1,records});saveQueue=saveQueue.catch(()=>{}).then(async()=>{await fs.promises.mkdir(dataDir,{recursive:true});await fs.promises.writeFile(file+'.tmp',bytes,{mode:0o600});await fs.promises.rename(file+'.tmp',file);});return saveQueue;}
  const fail=(code,message)=>{const e=new Error(message);e.status=code;throw e;};
  const same=(a,b)=>{if(typeof a!=='string'||typeof b!=='string')return false;const x=Buffer.from(hash(a)),y=Buffer.from(b);return x.length===y.length&&crypto.timingSafeEqual(x,y);};
  function auth(req,r,kind){const supplied=req.headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];if(!supplied||!same(supplied,r[kind+'Hash']))fail(401,'Overlay link is invalid or was reset.');}
  async function body(req){if(req.headers['content-type']?.split(';')[0]!=='application/json')fail(415,'JSON is required.');if(Number(req.headers['content-length'])>65536){req.resume();fail(413,'Overlay snapshot exceeds 64 KB.');}let size=0,parts=[];for await(const part of req){size+=part.length;if(size<=65536)parts.push(part);}if(size>65536)fail(413,'Overlay snapshot exceeds 64 KB.');try{return JSON.parse(Buffer.concat(parts).toString());}catch{fail(400,'Invalid JSON.');}}
  function lease(req,r){if(!r.lease||r.lease.until<=now()||!same(req.headers['x-maple-lease'],r.lease.hash))fail(409,'Another tab controls this overlay, or its lease expired. Enable sharing in one tab.');}
  function json(res,status,value){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Pragma':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(JSON.stringify(value));}
  const server=http.createServer(async(req,res)=>{
    try{
      if(req.headers.host!==new URL(origin).host)fail(403,'Use the helper URL printed in its window.');
      if(req.headers.origin&&req.headers.origin!==origin)fail(403,'Cross-origin requests are not allowed.');
      const url=new URL(req.url,origin),route=url.pathname;
      if(route==='/local-info'){if(req.method!=='GET')fail(405,'Method not allowed.');return json(res,200,{localHelper:true,version:1});}
      if(route.startsWith('/v1/')){
        if(now()-budget.at>=60000)budget={at:now(),count:0,creates:0};if(++budget.count>600)fail(429,'Too many requests. Retry shortly.');
        let expired=false;for(const [id,r]of Object.entries(records)){if(r.expiresAt<=now()){delete records[id];expired=true;}else if(r.snapshot&&r.snapshotExpiresAt<=now()){r.snapshot=null;expired=true;}}if(expired)await save();
        if(route==='/v1/overlays'&&req.method==='POST'){
          await body(req);if(++budget.creates>5||Object.keys(records).length>=32)fail(429,'Overlay creation limit reached. Reuse an existing link.');
          const id=token(),readToken=token(),publishToken=token();records[id]={id,readHash:hash(readToken),publishHash:hash(publishToken),expiresAt:now()+30*DAY,revision:0,publishedAt:now(),snapshotExpiresAt:0,snapshot:null,lease:null};await save();return json(res,201,{id,readToken,publishToken,revision:0});
        }
        const match=route.match(/^\/v1\/overlays\/([A-Za-z0-9_-]{43})\/(state|lease|rotate)$/);if(!match)fail(404,'Not found.');const r=records[match[1]];if(!r)fail(404,'Overlay expired or does not exist.');
        if(match[2]==='state'&&req.method==='GET'){
          auth(req,r,'read');return json(res,200,{revision:r.revision,publishedAt:r.publishedAt,serverNow:now(),snapshot:r.snapshotExpiresAt>now()?r.snapshot:null});
        }
        auth(req,r,'publish');
        if(match[2]==='lease'&&req.method==='POST'){
          const b=await body(req);auth(req,r,'publish');if(!/^[A-Za-z0-9_-]{16,80}$/.test(b.clientId||''))fail(400,'Invalid client identity.');if(b.release===true){lease(req,r);if(r.lease.client!==b.clientId)fail(409,'Lease belongs to another tab.');r.lease=null;return json(res,200,{released:true});}if(r.lease&&r.lease.until>now()&&r.lease.client!==b.clientId)fail(409,'Another browser tab is publishing this overlay.');
          const leaseToken=token();r.lease={client:b.clientId,hash:hash(leaseToken),until:now()+75000};return json(res,200,{leaseToken,revision:r.revision});
        }
        if(match[2]==='rotate'&&req.method==='POST'){
          await body(req);auth(req,r,'publish');lease(req,r);const readToken=token(),publishToken=token();r.readHash=hash(readToken);r.publishHash=hash(publishToken);r.snapshot=null;r.snapshotExpiresAt=0;r.revision++;r.lease=null;r.expiresAt=now()+30*DAY;await save();return json(res,200,{id:r.id,readToken,publishToken,revision:r.revision});
        }
        if(match[2]==='state'&&req.method==='PUT'){
          const b=await body(req);auth(req,r,'publish');lease(req,r);if(!Number.isSafeInteger(b.revision)||b.revision<=r.revision)fail(409,'A newer overlay update already exists.');let snapshot;try{snapshot=P.validate(b.snapshot);}catch(e){fail(400,e.message);}
          r.revision=b.revision;r.snapshot=snapshot;r.publishedAt=now();r.snapshotExpiresAt=now()+DAY;r.expiresAt=now()+30*DAY;r.lease.until=now()+75000;await save();return json(res,200,{revision:r.revision});
        }
        fail(405,'Method not allowed.');
      }
      if(req.method!=='GET'&&req.method!=='HEAD')fail(405,'Method not allowed.');
      let name;try{name=decodeURIComponent(route);}catch{fail(400,'Invalid path.');}const target=path.resolve(root,'.'+(name==='/'?'/index.html':name));if(!target.startsWith(path.resolve(root)+path.sep)||name.includes('\\'))fail(403,'Invalid path.');
      let bytes;try{bytes=await fs.promises.readFile(target);}catch{fail(404,'Not found.');}
      const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.wasm':'application/wasm','.gz':'application/gzip'}[path.extname(target)]||'application/octet-stream';
      res.writeHead(200,{'Content-Type':mime,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(req.method==='HEAD'?undefined:bytes);
    }catch(error){if(!res.headersSent)json(res,error.status||500,{error:error.status?error.message:'Local helper could not save the update. Check disk space and retry.'});else res.end();}
  });
  server.requestTimeout=10000;server.headersTimeout=10000;
  return {server,async listen(port=4317){await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});origin='http://127.0.0.1:'+server.address().port;return origin;},async close(){await new Promise(resolve=>server.close(resolve));await saveQueue;}};
}
module.exports={createHelper};
if(require.main===module){const port=Number(process.env.GRIND_OVERLAY_PORT||4317);if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Choose a port from 1024 to 65535.');const app=createHelper();app.listen(port).then(url=>{console.log('Grind Journal local streaming helper\nOpen '+url+' in your browser.\nKeep this window open while streaming. Ctrl+C stops the helper.\nOnly this computer can connect. Screenshots and session history stay in your browser.');}).catch(error=>{console.error(error.code==='EADDRINUSE'?'Port is already in use. Reuse the running helper or set GRIND_OVERLAY_PORT.':error.message);process.exitCode=1;});}
