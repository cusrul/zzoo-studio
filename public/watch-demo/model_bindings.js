// GLB/CAD object names are not firmware switch IDs. Bind by physical position
// viewed from the OLED side: upper left, lower left, upper right.
export const FRAME_WIDTH = 128;
export const FRAME_HEIGHT = 64;
export const FRAME_BYTES = FRAME_WIDTH * FRAME_HEIGHT / 8;

// The simulator exposes the OLED as row-major, packed MSB-first monochrome.
// Expand the borrowed bytes into the RGBA buffer used by the Three.js texture.
export function unpackPackedMsbFrame(packed, rgba = new Uint8ClampedArray(FRAME_WIDTH * FRAME_HEIGHT * 4)) {
  if (!(packed instanceof Uint8Array) || packed.length !== FRAME_BYTES) {
    throw new TypeError(`Expected ${FRAME_BYTES} packed frame bytes`);
  }
  if (!(rgba instanceof Uint8ClampedArray) || rgba.length !== FRAME_WIDTH * FRAME_HEIGHT * 4) {
    throw new TypeError('Expected a 128x64 RGBA output buffer');
  }
  for (let pixel = 0; pixel < FRAME_WIDTH * FRAME_HEIGHT; pixel++) {
    const value = packed[pixel >> 3] & (0x80 >> (pixel & 7)) ? 245 : 0;
    const offset = pixel * 4;
    rgba[offset] = rgba[offset + 1] = rgba[offset + 2] = value;
    rgba[offset + 3] = 255;
  }
  return rgba;
}

export function hashPackedFrame(packed) {
  if (!(packed instanceof Uint8Array) || packed.length !== FRAME_BYTES) {
    throw new TypeError(`Expected ${FRAME_BYTES} packed frame bytes`);
  }
  let hash = 0x811c9dc5;
  for (const byte of packed) hash = Math.imul(hash ^ byte, 0x01000193);
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export const bindings = {
  screen: 'ssd1306.001_export',
  board: 'Board_export',
  screenWidthFraction: 0.94,
  buttons: [
    { mesh: 'SW2_export', key: 0, label: '上', inward: [-1, 0, 0] },
    { mesh: 'SW1_export', key: 1, label: '下', inward: [-1, 0, 0] },
    { mesh: 'SW3_export', key: 2, label: '确认', inward: [1, 0, 0] },
  ],
};
