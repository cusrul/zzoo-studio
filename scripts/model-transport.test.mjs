import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { decodeModelResponse } from '../public/watch-demo/model_transport.js';

const original = readFileSync('public/watch-demo/model.glb');
const packed = gzipSync(original, { level: 9 });
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

test('web model transport is below 25 MiB and byte-identical after decompression', async () => {
  assert.ok(packed.length < 25 * 1024 * 1024);
  assert.deepEqual(gunzipSync(packed), original);
  const decoded = await decodeModelResponse(new Response(packed));
  assert.equal(sha256(new Uint8Array(decoded)), sha256(original));
});

test('accepts an HTTP-decoded GLB without attempting a second decompression', async () => {
  const decoded = await decodeModelResponse(new Response(original), null);
  assert.equal(sha256(new Uint8Array(decoded)), sha256(original));
});

test('missing decoder, HTTP error, corrupt gzip and invalid GLB fail visibly', async () => {
  await assert.rejects(decodeModelResponse(new Response(packed), null), /浏览器/);
  await assert.rejects(decodeModelResponse(new Response('', { status: 404 })), /404/);
  await assert.rejects(decodeModelResponse(new Response(packed.subarray(0, 32))));
  await assert.rejects(decodeModelResponse(new Response('not a model')), /不完整|无效/);
});

test('deployment excludes only the original model, without R2 or a Worker script', () => {
  assert.equal(readFileSync('public/.assetsignore', 'utf8').trim(), '/watch-demo/model.glb');
  const config = JSON.parse(readFileSync('wrangler.jsonc', 'utf8'));
  assert.equal(config.assets.directory, './dist');
  assert.equal(config.r2_buckets, undefined);
  assert.equal(config.main, undefined);
  const scripts = JSON.parse(readFileSync('package.json', 'utf8')).scripts;
  assert.equal(scripts.prebuild, 'node scripts/prepare-web-model.mjs');
});
