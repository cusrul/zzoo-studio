import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pagesBase } from './pages-base.mjs';

const root = resolve('dist');
assert.ok(existsSync(join(root, 'index.html')), 'Build the site before checking links.');

function htmlFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? htmlFiles(path) : entry.name.endsWith('.html') ? [path] : [];
  });
}

const files = htmlFiles(root);
assert.equal(readFileSync(join(root, '.assetsignore'), 'utf8').trim(), '/watch-demo/model.glb');
assert.ok(existsSync(join(root, 'watch-demo/model.glb.gz')), 'Compressed model was not built.');
function checkUploadSizes(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) checkUploadSizes(path);
    else if (path !== join(root, 'watch-demo/model.glb')) {
      assert.ok(statSync(path).size <= 25 * 1024 * 1024, `Static asset exceeds 25 MiB: ${path}`);
    }
  }
}
checkUploadSizes(root);
let internalLinks = 0;
function localPath(raw) {
  const pathname = decodeURIComponent(raw.split(/[?#]/, 1)[0]);
  assert.ok(!pagesBase || pathname === pagesBase || pathname.startsWith(`${pagesBase}/`),
    `URL escapes deployment base: ${raw}`);
  return pagesBase ? pathname.slice(pagesBase.length) || '/' : pathname;
}
for (const file of files) {
  const html = readFileSync(file, 'utf8');
  for (const [, media] of html.matchAll(/\bsrc="(\/(?!\/)[^"?#]+)"/g)) {
    const target = resolve(root, `.${localPath(media)}`);
    assert.ok(target.startsWith(`${root}/`) || target.startsWith(`${root}\\`));
    assert.ok(existsSync(target), `Missing curated image ${media} in ${file}`);
  }
  for (const [, raw] of html.matchAll(/\bhref="([^"]+)"/g)) {
    if (!raw.startsWith('/') || raw.startsWith('//')) continue;
    const pathname = localPath(raw);
    const target = resolve(root, `.${pathname}`);
    assert.ok(target === root || target.startsWith(`${root}\\`) || target.startsWith(`${root}/`), `Escaping link in ${file}`);
    assert.ok(existsSync(join(target, 'index.html')) || existsSync(target) && !pathname.endsWith('/'), `Broken link ${raw} in ${file}`);
    internalLinks += 1;
  }
}

const projects = JSON.parse(readFileSync('src/data/generated-projects.json', 'utf8'));
for (const project of projects) {
  for (const doc of project.docs) {
    assert.ok(existsSync(join(root, doc.href, 'index.html')), `Missing generated document ${doc.href}`);
  }
}
console.log(`Checked ${files.length} built HTML pages and ${internalLinks} internal links. Fragment targets and external links are not checked.`);
