/**
 * A small reader for the USGS 3DEP 1 m GeoTIFFs: single-band float32, 512-pixel tiles, LZW with the floating-point
 * predictor (TIFF predictor 3), little-endian. It reads a window of pixels and nothing else (no georeferencing beyond
 * the tags it hands back), so no GeoTIFF package is needed. Anything else (strips, other compression) throws.
 */
import { openSync, readSync, closeSync } from 'node:fs';

/** TIFF's LZW (MSB-first codes, 9 to 12 bits, "early change"), one tile's bytes. */
function lzw(src, outLen) {
  const out = Buffer.alloc(outLen);
  let table = [], bits = 9, o = 0, acc = 0, nacc = 0, p = 0, prev = null;
  const reset = () => { table = []; for (let i = 0; i < 256; i++) table.push(Buffer.from([i])); table.push(null, null); bits = 9; prev = null; };
  reset();
  while (o < outLen) {
    while (nacc < bits) { if (p >= src.length) return out; acc = (acc << 8) | src[p++]; nacc += 8; }
    const code = (acc >>> (nacc - bits)) & ((1 << bits) - 1); nacc -= bits; acc &= (1 << nacc) - 1;
    if (code === 257) break;
    if (code === 256) { reset(); continue; }
    let e;
    if (code < table.length) e = table[code]; else e = Buffer.concat([prev, prev.subarray(0, 1)]);
    if (prev) table.push(Buffer.concat([prev, e.subarray(0, 1)]));
    e.copy(out, o, 0, Math.min(e.length, outLen - o)); o += e.length; prev = e;
    const n = table.length; // early change: the width grows one code before the table is full
    bits = n >= 2047 ? 12 : n >= 1023 ? 11 : n >= 511 ? 10 : 9;
  }
  return out;
}

/** Open a tiled float32 GeoTIFF; returns { width, height, tiepoint, scale, nodata, window(x0, y0, w, h) → Float32Array }. */
export function openGeoTiff(path) {
  const fd = openSync(path, 'r');
  const read = (off, len) => { const b = Buffer.alloc(len); readSync(fd, b, 0, len, off); return b; };
  const head = read(0, 8);
  if (head.toString('latin1', 0, 2) !== 'II') throw new Error('not a little-endian TIFF');
  const ifd = head.readUInt32LE(4), n = read(ifd, 2).readUInt16LE(0), ents = read(ifd + 2, n * 12), tags = {};
  const SZ = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 12: 8 };
  for (let i = 0; i < n; i++) {
    const t = ents.readUInt16LE(i * 12), ty = ents.readUInt16LE(i * 12 + 2), c = ents.readUInt32LE(i * 12 + 4), len = SZ[ty] * c;
    const raw = len <= 4 ? ents.subarray(i * 12 + 8, i * 12 + 8 + len) : read(ents.readUInt32LE(i * 12 + 8), len);
    tags[t] = ty === 3 ? Array.from({ length: c }, (_, k) => raw.readUInt16LE(k * 2)) : ty === 4 ? Array.from({ length: c }, (_, k) => raw.readUInt32LE(k * 4)) : ty === 12 ? Array.from({ length: c }, (_, k) => raw.readDoubleLE(k * 8)) : raw.toString('latin1');
  }
  const width = tags[256][0], height = tags[257][0], TW = tags[322]?.[0], TH = tags[323]?.[0];
  if (tags[258][0] !== 32 || tags[339][0] !== 3 || tags[259][0] !== 5 || tags[317][0] !== 3 || !TW) throw new Error('only tiled float32 LZW with predictor 3 is read');
  const offs = tags[324], cnts = tags[325], across = Math.ceil(width / TW), cache = new Map();
  const tile = (tx, ty) => {
    const k = ty * across + tx; if (cache.has(k)) return cache.get(k);
    const rowB = TW * 4, raw = lzw(read(offs[k], cnts[k]), TH * rowB), f = Buffer.alloc(TH * rowB);
    for (let y = 0; y < TH; y++) {
      const r = raw.subarray(y * rowB, (y + 1) * rowB);
      for (let i = 1; i < rowB; i++) r[i] = (r[i] + r[i - 1]) & 255; // undo the byte-wise differencing along the row
      for (let x = 0; x < TW; x++) { // the row holds all the pixels' top bytes, then all their next bytes…: big-endian floats, apart
        const o = y * rowB + x * 4; f[o] = r[3 * TW + x]; f[o + 1] = r[2 * TW + x]; f[o + 2] = r[TW + x]; f[o + 3] = r[x];
      }
    }
    const a = new Float32Array(f.buffer, f.byteOffset, TH * TW); cache.set(k, a); return a;
  };
  return {
    width, height, tiepoint: tags[33922], scale: tags[33550], nodata: parseFloat(tags[42113]),
    window(x0, y0, w, h) {
      const out = new Float32Array(w * h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const X = x0 + x, Y = y0 + y; out[y * w + x] = tile(Math.floor(X / TW), Math.floor(Y / TH))[(Y % TH) * TW + (X % TW)]; }
      return out;
    },
    close() { closeSync(fd); },
  };
}
