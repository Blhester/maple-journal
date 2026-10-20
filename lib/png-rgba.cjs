// Small dependency-free decoder for trusted 8-bit RGBA, noninterlaced PNGs.
'use strict';
const zlib = require('node:zlib');
const crcTable = new Uint32Array(256);
for (let n=0;n<256;n++) {let c=n;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;crcTable[n]=c>>>0;}
function crc32(bytes) {let crc=0xffffffff;for(const byte of bytes)crc=crcTable[(crc^byte)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
function paeth(a,b,c) {const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;}
function decode(input) {
  const bytes=Buffer.from(input);
  if(bytes.length<33||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw new Error('Invalid PNG signature.');
  let offset=8,width,height,ended=false,seenData=false;const blocks=[];
  while(offset+12<=bytes.length) {
    const length=bytes.readUInt32BE(offset),type=bytes.toString('ascii',offset+4,offset+8),start=offset+8,end=start+length;
    if(end+4>bytes.length)throw new Error('Truncated PNG chunk.');
    if(crc32(bytes.subarray(offset+4,end))!==bytes.readUInt32BE(end))throw new Error('PNG chunk CRC mismatch: '+type);
    const chunk=bytes.subarray(start,end);
    if(!width&&type!=='IHDR')throw new Error('PNG must begin with IHDR.');
    if(type==='IHDR') {
      if(width||length!==13)throw new Error('Invalid PNG IHDR.');
      width=chunk.readUInt32BE(0);height=chunk.readUInt32BE(4);
      if(!width||!height||width>8192||height>8192||width*height>24000000)throw new Error('PNG dimensions exceed supported limits.');
      if(chunk[8]!==8||chunk[9]!==6||chunk[10]!==0||chunk[11]!==0||chunk[12]!==0)throw new Error('Only noninterlaced 8-bit RGBA PNG is supported.');
    } else if(type==='IDAT') {seenData=true;blocks.push(chunk);}
    else if(type==='IEND') {if(length||!seenData)throw new Error('Invalid PNG IEND.');ended=true;offset=end+4;break;}
    else if(type[0]===type[0].toUpperCase())throw new Error('Unsupported critical PNG chunk: '+type);
    offset=end+4;
  }
  // MapleStory.io appends its generation/provenance notice after IEND. As PNG
  // viewers do, ignore that trailer; validate all actual chunks above.
  if(!ended)throw new Error('Missing PNG IEND.');
  const stride=width*4,expected=(stride+1)*height;
  const packed=zlib.inflateSync(Buffer.concat(blocks),{maxOutputLength:expected});
  if(packed.length!==expected)throw new Error('Unexpected PNG scanline length.');
  const data=new Uint8Array(stride*height);
  for(let y=0;y<height;y++) {
    const filter=packed[y*(stride+1)],source=y*(stride+1)+1,row=y*stride;
    if(filter>4)throw new Error('Unsupported PNG filter: '+filter);
    for(let x=0;x<stride;x++) {
      const left=x>=4?data[row+x-4]:0,up=y?data[row-stride+x]:0,corner=x>=4&&y?data[row-stride+x-4]:0;
      const predict=filter===0?0:filter===1?left:filter===2?up:filter===3?Math.floor((left+up)/2):paeth(left,up,corner);
      data[row+x]=(packed[source+x]+predict)&255;
    }
  }
  return {width,height,data};
}
module.exports={decode};
