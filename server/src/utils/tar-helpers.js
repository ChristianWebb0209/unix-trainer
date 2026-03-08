/**
 * Minimal tar buffer builder for putArchive (no external deps).
 * Format matches Go archive/tar USTAR so Docker (Go) accepts it.
 * Each entry: 512-byte header + content padded to 512-byte blocks.
 */

/**
 * Build a tar buffer from file entries (path relative to archive root).
 * @param {Array<{ path: string, content: string | Buffer }>} entries
 * @returns {Buffer}
 */
export function buildTarBuffer(entries) {
  const blocks = [];
  for (const { path: filePath, content } of entries) {
    const name = filePath.replace(/^\/+/, '').slice(0, 100);
    const body = Buffer.isBuffer(content) ? content : Buffer.from(String(content), 'utf8');
    const size = body.length;
    const header = Buffer.alloc(512);
    header.write(name, 0, 'utf8');
    header.write('0000644 ', 100, 8);
    header.write('0000000 ', 108, 8);
    header.write('0000000 ', 116, 8);
    header.write(size.toString(8).padStart(11, '0') + ' ', 124, 12);
    header.write(Math.floor(Date.now() / 1000).toString(8).padStart(11, '0') + ' ', 136, 12);
    for (let i = 148; i < 156; i++) header[i] = 0x20;
    header.write('0', 156, 1);
    header.write('ustar\x00', 257, 6);
    header.write('00', 263, 2);
    let sum = 0;
    for (let i = 0; i < 512; i++) sum += header[i];
    const chk = sum.toString(8).padStart(7, '0').slice(-7);
    header.write(chk, 148, 7);
    header[155] = 0x20;
    blocks.push(header);
    const pad = (512 - (size % 512)) % 512;
    blocks.push(body);
    if (pad) blocks.push(Buffer.alloc(pad));
  }
  blocks.push(Buffer.alloc(1024));
  return Buffer.concat(blocks);
}
