import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withBase, prefixHtml } from './pages-base.mjs';

test('Pages prefixes root URLs exactly once and leaves external/relative links alone', () => {
  for (const url of ['/docs/', '/media/image.webp', '/#stores', '/watch-demo/index.html']) {
    assert.equal(withBase(url, '/zzoo-studio'), '/zzoo-studio' + url);
    assert.equal(withBase(withBase(url, '/zzoo-studio'), '/zzoo-studio'), '/zzoo-studio' + url);
    assert.equal(withBase(url, ''), url);
  }
  for (const url of ['https://example.org/', '//cdn.example.org/a', './model.glb.gz', '#topic']) {
    assert.equal(withBase(url, '/zzoo-studio'), url);
  }
});

test('HTML prefixing covers model iframe, pictures, scripts and navigation without changing prose', () => {
  const html = `<a href="/docs/">文档</a><img src='/media/a.webp'><iframe src="/watch-demo/index.html"></iframe>` +
    `<script src="/zzoo-studio/_astro/a.js"></script><code>&lt;a href=&quot;/docs/&quot;&gt;</code>`;
  const output = prefixHtml(html, '/zzoo-studio');
  assert.match(output, /href="\/zzoo-studio\/docs\/"/);
  assert.match(output, /src='\/zzoo-studio\/media\/a.webp'/);
  assert.match(output, /src="\/zzoo-studio\/watch-demo\/index.html"/);
  assert.ok(!output.includes('/zzoo-studio/zzoo-studio/'));
  assert.ok(output.includes('&lt;a href=&quot;/docs/&quot;&gt;'));
  assert.equal(prefixHtml(html, ''), html);
});
