import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

test('document UI captures are traceable, small and present in the built guide', () => {
  const manifest = JSON.parse(readFileSync('public/media/crabit/ui-provenance.json', 'utf8'));
  assert.match(manifest.description, /Not physical-device/);
  assert.equal(manifest.images.length, 6);
  const guide = readFileSync('dist/docs/crabit/app-guide/index.html', 'utf8');
  let total = 0;
  for (const image of manifest.images) {
    const bytes = readFileSync(`public/media/crabit/${image.output}`);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), image.sha256);
    assert.equal(bytes.length, image.bytes);
    assert.ok(bytes.length < 100000);
    assert.ok(guide.includes(`/media/crabit/${image.output}`));
    total += bytes.length;
  }
  assert.ok(total < 250000);
  assert.match(guide, /参数为模拟数据/);
});

test('connection steps include actual controls, empty password dialog and labelled success', () => {
  const manifest = JSON.parse(readFileSync('public/media/crabit/connection-provenance.json', 'utf8'));
  assert.match(manifest.description, /No hardware connection/);
  assert.equal(manifest.images.length, 3);
  const guide = readFileSync('dist/docs/crabit/connect/index.html', 'utf8');
  for (const image of manifest.images) {
    const bytes = readFileSync(`public/media/crabit/${image.output}`);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), image.sha256);
    assert.ok(guide.includes(`/media/crabit/${image.output}`));
  }
  assert.match(guide, /输入框刻意留空/);
});
