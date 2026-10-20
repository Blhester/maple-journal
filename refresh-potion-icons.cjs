/* Refresh the icons for the journal's existing supplies from MeowDB Classic.
 * Run manually: node refresh-potion-icons.cjs
 * No dependencies, credentials, pricing updates, or runtime API calls.
 */
'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const base = 'https://meowdb.com';
const root = __dirname;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
// Match existing app keys by exact English item name. Custom items have no icon.
const supplies = [
  {key:'meat',kind:'hp',name:'Meat'},
  {key:'red',kind:'hp',name:'Red Potion'},
  {key:'orange',kind:'hp',name:'Orange Potion'},
  {key:'white',kind:'hp',name:'White Potion'},
  {key:'apple',kind:'hp',name:'Apple'},
  {key:'fried-chicken',kind:'hp',name:'Fried Chicken'},
  {key:'hot-dog',kind:'hp',name:'Hot Dog'},
  {key:'unagi',kind:'hp',name:'Unagi'},
  {key:'lemon',kind:'mp',name:'Lemon'},
  {key:'blue',kind:'mp',name:'Blue Potion'},
  {key:'water',kind:'mp',name:'Pure Water'},
  {key:'orange-fruit',kind:'mp',name:'Orange'},
  {key:'orange-juice',kind:'mp',name:'Orange Juice'}
];

async function request(url, binary = false) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(30000),
    headers: {'User-Agent':'GrindJournal-PotionIconRefresh/1.0 (user-requested local item lookup)'}
  });
  // Stop on denied access or throttling; do not retry or bypass restrictions.
  if (!response.ok) throw new Error('Source request failed: ' + response.status + ' ' + url);
  if (!binary) return response.json();
  if (!(response.headers.get('content-type') || '').startsWith('image/png')) throw new Error('Expected PNG: ' + url);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 33 || bytes.subarray(0,8).toString('hex') !== '89504e470d0a1a0a' || bytes.subarray(12,16).toString() !== 'IHDR') throw new Error('Invalid PNG: ' + url);
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  if (!width || !height || width > 256 || height > 256 || bytes.length > 1024 * 1024) throw new Error('Unexpected icon dimensions or size: ' + url);
  return bytes;
}

async function main() {
  const rows = [];
  const ids = new Set();
  for (let page = 1; page <= 20; page++) {
    const result = await request(base + '/msclassic/api/items?type=Use&ossyria=0&page=' + page + '&limit=100&locale=en');
    if (!Array.isArray(result.items) || typeof result.hasMore !== 'boolean') throw new Error('Unexpected item response.');
    for (const row of result.items) {
      if (row.type !== 'Use' || !Number.isSafeInteger(row.id) || ids.has(row.id)) throw new Error('Unexpected or duplicate Use item.');
      ids.add(row.id); rows.push(row);
    }
    if (!result.hasMore) break;
    if (page === 20) throw new Error('Use item pagination did not terminate.');
    await wait(150);
  }
  const items = supplies.map(supply => {
    const matches = rows.filter(row => (row.displayName || row.name) === supply.name);
    if (matches.length !== 1) throw new Error('Expected one exact Classic match for ' + supply.name + '; found ' + matches.length + '.');
    const row = matches[0];
    if (!/^\d+$/.test(String(row.iconKey))) throw new Error('Invalid icon key for ' + supply.name);
    return {
      id: String(row.id), key: supply.key, kind: supply.kind, name: supply.name,
      iconKey: String(row.iconKey), icon: 'assets/potions/' + supply.key + '.png',
      sourceUrl: base + '/msclassic/item-db/' + row.id,
      iconSource: base + '/msclassic/api/assets/icons/' + row.iconKey
    };
  });
  // Validate all source names and downloads before replacing checked-in files.
  const downloads = [];
  for (const item of items) {
    downloads.push([item.icon, await request(item.iconSource, true)]);
    await wait(150);
  }
  await fs.mkdir(path.join(root, 'dist', 'assets', 'potions'), {recursive:true});
  for (const [file, bytes] of downloads) await fs.writeFile(path.join(root, 'dist', file), bytes);
  const catalog = {
    schemaVersion: 1, checkedAt: new Date().toISOString(),
    source: base + '/msclassic/item-db/use',
    scope: 'Icons for the journal\'s existing 13 named HP/MP supplies. Exact English names and Use type verified against MeowDB Classic. Custom entries have no game icon. Icon metadata does not change supply costs.',
    items
  };
  await fs.mkdir(path.join(root, 'dist', 'data'), {recursive:true});
  await fs.writeFile(path.join(root, 'dist', 'data', 'potion-icons.json'), JSON.stringify(catalog, null, 2) + '\n');
  console.log('Saved ' + items.length + ' verified supply icons (' + downloads.reduce((sum, [, bytes]) => sum + bytes.length, 0) + ' PNG bytes). Supply costs unchanged.');
}
main().catch(error => {console.error(error.message);process.exitCode = 1;});
