// Genera los iconos PNG de la PWA sin dependencias externas.
// Uso: node scripts/generate-icons.mjs
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "public", "icons");

const BG = [10, 10, 15]; // #0a0a0f
const EMERALD = [16, 185, 129]; // #10b981
const EMERALD_DARK = [5, 150, 105]; // #059669
const WHITE = [244, 244, 245];

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
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
  // filtro 0 por scanline
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// Dibuja un gráfico de barras ascendente + flecha dentro de la zona segura (80%).
function paintIcon(x, y, size) {
  const u = (v) => v * size; // coords relativas
  const inRect = (x0, y0, x1, y1) => x >= u(x0) && x < u(x1) && y >= u(y0) && y < u(y1);

  // Fondo redondeado (esquinas transparentes) con radio ~22%
  const r = u(0.22);
  const cx = Math.min(x, size - 1 - x);
  const cy = Math.min(y, size - 1 - y);
  if (cx < r && cy < r) {
    const dx = r - cx;
    const dy = r - cy;
    if (dx * dx + dy * dy > r * r) return [...BG, 0];
  }

  // Barras (zona segura, centradas)
  const bars = [
    [0.31, 0.56, 0.41, 0.78],
    [0.45, 0.44, 0.55, 0.78],
    [0.59, 0.30, 0.69, 0.78],
  ];
  for (let i = 0; i < bars.length; i++) {
    const [x0, y0, x1, y1] = bars[i];
    if (inRect(x0, y0, x1, y1)) {
      const [r0, g0, b0] = i === bars.length - 1 ? EMERALD : EMERALD_DARK;
      return [r0, g0, b0, 255];
    }
  }

  // Línea de tendencia ascendente (diagonal gruesa)
  const lx0 = u(0.30);
  const ly0 = u(0.52);
  const lx1 = u(0.70);
  const ly1 = u(0.22);
  const t = 0.028 * size;
  const vx = lx1 - lx0;
  const vy = ly1 - ly0;
  const len2 = vx * vx + vy * vy;
  const proj = ((x - lx0) * vx + (y - ly0) * vy) / len2;
  if (proj >= 0 && proj <= 1) {
    const px = lx0 + proj * vx;
    const py = ly0 + proj * vy;
    const dist = Math.hypot(x - px, y - py);
    if (dist <= t) return [...WHITE, 255];
  }

  return [...BG, 255];
}

mkdirSync(OUT_DIR, { recursive: true });
const targets = [
  ["icon-192x192.png", 192],
  ["icon-512x512.png", 512],
  ["apple-touch-icon.png", 180],
];
for (const [name, size] of targets) {
  writeFileSync(join(OUT_DIR, name), makePng(size, paintIcon));
  console.log("✓", name, `${size}x${size}`);
}
