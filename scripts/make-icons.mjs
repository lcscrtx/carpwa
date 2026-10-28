// Gera os PNGs do ícone (o iPhone não aceita SVG em apple-touch-icon).
// Desenha o mesmo volante de icons/icon.svg, sem dependências. Uso: npm run icons
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const SS = 4; // supersampling para bordas suaves

function inside(x, y) {
  // Coordenadas no espaço 0..512 do SVG.
  const dx = x - 256, dy = y - 256, d = Math.hypot(dx, dy);
  if (Math.abs(d - 150) <= 20) return true; // aro
  if (d <= 36) return true; // centro
  const seg = (ax, ay, bx, by) => {
    const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)));
    return Math.hypot(x - (ax + t * (bx - ax)), y - (ay + t * (by - ay))) <= 20;
  };
  return seg(116, 240, 396, 240) || seg(256, 292, 256, 406);
}

function render(size) {
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let py = 0; py < size; py++) {
    const row = py * (size * 3 + 1);
    raw[row] = 0;
    const t = py / (size - 1);
    const bg = [0x4a + (0x0a - 0x4a) * t, 0xa8 + (0x5c - 0xa8) * t, 0xff + (0xe0 - 0xff) * t];
    for (let px = 0; px < size; px++) {
      let hits = 0;
      for (let sy = 0; sy < SS; sy++)
        for (let sx = 0; sx < SS; sx++)
          if (inside(((px + (sx + 0.5) / SS) / size) * 512, ((py + (sy + 0.5) / SS) / size) * 512)) hits++;
      const a = hits / (SS * SS);
      const o = row + 1 + px * 3;
      for (let c = 0; c < 3; c++) raw[o + c] = Math.round(bg[c] * (1 - a) + 255 * a);
    }
  }
  return png(size, raw);
}

function png(size, raw) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // 8 bits
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const out = new URL('../icons/', import.meta.url);
mkdirSync(out, { recursive: true });
for (const size of [180, 192, 512]) {
  writeFileSync(new URL(`icon-${size}.png`, out), render(size));
  console.log(`icons/icon-${size}.png`);
}
