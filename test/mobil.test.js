/* QR-koden som sender folk videre til mobilappen. Kjøres med `npm test`. */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const jsQR = require('jsqr');

const src = path.join(__dirname, '..', 'src');
const html = fs.readFileSync(path.join(src, 'index.html'), 'utf8');

// Taggen med denne id-en i index.html, og teksten som står i den.
function element(id) {
  const m = html.match(new RegExp(`<[^>]*\\sid="${id}"[^>]*>([^<]*)`));
  assert.ok(m, `fant ikke #${id} i index.html`);
  return { tagg: m[0], tekst: m[1].trim() };
}

// Filen som bildet i dialogen viser, funnet på samme måte som appen finner den.
function qrFil() {
  return path.join(src, element('mobilQr').tagg.match(/\ssrc="([^"]+)"/)[1]);
}

// Tegner QR-koden ut som piksler og leser den med en vanlig QR-leser, slik
// kameraet på telefonen gjør. SVG-en kommer fra `qrcode` og består av
// vannrette streker: M og m flytter, h tegner så mange ruter bortover.
function skann(fil) {
  const svg = fs.readFileSync(fil, 'utf8');
  const [, b, h] = svg.match(/viewBox="0 0 (\d+) (\d+)"/).map(Number);
  const d = svg.match(/<path stroke="#000000" d="([^"]+)"/)[1];
  const skala = 6;
  const w = b * skala;
  const px = new Uint8ClampedArray(w * h * skala * 4).fill(255);
  let x = 0;
  let y = 0;
  for (const [, kmd, a, c] of d.matchAll(/([Mmh])([\d.]+)(?: ([\d.]+))?/g)) {
    if (kmd === 'M') { x = +a; y = +c; continue; }
    if (kmd === 'm') { x += +a; y += +c; continue; }
    const rad = Math.floor(y) * skala;
    for (let py = rad; py < rad + skala; py++) {
      for (let pxX = x * skala; pxX < (x + +a) * skala; pxX++) {
        const i = (py * w + pxX) * 4;
        px.fill(0, i, i + 3);
      }
    }
    x += +a;
  }
  return jsQR(px, w, h * skala)?.data;
}

// haugemaskin.vercel.app, ikke haugemaskin.no: domenet er ikke koblet til
// Vercel ennå, og sertifikatet der gikk ut i 2025.
test('QR-koden i dialogen leder til app-siden på nettsiden', () => {
  assert.equal(skann(qrFil()), 'https://haugemaskin.vercel.app/app');
});

test('dialogen viser samme adresse som QR-koden leder til', () => {
  assert.equal(element('mobilAdresse').tekst, skann(qrFil()));
});
