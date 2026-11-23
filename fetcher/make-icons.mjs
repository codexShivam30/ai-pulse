// Draws the app icon (purple-blue gradient with a white sparkle) as PNG files. No dependencies.
// Run: node fetcher/make-icons.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'app', 'icons');
mkdirSync(dir, { recursive: true });

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};

function sparkle(x, y, cx, cy, r) { // 4-point star: |dx|^0.5 + |dy|^0.5 <= r^0.5
  const dx = Math.abs(x - cx) / r, dy = Math.abs(y - cy) / r;
  return Math.sqrt(dx) + Math.sqrt(dy) <= 1;
}

function icon(size) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  const S = 3; // supersampling for smooth edges
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const t = (x + y) / (2 * size);
      const bg = [139 + (34 - 139) * t, 92 + (211 - 92) * t, 246 + (238 - 246) * t];
      let cover = 0;
      for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
        const px = (x + (sx + 0.5) / S) / size, py = (y + (sy + 0.5) / S) / size;
        if (sparkle(px, py, 0.46, 0.52, 0.27) || sparkle(px, py, 0.70, 0.30, 0.09)) cover++;
      }
      const a = cover / (S * S);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = bg[0] + (255 - bg[0]) * a; raw[o + 1] = bg[1] + (255 - bg[1]) * a; raw[o + 2] = bg[2] + (255 - bg[2]) * a; raw[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

for (const s of [192, 512]) writeFileSync(join(dir, `icon-${s}.png`), icon(s));
console.log('Icons written to', dir);
