const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
require('./build-quantity-font.cjs').build();
const {decode}=require('./lib/png-rgba.cjs'),reader=require('./dist/quantity-reader.js'),C=require('./dist/ocr-core.js');
const directory=path.join(__dirname,'test/fixtures/quantity'),cases=require('./test/fixtures/quantity/cases.json').cases;
for(const fixture of cases){const pixels=decode(fs.readFileSync(path.join(directory,fixture.file)));assert.equal(reader.read(pixels).value,fixture.expected,fixture.file);}
assert.equal(reader.read({width:10000,height:10,data:[]}).value,null);
assert.equal(reader.read({width:10,height:10,data:new Uint8Array(3)}).value,null);
assert.equal(C.tuning('hp',{contrast:2}).reader,'classic');assert.equal(C.tuning('mp',{reader:'general'}).reader,'general');
// Exercise the actual self-contained worker program, including its embedded font.
const pixels=decode(fs.readFileSync(path.join(directory,'sample-mp.png')));let message;
const sandbox={self:{postMessage:value=>{message=value;}}};vm.runInNewContext(reader.workerSource(),sandbox);sandbox.self.onmessage({data:pixels});assert.equal(message.result.value,'761');
console.log('Passed: five real screenshot counts, 13 rendered digit/scale fixtures, seven blank/ambiguous controls, old settings migration, input bounds, and embedded font worker.');
