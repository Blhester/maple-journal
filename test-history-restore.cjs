'use strict';
const assert=require('node:assert/strict'),harness=require('./test-screenshot-transfer.cjs');
const key='maple-journal-history-v1',draftKey='maple-journal-session-v1';
const record=(id,mesos=150000)=>({id,stage:'complete',startedAt:Date.parse('2026-10-21T12:00:00Z'),stoppedAt:Date.parse('2026-10-21T12:30:00Z'),pausedMs:0,
  start:{exp:10000,mesos:100000,hp:100,mp:100,hpCost:80,mpCost:150,hpPotion:'meat',mpPotion:'lemon',level:null},
  end:{exp:40000,mesos,hp:80,mp:90,hpAdded:0,mpAdded:0,extraExp:0,level:null,ledger:[]},checkpoints:[],meta:{map:'Map '+id,class:'Cleric'}});
const storage=new Map([[key,JSON.stringify([record('A'),record('B')])],[draftKey,JSON.stringify(record('A'))]]);
const h=harness(storage,{realHistory:true});
const text=node=>node.textContent+(node.children||[]).map(text).join(' ');
const ids=()=>JSON.parse(storage.get(key)).map(r=>r.id).sort();
async function upload(target,data,{raw=false,size=1000}={}){
  const input=target.node('import-json');input.value='backup.json';
  const file={size,text:async()=>raw?data:JSON.stringify(data)};
  for(const handler of input.events.get('change'))await handler({target:{files:[file],get value(){return input.value;},set value(value){input.value=value;}}});
  assert.equal(input.value,'','The same backup can be selected again');
}
const backup=sessions=>({schemaVersion:1,exportedAt:'2026-10-21T13:00:00Z',sessions});

(async()=>{
  h.node('filter-class').value='Cleric';h.node('filter-min').value='90';h.node('filter-max').value='100';
  // Review the old A first; restoring must close stale review details as well.
  h.node('history-rows').children[0].children[5].children[0].dispatchEvent(new Event('click'));
  assert.equal(h.node('history-review').hidden,false);
  await upload(h,backup([record('A',175000),record('C')]));
  assert.deepEqual(ids(),['A','C'],'Absent old B is removed; new C is included');
  assert.equal(JSON.parse(storage.get(key)).find(r=>r.id==='A').end.mesos,175000,'Matching A is overwritten');
  assert.equal(h.node('history-review').hidden,true);
  for(const id of ['filter-class','filter-min','filter-max'])assert.equal(h.node(id).value,'','Restore resets '+id);
  assert.match(text(h.node('history-status')),/replaced with 2 sessions/);
  assert.match(text(h.node('history-rows')),/Map C/);assert.doesNotMatch(text(h.node('history-rows')),/Map B/);
  const restoredText=storage.get(key);
  const fresh=harness(storage,{realHistory:true});
  assert.equal(storage.get(key),restoredText,'Reloading old completed draft A must not overwrite restored A or re-add B');
  assert.match(text(fresh.node('history-rows')),/Map C/);
  const emptyRestore=harness(storage,{realHistory:true});
  await upload(emptyRestore,backup([]));assert.deepEqual(ids(),[]);
  harness(storage,{realHistory:true});assert.deepEqual(ids(),[],'Completed draft cannot resurrect history after an empty restore');

  await upload(h,backup([record('C')]));
  // Stale in-memory A/B in a different tab must be dropped before it saves D.
  fresh.history.save(record('D'));assert.deepEqual(ids(),['C','D']);
  h.windowEvent({type:'storage',key,newValue:storage.get(key)});
  assert.match(text(h.node('history-rows')),/Map D/);assert.doesNotMatch(text(h.node('history-rows')),/Map A/);
  storage.set(key,'[]');h.windowEvent({type:'storage',key,newValue:'[]'});
  assert.match(text(h.node('history-status')),/0 matching \/ 0 saved/);
  storage.delete(key);fresh.windowEvent({type:'storage',key,newValue:null});
  fresh.history.save(record('E'));assert.deepEqual(ids(),['E'],'Save after an external clear cannot resurrect old entries');
  storage.clear();h.windowEvent({type:'storage',key:null,newValue:null});
  assert.match(text(h.node('history-status')),/0 matching \/ 0 saved/);

  const guardStorage=new Map([[key,JSON.stringify([record('Keep')])]]),guard=harness(guardStorage,{realHistory:true});
  const before=guardStorage.get(key),visible=text(guard.node('history-rows'));
  for(const data of [backup([record('Valid'),{...record('Broken'),stoppedAt:1}]),{schemaVersion:2,sessions:[]},backup('not an array')]){
    await upload(guard,data);assert.equal(guardStorage.get(key),before);assert.equal(text(guard.node('history-rows')),visible);assert.match(guard.node('history-error').textContent,/could not be restored/);
  }
  await upload(guard,'{invalid JSON',{raw:true});assert.equal(guardStorage.get(key),before);
  await upload(guard,backup([]),{size:5000001});assert.equal(guardStorage.get(key),before);
  const realSet=guardStorage.set.bind(guardStorage);guardStorage.set=()=>{throw new Error('Quota exceeded');};
  await upload(guard,backup([record('New')]));assert.equal(guardStorage.get(key),before);assert.equal(text(guard.node('history-rows')),visible);assert.match(guard.node('history-error').textContent,/existing history was kept/);
  guardStorage.set=realSet;
  // Duplicate IDs resolve within the backup only, without retaining other history.
  await upload(guard,backup([record('New',120000),record('New',180000)]));
  assert.equal(JSON.parse(guardStorage.get(key)).length,1);assert.equal(JSON.parse(guardStorage.get(key))[0].end.mesos,180000);
  console.log('Passed: actual JSON restore replaces/overwrites history, resets filters/review, handles empty backups, survives completed-draft reload, synchronizes other tabs, prevents stale saves from resurrecting records, and preserves history after invalid files or storage failures.');
})().catch(error=>{console.error(error);process.exitCode=1;});
