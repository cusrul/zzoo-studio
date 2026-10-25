// Decode transport compression only; geometry, textures and node names are unchanged.
export async function decodeModelResponse(response, Decompressor = globalThis.DecompressionStream) {
  if (!response.ok) throw new Error(`模型下载失败 (${response.status})`);
  let bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    if (typeof Decompressor !== 'function') throw new Error('当前浏览器不支持模型解压，请使用新版浏览器');
    const stream = new Blob([bytes]).stream().pipeThrough(new Decompressor('gzip'));
    bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  }
  // A host may already have decoded Content-Encoding: gzip before fetch returns.
  if (bytes.length < 12) throw new Error('模型数据不完整');
  const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (header.getUint32(0, true) !== 0x46546c67 || header.getUint32(4, true) !== 2 ||
      header.getUint32(8, true) !== bytes.length) throw new Error('模型格式或长度无效');
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}
