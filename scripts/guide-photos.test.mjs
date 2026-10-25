import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

test('selected guide photos match their source manifest and stay within page budget', () => {
  const manifest = JSON.parse(readFileSync('public/media/crabit/provenance.json', 'utf8'));
  assert.equal(manifest.images.length, 6);
  let total = 0;
  for (const photo of manifest.images) {
    assert.match(photo.output, /^[a-z-]+\.webp$/);
    const bytes = readFileSync(`public/media/crabit/${photo.output}`);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), photo.sha256);
    assert.equal(bytes.length, photo.bytes);
    assert.ok(bytes.length < 150000);
    total += bytes.length;
    assert.ok(existsSync(`dist/media/crabit/${photo.output}`));
  }
  assert.ok(total < 500000);
  const html = readFileSync('dist/docs/crabit/start/index.html', 'utf8');
  for (const photo of manifest.images) assert.ok(html.includes(`/media/crabit/${photo.output}`));
  assert.doesNotMatch(html, /\.HEIC|\.MOV|immich-20261024/);
});
