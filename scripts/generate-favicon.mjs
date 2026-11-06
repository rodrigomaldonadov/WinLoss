// Genera src/app/favicon.ico con el estilo del proyecto (fondo oscuro + barras esmeralda).
// Sin dependencias: PNG con zlib nativo + contenedor ICO.
// Uso: node scripts/generate-favicon.mjs
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "src", "app", "favicon.ico");

const BG = [10, 10, 15];
const EMERALD = [16, 185, 129];
const EMERALD_DARK = [5, 150, 105];
const WHITE = [244, 244, 245];

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const t = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

function makePng(size, paint) {
  const px = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, g, b, a = 255] = paint(x, y, size);
      const i = (y * size + x) * 4;
      px[i] = r;
      px[i + 1] = g;
      px[i + 2] = b;
      px[i + 3] = a;
    }
  }
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(size * stride);
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0;
    px.copy(raw, y * stride + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// Mismo motivo que los iconos PWA: barras ascendentes + línea de tendencia.
function paint(x, y, size) {
  const u = (v) => v * size;
  const inRect = (x0, y0, x1, y1) => x >= u(x0) && x < u(x1) && y >= u(y0) && y < u(y1);

  // Esquinas redondeadas solo en tamaños grandes; en 16/32 llenamos para legibilidad.
  if (size >= 48) {
    const r = u(0.2);
    const cx = Math.min(x, size - 1 - x);
    const cy = Math.min(y, size - 1 - y);
    if (cx < r && cy < r) {
      const dx = r - cx;
      const dy = r - cy;
      if (dx * dx + dy * dy > r * r) return [...BG, 0];
    }
  }

  // Barras (zona segura)
  const bars = [
    [0.26, 0.56, 0.4, 0.8],
    [0.44, 0.44, 0.58, 0.8],
    [0.62, 0.3, 0.76, 0.8],
  ];
  for (let i = 0; i < bars.length; i++) {
    const [x0, y0, x1, y1] = bars[i];
    if (inRect(x0, y0, x1, y1)) {
      return i === bars.length - 1 ? [...EMERALD, 255] : [...EMERALD_DARK, 255];
    }
  }

  // Línea de tendencia (más gruesa en tamaños pequeños)
  const lx0 = u(0.26);
  const ly0 = u(0.54);
  const lx1 = u(0.76);
  const ly1 = u(0.2);
  const vx = lx1 - lx0;
  const vy = ly1 - ly0;
  const len2 = vx * vx + vy * vy;
  const proj = ((x - lx0) * vx + (y - ly0) * vy) / len2;
  if (proj >= 0 && proj <= 1) {
    const px = lx0 + proj * vx;
    const py = ly0 + proj * vy;
    const thickness = (size <= 32 ? 0.06 : 0.035) * size;
    if (Math.hypot(x - px, y - py) <= thickness) return [...WHITE, 255];
  }

  return [...BG, 255];
}

// Empaqueta varias imágenes PNG en un único .ico (ICO con payloads PNG).
function makeIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type = icon
  header.writeUInt16LE(entries.length, 4);

  const dir = Buffer.alloc(16 * entries.length);
  let offset = 6 + dir.length;

  entries.forEach(({ size, png }, i) => {
    const o = i * 16;
    dir[o] = size >= 256 ? 0 : size; // width (0 => 256)
    dir[o + 1] = size >= 256 ? 0 : size; // height
    dir[o + 2] = 0; // colors
    dir[o + 3] = 0; // reserved
    dir.writeUInt16LE(1, o + 4); // planes
    dir.writeUInt16LE(32, o + 6); // bit count
    dir.writeUInt32LE(png.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += png.length;
  });

  return Buffer.concat([header, dir, ...entries.map((e) => e.png)]);
}

const sizes = [16, 32, 48, 64, 128, 256];
const entries = sizes.map((size) => ({ size, png: makePng(size, paint) }));
const ico = makeIco(entries);

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, ico);
console.log(`✓ favicon.ico (${sizes.join(", ")} px) · ${ico.length} bytes`);
