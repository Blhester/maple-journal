(function (root) {
  'use strict';
  const catalog = {
    hp: [
      {id:'meat',name:'Meat',cost:80},
      {id:'red',name:'Red Potion',cost:50},
      {id:'orange',name:'Orange Potion',cost:150},
      {id:'white',name:'White Potion',cost:350},
      {id:'apple',name:'Apple',cost:20},
      {id:'fried-chicken',name:'Fried Chicken',cost:60},
      {id:'hot-dog',name:'Hot Dog',cost:180},
      {id:'unagi',name:'Unagi',cost:1000},
      {id:'custom',name:'Custom HP item',cost:0}
    ],
    mp: [
      {id:'lemon',name:'Lemon',cost:150},
      {id:'blue',name:'Blue Potion',cost:220},
      {id:'water',name:'Pure Water',cost:1120},
      {id:'orange-fruit',name:'Orange',cost:50},
      {id:'orange-juice',name:'Orange Juice',cost:540},
      {id:'custom',name:'Custom MP item',cost:0}
    ]
  };
  function integer(value, label) {
    if (typeof value === 'string' && !/^\d+$/.test(value.trim())) throw new Error(label + ' must be a whole number of 0 or more.');
    const n = Number(value);
    if (!Number.isSafeInteger(n) || n < 0) throw new Error(label + ' must be a safe whole number of 0 or more.');
    return n;
  }
  function calculate(start, end, durationMs) {
    if (!Number.isFinite(durationMs) || durationMs <= 0) throw new Error('The session needs a positive elapsed time.');
    const values = {};
    for (const key of ['exp','mesos','hp','mp']) values[key] = integer(end[key], 'Ending ' + key);
    const extraExp = integer(end.extraExp ?? 0, 'Level-up EXP');
    const hpUsed = start.hp + integer(end.hpAdded ?? 0, 'HP potions added') - values.hp;
    const mpUsed = start.mp + integer(end.mpAdded ?? 0, 'MP potions added') - values.mp;
    if (hpUsed < 0 || mpUsed < 0) throw new Error('Ending potions exceed your starting supply. Enter pickups or restocks under Adjustments.');
    const hpCost = hpUsed * start.hpCost, mpCost = mpUsed * start.mpCost;
    const gross = values.mesos - start.mesos;
    const net = gross - hpCost - mpCost;
    const exp = values.exp - start.exp + extraExp;
    if (![hpUsed,mpUsed,hpCost,mpCost,gross,net,exp].every(Number.isSafeInteger)) throw new Error('These totals are too large. Use smaller values.');
    const per = ms => ({exp: exp * ms / durationMs, mesos: net * ms / durationMs});
    const rates = {hour:per(3600000),ten:per(600000),minute:per(60000)};
    if (!Object.values(rates).every(r => Number.isFinite(r.exp) && Number.isFinite(r.mesos))) throw new Error('Rates could not be calculated. Check your elapsed time.');
    return {hpUsed,mpUsed,hpCost,mpCost,gross,net,exp,durationMs,rates};
  }
  root.MapleMath = {catalog,integer,calculate};
  if (typeof module !== 'undefined') module.exports = root.MapleMath;
})(typeof window !== 'undefined' ? window : globalThis);
