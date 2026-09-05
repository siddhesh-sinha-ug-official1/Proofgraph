#!/usr/bin/env node
/**
 * generate-icons.mjs — create app icons from scratch using pure Node.js.
 *
 * Generates a 512×512 PNG icon (and scaled copies for Linux) without any
 * external dependencies. The icon is a teal circle with "PG" initials on
 * a dark background — a clean placeholder. Replace with a proper designer
 * icon for the public release.
 *
 * electron-builder auto-converts the 512 PNG into .ico (Windows) and
 * .icns (Mac) at build time.
 *
 * Usage:  node desktop/scripts/generate-icons.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RES = join(__dirname, '..', 'resources');

// ── Minimal PNG encoder (no deps) ────────────────────────────────────
function encodePng(width, height, rgba) {
  // PNG signature
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type: RGBA
  ihdr[10] = 0;  // compression
  ihdr[11] = 0;  // filter
  ihdr[12] = 0;  // interlace
  const ihdrChunk = makeChunk('IHDR', ihdr);

  // IDAT chunk: filter byte 0 (None) before each row, then deflate
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0; // filter: None
    rgba.copy(raw, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const compressed = deflateSync(raw, { level: 6 });
  const idatChunk = makeChunk('IDAT', compressed);

  // IEND chunk
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([sig, ihdrChunk, idatChunk, iendChunk]);
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeB = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeB, data]);
  const crc = crc32(body);
  const crcB = Buffer.alloc(4);
  crcB.writeUInt32BE(crc, 0);
  return Buffer.concat([len, body, crcB]);
}

// CRC-32 (ISO 3309)
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[n] = c;
}
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// ── Icon drawing ─────────────────────────────────────────────────────
function drawIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const cx = size / 2, cy = size / 2;
  const radius = size * 0.42;

  // Colors
  const BG  = [26, 29, 37, 255];      // dark navy (#1A1D25)
  const CIRCLE = [90, 145, 200, 255];  // teal-blue (#5A91C8)
  const INNER = [35, 40, 55, 255];     // dark inner (#232837)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const off = (y * size + x) * 4;
      const dx = x - cx, dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      let color;
      if (dist <= radius * 0.82) {
        color = INNER;
      } else if (dist <= radius) {
        // Anti-aliased ring edge
        const edge = 1 - Math.max(0, Math.min(1, (dist - radius + 1.5) / 3));
        color = [
          Math.round(CIRCLE[0] * edge + BG[0] * (1 - edge)),
          Math.round(CIRCLE[1] * edge + BG[1] * (1 - edge)),
          Math.round(CIRCLE[2] * edge + BG[2] * (1 - edge)),
          255,
        ];
      } else {
        color = BG;
      }

      // Draw a simple geometric "proof graph" pattern inside:
      // 3 connected nodes (small circles) in a triangle arrangement
      const nodes = [
        { nx: cx, ny: cy - radius * 0.35 },           // top
        { nx: cx - radius * 0.32, ny: cy + radius * 0.22 }, // bottom-left
        { nx: cx + radius * 0.32, ny: cy + radius * 0.22 }, // bottom-right
      ];

      // Draw edges (lines between nodes)
      const nodeR = radius * 0.12;
      for (let i = 0; i < 3; i++) {
        const j = (i + 1) % 3;
        const lx1 = nodes[i].nx, ly1 = nodes[i].ny;
        const lx2 = nodes[j].nx, ly2 = nodes[j].ny;
        // Point-to-line-segment distance
        const ldx = lx2 - lx1, ldy = ly2 - ly1;
        const lenSq = ldx * ldx + ldy * ldy;
        let t = lenSq > 0 ? ((x - lx1) * ldx + (y - ly1) * ldy) / lenSq : 0;
        t = Math.max(0, Math.min(1, t));
        const px = lx1 + t * ldx, py = ly1 + t * ldy;
        const lineDist = Math.sqrt((x - px) ** 2 + (y - py) ** 2);
        const lineWidth = size * 0.015;
        if (lineDist < lineWidth && dist <= radius * 0.82) {
          const a = 1 - Math.max(0, Math.min(1, (lineDist - lineWidth + 1) / 2));
          color = [
            Math.round(CIRCLE[0] * a + color[0] * (1 - a)),
            Math.round(CIRCLE[1] * a + color[1] * (1 - a)),
            Math.round(CIRCLE[2] * a + color[2] * (1 - a)),
            255,
          ];
        }
      }

      // Draw nodes (small filled circles)
      for (const { nx, ny } of nodes) {
        const ndist = Math.sqrt((x - nx) ** 2 + (y - ny) ** 2);
        if (ndist < nodeR && dist <= radius * 0.82) {
          const a = 1 - Math.max(0, Math.min(1, (ndist - nodeR + 1.5) / 3));
          color = [
            Math.round(CIRCLE[0] * a + color[0] * (1 - a)),
            Math.round(CIRCLE[1] * a + color[1] * (1 - a)),
            Math.round(CIRCLE[2] * a + color[2] * (1 - a)),
            255,
          ];
        }
      }

      rgba[off] = color[0];
      rgba[off + 1] = color[1];
      rgba[off + 2] = color[2];
      rgba[off + 3] = color[3];
    }
  }
  return rgba;
}

// ── Generate all icon sizes ──────────────────────────────────────────
console.log('[generate-icons] creating app icons…');

// Main icon (512×512) — electron-builder converts to .ico/.icns
const icon512 = drawIcon(512);
writeFileSync(join(RES, 'icon.png'), encodePng(512, 512, icon512));
console.log('  ✓ resources/icon.png (512×512)');

// Linux icons at standard sizes
const linuxDir = join(RES, 'icons');
mkdirSync(linuxDir, { recursive: true });

for (const size of [16, 32, 48, 64, 128, 256, 512]) {
  const pixels = drawIcon(size);
  const filename = `${size}x${size}.png`;
  writeFileSync(join(linuxDir, filename), encodePng(size, size, pixels));
  console.log(`  ✓ resources/icons/${filename}`);
}

console.log('[generate-icons] done');
