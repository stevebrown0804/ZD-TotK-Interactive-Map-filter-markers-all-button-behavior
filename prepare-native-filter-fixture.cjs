'use strict';

const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const bundleUrl = 'https://www.zeldadungeon.net/maps/assets/ZDMap-9bcde02c.js';
const expectedClassHash = '9aff269475795daef9a1b90cd0a7629023d6e75da8805b4fa2a74f11f07b8513';
const fixturePath = path.join(__dirname, 'native-filter-control.fixture.js');
const maxBundleBytes = 10 * 1024 * 1024;
const fixtureHeader = [
  '// Native Zelda Dungeon filter control, extracted unchanged from the public map bundle.',
  `// Source: ${bundleUrl}`,
  '// Retrieved on 2026-10-24; class rl only. Used as a compatibility test fixture.',
  '',
].join('\n');

function isWithin(folder, target) {
  const relative = path.relative(folder, target);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function readLocalBundle(argument) {
  const inputPath = path.resolve(__dirname, argument);
  if (!isWithin(__dirname, inputPath)) {
    throw new Error('The local bundle must be inside this project folder.');
  }
  const resolvedRoot = fs.realpathSync(__dirname);
  const resolvedInput = fs.realpathSync(inputPath);
  if (!isWithin(resolvedRoot, resolvedInput)) {
    throw new Error('The local bundle must resolve inside this project folder.');
  }
  const info = fs.statSync(resolvedInput);
  if (!info.isFile() || info.size > maxBundleBytes) {
    throw new Error('The local bundle must be a file no larger than 10 MiB.');
  }
  return fs.readFileSync(resolvedInput, 'utf8');
}

async function downloadBundle() {
  const response = await fetch(bundleUrl, {
    signal: AbortSignal.timeout(30_000),
    redirect: 'error',
  });
  if (!response.ok) throw new Error(`Bundle download returned HTTP ${response.status}.`);
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.byteLength;
    if (size > maxBundleBytes) {
      throw new Error('The downloaded bundle exceeds 10 MiB.');
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function main() {
  if (Number(process.versions.node.split('.')[0]) < 22) {
    throw new Error('Node.js 22 or later is required.');
  }
  const args = process.argv.slice(2);
  if (args.length !== 0 && (args.length !== 2 || args[0] !== '--input')) {
    throw new Error('Usage: node prepare-native-filter-fixture.cjs [--input local-bundle.js]');
  }
  const source = args.length === 2 ? readLocalBundle(args[1]) : await downloadBundle();
  const start = source.indexOf('class rl extends Je');
  const end = start < 0 ? -1 : source.indexOf('class al', start);
  if (start < 0 || end <= start) {
    throw new Error('The pinned native filter-control class was not found in the bundle.');
  }
  const nativeClass = source.slice(start, end).trim();
  const actualHash = createHash('sha256').update(nativeClass, 'utf8').digest('hex');
  if (actualHash !== expectedClassHash) {
    throw new Error(`Native filter-control SHA-256 mismatch; existing fixture preserved. Received ${actualHash}.`);
  }
  fs.writeFileSync(fixturePath, `${fixtureHeader}${nativeClass}\n`, 'utf8');
  console.log('Prepared native-filter-control.fixture.js.');
}

main().catch(error => {
  console.error(`Cannot prepare native filter fixture: ${error.message}`);
  process.exitCode = 1;
});
