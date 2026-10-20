// Refresh only explicitly allowlisted browser OCR assets from pinned npm archives.
// Usage: node scripts/refresh-ocr-assets.cjs [--verify]
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const lock = require('./ocr-assets.lock.json');
const out = path.resolve(__dirname, '../dist/vendor/ocr');
const sha = (algorithm, data, encoding = 'hex') => crypto.createHash(algorithm).update(data).digest(encoding);

function verify() {
  for (const asset of lock.files) {
    const bytes = fs.readFileSync(path.join(out, asset.path));
    if (bytes.length !== asset.bytes || sha('sha256', bytes) !== asset.sha256) {
      throw new Error('OCR asset checksum mismatch: ' + asset.path);
    }
  }
  console.log('Verified ' + lock.files.length + ' pinned OCR assets (' + lock.files.reduce((n, f) => n + f.bytes, 0) + ' bytes).');
}

// Read selected regular files directly; never unpack arbitrary archive paths.
function selectedTarFiles(gzip, mapping) {
  const tar = zlib.gunzipSync(gzip);
  const found = new Map();
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every(byte => byte === 0)) break;
    const text = (start, length) => header.subarray(start, start + length).toString('utf8').replace(/\0.*$/, '');
    const name = text(0, 100);
    const size = parseInt(text(124, 12).trim(), 8);
    if (!Number.isSafeInteger(size) || size < 0 || offset + 512 + size > tar.length) throw new Error('Invalid npm tar archive.');
    const source = name.replace(/^package\//, '');
    if (Object.hasOwn(mapping, source)) {
      if (!['0', '\0', ''].includes(text(156, 1))) throw new Error('Expected regular asset: ' + name);
      found.set(mapping[source], tar.subarray(offset + 512, offset + 512 + size));
    }
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  for (const destination of Object.values(mapping)) if (!found.has(destination)) throw new Error('Asset missing from npm archive: ' + destination);
  return found;
}

async function refresh() {
  const downloaded = new Map();
  for (const pkg of lock.packages) {
    console.log('Fetching ' + pkg.name + '@' + pkg.version);
    const response = await fetch(pkg.url);
    if (!response.ok) throw new Error('Download failed: ' + response.status + ' ' + pkg.name);
    const archive = Buffer.from(await response.arrayBuffer());
    if ('sha512-' + sha('sha512', archive, 'base64') !== pkg.integrity) throw new Error('Npm integrity mismatch: ' + pkg.name);
    for (const [name, bytes] of selectedTarFiles(archive, pkg.files)) {
      const expected = lock.files.find(f => f.path === name);
      if (!expected || bytes.length !== expected.bytes || sha('sha256', bytes) !== expected.sha256) throw new Error('Pinned asset mismatch: ' + name);
      downloaded.set(name, bytes);
    }
  }
  // Check every archive before updating any existing vendor file.
  fs.mkdirSync(out, { recursive: true });
  for (const [name, bytes] of downloaded) fs.writeFileSync(path.join(out, name), bytes);
  verify();
}

if (process.argv.includes('--verify')) verify();
else refresh().catch(error => { console.error(error.message); process.exitCode = 1; });
