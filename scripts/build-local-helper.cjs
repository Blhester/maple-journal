'use strict';
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const root=path.resolve(__dirname,'..');
function buildLocalHelper(destination){
  const files=[];
  function walk(folder,prefix){for(const entry of fs.readdirSync(folder,{withFileTypes:true})){const file=path.join(folder,entry.name),name=prefix+entry.name;if(entry.isDirectory())walk(file,name+'/');else files.push([name,fs.readFileSync(file)]);}}
  walk(path.join(root,'dist'),'dist/');walk(path.join(root,'local-overlay'),'local-overlay/');
  files.push(['README.txt',fs.readFileSync(path.join(root,'LOCAL-OVERLAY.txt'))],['LICENSE',fs.readFileSync(path.join(root,'LICENSE'))],['Start-Grind-Journal.cmd',Buffer.from('@echo off\r\ncd /d "%~dp0"\r\nwhere node >nul 2>nul\r\nif errorlevel 1 (\r\n echo Install Node.js 24 LTS from https://nodejs.org/ then reopen this file.\r\n pause\r\n exit /b 1\r\n)\r\nnode local-overlay/server.cjs\r\npause\r\n')]);
  const table=Array.from({length:256},(_,i)=>{let n=i;for(let bit=0;bit<8;bit++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;}),crc=bytes=>{let n=0xffffffff;for(const b of bytes)n=table[(n^b)&255]^(n>>>8);return (n^0xffffffff)>>>0;};
  const body=[],directory=[];let offset=0;
  for(const [name,bytes]of files){const filename=Buffer.from(name),packed=zlib.deflateRawSync(bytes,{level:9}),checksum=crc(bytes),local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt16LE(8,8);local.writeUInt16LE(33,12);local.writeUInt32LE(checksum,14);local.writeUInt32LE(packed.length,18);local.writeUInt32LE(bytes.length,22);local.writeUInt16LE(filename.length,26);body.push(local,filename,packed);
    const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(8,10);central.writeUInt16LE(33,14);central.writeUInt32LE(checksum,16);central.writeUInt32LE(packed.length,20);central.writeUInt32LE(bytes.length,24);central.writeUInt16LE(filename.length,28);central.writeUInt32LE(offset,42);directory.push(central,filename);offset+=local.length+filename.length+packed.length;
  }
  const index=Buffer.concat(directory),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(index.length,12);end.writeUInt32LE(offset,16);fs.writeFileSync(destination,Buffer.concat([...body,index,end]));return {file:destination,files:files.length,bytes:fs.statSync(destination).size};
}
module.exports={buildLocalHelper};if(require.main===module)console.log(buildLocalHelper(process.argv[2]||path.join(root,'..','maple-stream-helper.zip')));
