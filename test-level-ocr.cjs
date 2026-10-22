// Optional real-engine check: make tesseract.js and @napi-rs/canvas available
// through Node module resolution. Uses the repository's local English model.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),C=require('./dist/ocr-core.js');
const {createWorker}=require('tesseract.js'),{createCanvas,loadImage}=require('@napi-rs/canvas');
(async()=>{
  const worker=await createWorker('eng',1,{langPath:path.resolve('dist/vendor/ocr'),gzip:true,cacheMethod:'none'}),settings=C.tuning('level'),cases=require('./test/fixtures/level/cases.json').cases;let count=0;
  try{for(const fixture of cases){
    const image=await loadImage(fs.readFileSync(path.join('test/fixtures/level',fixture.file))),scale=settings.scale,small=createCanvas(image.width*scale,image.height*scale),ctx=small.getContext('2d');ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(image,0,0,small.width,small.height);
    const pixels=ctx.getImageData(0,0,small.width,small.height);pixels.data.set(C.processPixels(pixels.data,settings));ctx.putImageData(pixels,0,0);const canvas=createCanvas(small.width+32,small.height+32),out=canvas.getContext('2d');out.fillStyle='#fff';out.fillRect(0,0,canvas.width,canvas.height);out.drawImage(small,16,16);
    const reads=[];for(const mode of ['8','7','13']){await worker.setParameters({tessedit_pageseg_mode:mode,tessedit_char_whitelist:'0123456789.,',user_defined_dpi:'300'});const {data}=await worker.recognize(canvas.toBuffer('image/png'));reads.push({text:data.text,confidence:data.confidence});count++;}const selected=C.select('level',reads);assert.equal(selected.value,fixture.expected,fixture.file+' returned '+JSON.stringify(reads));assert(selected.votes>=2,fixture.file+' requires majority agreement');
  }}finally{await worker.terminate();}
  console.log('Passed: majority selection from '+count+' real OCR passes across '+cases.length+' native/scaled level crops, including real 60/58 and composed 68/86/80/66/88 digits.');
})().catch(error=>{console.error(error);process.exitCode=1;});
