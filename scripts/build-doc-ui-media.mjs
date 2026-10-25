// Reproducible compression of real Flutter fixture renders and browser captures.
// Capture the three watch pages interactively before running this script.
import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const product = process.env.CRABIT_DEMO_SOURCE;
if (!product) throw new Error('Set CRABIT_DEMO_SOURCE to the simulator worktree');
const mobile = path.join(product, 'apps/mobile/build');
const inputs = [
  ['flutter-settings', path.join(mobile, 'website-previews/simulated-preferences-390.png'), 870],
  ['flutter-battery', path.join(mobile, 'website-previews/simulated-battery-390.png'), 540],
  ['flutter-scripts', path.join(mobile, 'usb-workbench-430.png'), null],
  ...['menu', 'sensors', 'settings'].map(name => [`watch-${name}`, `build/watch-${name}.png`, null]),
];
const images = [];
for (const [name, input, height] of inputs) {
  const source = await readFile(input);
  let pipeline = sharp(source);
  if (height) {
    const metadata = await pipeline.metadata();
    pipeline = pipeline.extract({ left: 0, top: 0, width: metadata.width, height });
  }
  const output = `${name}.webp`;
  const bytes = await pipeline.webp({ lossless: true }).toBuffer();
  await writeFile(`public/media/crabit/${output}`, bytes);
  const metadata = await sharp(bytes).metadata();
  images.push({ output, source: name.startsWith('watch-') ? `browser screenshot ${input}` : path.relative(product, input).replaceAll('\\', '/'), sourceSha256: createHash('sha256').update(source).digest('hex'), sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length, width: metadata.width, height: metadata.height });
}
await writeFile('public/media/crabit/ui-provenance.json', JSON.stringify({
  description: 'Actual Flutter widgets with fixture data and browser-rendered 3D model with local NanoUI. Not physical-device screenshots or hardware acceptance. Only whitespace cropped from two Flutter panels; lossless WebP.',
  simulatorSource: '0f5afe8e9e948b2a36d0cfa8c4348430ae647742', images,
}, null, 2) + '\n');
console.log(images.map(image => `${image.output}: ${image.bytes} bytes`).join('\n'));
