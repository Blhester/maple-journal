'use strict';
const fs=require('node:fs'),{decode}=require('./lib/png-rgba.cjs'),I=require('./dist/icon-matcher.js');
function build(){const icons=require('./dist/data/etc-items.json').items.map(r=>{const im=decode(fs.readFileSync('dist/'+r.icon));return {id:r.id,iconKey:r.iconSource.split('/').at(-1),...I.template(im.data,im.width,im.height)};});fs.writeFileSync('dist/etc-icons.js','window.MapleEtcIcons='+JSON.stringify(icons)+';\n');return icons;}
module.exports={build};if(require.main===module)console.log('Embedded '+build().length+' ETC icon templates.');
