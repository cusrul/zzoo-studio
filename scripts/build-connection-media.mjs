import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
const root = process.env.CRABIT_DEMO_SOURCE;
if (!root) throw new Error('Set CRABIT_DEMO_SOURCE');
const images = [];
for (const name of ['connection-start', 'connection-code', 'connection-ready']) {
  const source = `apps/mobile/build/connection-previews/${name}.png`;
  const bytes = await sharp(await readFile(path.join(root, source))).webp({lossless:true}).toBuffer();
  await writeFile(`public/media/crabit/${name}.webp`, bytes);
  images.push({ output: `${name}.webp`, source, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}
await writeFile('public/media/crabit/connection-provenance.json', JSON.stringify({ description: 'Actual DeviceConnectionPanel widgets rendered by connection_doc_preview_test.dart with FakeDeviceLink. No hardware connection; empty password input; no actual credentials accessed.', images }, null, 2)+'\n');
console.log(images);
