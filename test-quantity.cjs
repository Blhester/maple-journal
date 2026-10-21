const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
require('./build-quantity-font.cjs').build();
const {decode}=require('./lib/png-rgba.cjs'),reader=require('./dist/quantity-reader.js'),C=require('./dist/ocr-core.js');
const directory=path.join(__dirname,'test/fixtures/quantity'),cases=require('./test/fixtures/quantity/cases.json').cases;
for(const fixture of cases){const pixels=decode(fs.readFileSync(path.join(directory,fixture.file)));assert.equal(reader.read(pixels).value,fixture.expected,fixture.file);}
assert.equal(reader.read({width:10000,height:10,data:[]}).value,null);
assert.equal(reader.read({width:10,height:10,data:new Uint8Array(3)}).value,null);
assert.equal(C.tuning('hp',{contrast:2}).reader,'quantity-font');assert.equal(C.tuning('mp',{reader:'general'}).reader,'general');
// Exercise the actual self-contained worker program, including its embedded font.
const pixels=decode(fs.readFileSync(path.join(directory,'sample-mp.png')));let message;
const sandbox={self:{postMessage:value=>{message=value;}}};vm.runInNewContext(reader.workerSource(),sandbox);sandbox.self.onmessage({data:pixels});assert.equal(message.result.value,'761');
// Real screenshot crops touching the digit outline used to return blank.
// Recover neighboring source pixels, without relaxing matcher thresholds.
const screenshot=decode(fs.readFileSync(path.join(__dirname,'dist/assets/ocr-example.png')));
function screenshotCrop(box){const {x,y,w:width,h:height}=box,data=new Uint8ClampedArray(width*height*4);for(let row=0;row<height;row++)data.set(screenshot.data.subarray(((y+row)*screenshot.width+x)*4,((y+row)*screenshot.width+x+width)*4),row*width*4);return {data,width,height};}
for(const [x,expected]of [[1419,'441'],[1469,'761']]){
  const tight={x,y:960,w:30,h:17};assert.equal(reader.read(screenshotCrop(tight)).value,null,'Unpadded tight crop reproduces the rejection');
  const padded=C.digitRegion(tight,screenshot.width,screenshot.height,'quantity-font');assert.equal(reader.read(screenshotCrop(padded)).value,expected,'Source margin recovers the complete count');
}
assert.deepEqual(C.digitRegion({x:0,y:0,w:10,h:10},100,100,'quantity-font'),{x:0,y:0,w:12,h:12});
assert.deepEqual(C.digitRegion({x:90,y:90,w:10,h:10},100,100,'quantity-font'),{x:88,y:88,w:12,h:12});
assert.deepEqual(C.digitRegion({x:1419,y:960,w:30,h:17},1919,1079,'exp-font'),{x:1419,y:960,w:30,h:17},'EXP crop is unchanged');
console.log('Passed: five real screenshot counts, 13 rendered digit/scale fixtures, seven blank/ambiguous controls, old settings migration, input bounds, and embedded font worker.');
console.log('Passed: tight HP/MP crops reproduce blank matches and recover 441/761 using real source margins; screenshot edges clamp and EXP regions stay unchanged.');
