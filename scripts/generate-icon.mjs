// Generate a simple 1024x1024 source icon for `tauri icon`, with no image
// dependencies. It draws the Prompt Bank accent card with three ink lines,
// echoing the app's Swiss, copy-only library feel. Run:
//   node scripts/generate-icon.mjs && npm run tauri -- icon src-tauri/app-icon.png
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const W = 1024;
const H = 1024;

const ACCENT = [229, 57, 28, 255]; // #e5391c
const PAPER = [245, 244, 240, 255]; // off-white card
const INK = [26, 26, 26, 255]; // near-black lines

const CARD = 160; // card margin
const bars = [
  { top: 348, bottom: 418, left: 268, right: 760 },
  { top: 470, bottom: 540, left: 268, right: 668 },
  { top: 592, bottom: 662, left: 268, right: 560 }
];

function pixel(x, y) {
  const insideCard = x >= CARD && x < W - CARD && y >= CARD && y < H - CARD;
  if (!insideCard) return ACCENT;
  for (const bar of bars) {
    if (x >= bar.left && x < bar.right && y >= bar.top && y < bar.bottom) return INK;
  }
  return PAPER;
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) c = crcTable[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, 'latin1');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // color type RGBA
ihdr[10] = 0; // compression
ihdr[11] = 0; // filter
ihdr[12] = 0; // interlace

const raw = Buffer.alloc((W * 4 + 1) * H);
let offset = 0;
for (let y = 0; y < H; y++) {
  raw[offset++] = 0; // filter: none
  for (let x = 0; x < W; x++) {
    const [r, g, b, a] = pixel(x, y);
    raw[offset++] = r;
    raw[offset++] = g;
    raw[offset++] = b;
    raw[offset++] = a;
  }
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0))
]);

const outputPath = new URL('../src-tauri/app-icon.png', import.meta.url);
writeFileSync(outputPath, png);
console.log(`Wrote ${png.length} bytes to src-tauri/app-icon.png`);
