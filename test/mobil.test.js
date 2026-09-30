/* QR-koden som sender folk vidare til mobilappen. Køyrast med `npm test`. */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const jsQR = require('jsqr');

const src = path.join(__dirname, '..', 'src');
const html = fs.readFileSync(path.join(src, 'index.html'), 'utf8');

// Taggen med denne id-en i index.html, og teksten som står i han.
function element(id) {
  const m = html.match(new RegExp(`<[^>]*\\sid="${id}"[^>]*>([^<]*)`));
  assert.ok(m, `fann ikkje #${id} i index.html`);
  return { tagg: m[0], tekst: m[1].trim() };
}

// Fila som bildet i dialogen viser, funne same vegen som appen finn ho.
function qrFil() {
  return path.join(src, element('mobilQr').tagg.match(/\ssrc="([^"]+)"/)[1]);
}

// Teiknar QR-koden ut som pikslar og les han med ein vanleg QR-lesar, slik
// kameraet på telefonen gjer. SVG-en kjem frå `qrcode` og er vassrette
// strekar: M og m flyttar, h teiknar så mange ruter bortover.
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

test('QR-koden i dialogen leier til nedlastingssida for mobilappen', () => {
  assert.equal(skann(qrFil()), 'https://thomashauge03.github.io/hauge-maskin-mobil/last-ned.html');
});

test('dialogen viser same adresse som QR-koden leier til', () => {
  assert.equal(element('mobilAdresse').tekst, skann(qrFil()));
});
