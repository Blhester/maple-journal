'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
require('./build-exp-font.cjs').build();
const {decode}=require('./lib/png-rgba.cjs'),reader=require('./dist/exp-reader.js'),C=require('./dist/ocr-core.js');
const directory=path.join(__dirname,'test/fixtures/exp'),cases=require('./test/fixtures/exp/cases.json').cases;
for(const fixture of cases){
  const result=reader.read(decode(fs.readFileSync(path.join(directory,fixture.file))));
  assert.equal(result.value,fixture.expected,fixture.file);assert.equal(result.method,'classic-exp');
}
for(const invalid of [undefined,{width:9999,height:9,data:[]},{width:10,height:10,data:new Uint8Array(3)}])assert.equal(reader.read(invalid).value,null);
assert.equal(C.tuning('exp').reader,'exp-font');assert.equal(C.tuning('exp',{reader:'general'}).reader,'general');
const pixels=decode(fs.readFileSync(path.join(directory,'sample-exp-full.png')));let message;
const sandbox={self:{postMessage:result=>{message=result;}}};vm.runInNewContext(reader.workerSource(),sandbox);sandbox.self.onmessage({data:pixels});assert.equal(message.result.value,'268628');
console.log('Passed: 38 EXP font image fixtures (actual screenshot, percentage exclusion, digits 0–9, scales 1/1.25/1.5/2/3, commas, zero, missing/truncated digits, blank/transparent/unrelated text), input bounds, default/general settings and embedded worker.');
