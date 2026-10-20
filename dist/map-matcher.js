(function(root,factory){const api=factory(typeof module!=='undefined'?require('./map-data.js'):root.MapleMapData);root.MapleMapMatcher=api;if(typeof module!=='undefined')module.exports=api;})(typeof window!=='undefined'?window:globalThis,function(data){
  'use strict';
  const normalize=value=>String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
  const label=map=>map.street?map.street+' · '+map.name:map.name;
  const maps=[...new Map(data.maps.map(map=>[label(map),{...map,label:label(map),key:normalize(label(map)),nameKey:normalize(map.name),streetKey:normalize(map.street)}])).values()];
  function similarity(a,b){
    if(a===b)return 1;if(!a||!b)return 0;
    const rows=Array.from({length:a.length+1},()=>new Float64Array(b.length+1));for(let i=0;i<=a.length;i++)rows[i][0]=i;for(let j=0;j<=b.length;j++)rows[0][j]=j;
    for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++){rows[i][j]=Math.min(rows[i-1][j]+1,rows[i][j-1]+1,rows[i-1][j-1]+(a[i-1]===b[j-1]?0:1));if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])rows[i][j]=Math.min(rows[i][j],rows[i-2][j-2]+1);}
    return 1-rows[a.length][b.length]/Math.max(a.length,b.length);
  }
  function resolve(value){const key=normalize(value),exact=maps.find(map=>map.key===key);if(exact)return exact;const named=maps.filter(map=>map.nameKey===key);return named.length===1?named[0]:null;}
  function score(map,reading){
    const key=normalize(reading);if(key.length<3)return 0;if(key===map.key)return 1;
    const parts=String(reading).split(/\n|[·:]|\s+-\s+/).map(normalize).filter(Boolean),words=key.split(' '),streetWords=map.streetKey.split(' ').length;
    let query=parts.at(-1)||key,street=parts.length>1?parts.slice(0,-1).join(' '):'';
    if(parts.length===1&&words.length>streetWords&&similarity(words.slice(0,streetWords).join(' '),map.streetKey)>.65){street=words.slice(0,streetWords).join(' ');query=words.slice(streetWords).join(' ');}
    let nameScore=Math.max(similarity(key,map.nameKey),similarity(query,map.nameKey));
    // Do not silently collapse adjacent maps whose suffixes differ (I / II / III / IV).
    const suffix=value=>value.match(/\s([ivx]+|\d+)$/)?.[1],a=suffix(query),b=suffix(map.nameKey);if(a&&b&&a!==b)nameScore*=.65;
    return street?.length?nameScore*.9+similarity(street,map.streetKey)*.1:nameScore;
  }
  function search(readings,limit=2){
    const queries=[...new Set(readings.map(value=>String(value||'').slice(0,160)).filter(value=>/[a-z]{3}/i.test(value)))];if(!queries.length)return [];
    return maps.map(map=>{const scores=queries.map(query=>score(map,query)),best=Math.max(...scores),support=scores.filter(value=>value>=.72).length;return {...map,score:Math.min(1,best+(support>1?.015:0))};}).filter(map=>map.score>=.58).sort((a,b)=>b.score-a.score||a.label.localeCompare(b.label,'en')).slice(0,limit);
  }
  function select(reads){
    const raw=reads.map(read=>(read.label?read.label+': ':'')+String(read.text||'').trim()).join('\n'),candidates=search(reads.map(read=>read.text)),best=candidates[0],ambiguous=!!best&&(best.score<.72||!!candidates[1]&&best.score-candidates[1].score<.08&&best.score<.999);
    return {method:'map-catalog',value:best?.label||null,candidates,alternatives:[],raw,confidence:0,disagrees:ambiguous,needsConfirmation:ambiguous};
  }
  function lookup(value){const key=normalize(value);if(key.length<2)return [];const found=maps.filter(map=>map.key.includes(key)).sort((a,b)=>Number(b.nameKey===key)-Number(a.nameKey===key)||a.label.localeCompare(b.label,'en'));return found.length?found.slice(0,5):search([value],5);}
  return {search,lookup,select,resolve};
});
