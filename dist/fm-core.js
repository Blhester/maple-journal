(function(root){
  'use strict';
  function integer(value,label,{min=0,max=2147483647}={}){
    const n=Number(value);
    if(value===''||!Number.isSafeInteger(n)||n<min||n>max)throw Error(`${label} must be a whole number from ${min.toLocaleString()} to ${max.toLocaleString()}.`);
    return n;
  }
  function feeRate(value){
    const n=Number(value);
    if(value===''||!Number.isFinite(n)||n<0||n>100)throw Error('Store fee must be from 0% to 100%.');
    return n;
  }
  function estimate(row,percent){
    const quantity=integer(row.quantity,'Quantity',{min:1,max:1000000}),boughtPrice=integer(row.boughtPrice,'Bought price'),targetSellPrice=integer(row.targetSellPrice,'Target sell price'),rate=feeRate(percent);
    const cost=quantity*boughtPrice,gross=quantity*targetSellPrice,fee=Math.round(gross*rate/100),proceeds=gross-fee,profit=proceeds-cost;
    if(![cost,gross,fee,proceeds,profit].every(Number.isSafeInteger))throw Error('FM total exceeds the supported meso range.');
    const returnPercent=cost?profit/cost*100:null,markupPercent=cost?(gross-cost)/cost*100:null,breakEven=rate<100?Math.ceil(boughtPrice/(1-rate/100)):null;
    return {quantity,boughtPrice,targetSellPrice,cost,gross,fee,proceeds,profit,returnPercent,markupPercent,breakEven};
  }
  function summary(rows,percent){
    const result={entries:rows.length,quantity:0,cost:0,gross:0,fee:0,proceeds:0,profit:0,returnPercent:null};
    for(const row of rows){const value=estimate(row,percent);for(const key of ['quantity','cost','gross','fee','proceeds','profit']){result[key]+=value[key];if(!Number.isSafeInteger(result[key]))throw Error('FM list total exceeds the supported meso range.');}}
    result.returnPercent=result.cost?result.profit/result.cost*100:null;
    return result;
  }
  const api={integer,feeRate,estimate,summary};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.MapleFmMath=api;
})(typeof window!=='undefined'?window:globalThis);
