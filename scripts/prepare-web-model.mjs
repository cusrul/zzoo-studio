import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export function prepareWebModel(root = resolve('.')) {
  const directory = join(root, 'public/watch-demo');
  const original = readFileSync(join(directory, 'model.glb'));
  const provenance = JSON.parse(readFileSync(join(directory, 'provenance.json'), 'utf8'));
  const sha256 = createHash('sha256').update(original).digest('hex');
  if (sha256 !== provenance.modelSha256) throw new Error('Original model does not match its provenance.');
  const packed = gzipSync(original, { level: 9 });
  if (packed.length > 25 * 1024 * 1024) throw new Error('Compressed model exceeds the static asset limit.');
  if (!gunzipSync(packed).equals(original)) throw new Error('Lossless model round-trip failed.');
  writeFileSync(join(directory, 'model.glb.gz'), packed);
  console.log(`Lossless web model: ${original.length} -> ${packed.length} bytes; source SHA256 ${sha256}`);
  return { originalBytes: original.length, compressedBytes: packed.length, sha256 };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  prepareWebModel();
}
