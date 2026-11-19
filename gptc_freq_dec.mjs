import fs from 'node:fs';

const c = fs.readFileSync('app.01b56dbd.js', 'utf8');

// ---- 1) extrair o array a0_0x2490 ----
const key = 'a0_0x2490=function(){var _0x1cf74c=[';
const j = c.indexOf(key);
const start = c.indexOf('[', j);
let d = 0, q = null, i = start;
for (; i < c.length; i++) {
  const ch = c[i];
  if (q) { if (ch === q && c[i - 1] !== '\\') q = null; continue; }
  if (ch === "'" || ch === '"' || ch === '`') { q = ch; continue; }
  if (ch === '[') d++;
  else if (ch === ']') { d--; if (d === 0) break; }
}
const arr = Function('return ' + c.slice(start, i + 1))();
console.log('arr len', Array.isArray(arr) ? arr.length : 'NOT ARRAY');

// ---- 2) decoder a0_0x5dde:  _0x2379fe = _0x2379fe - 0x1f3; return arr[_0x2379fe]
const OFF = 0x1f3;
const dec = (hex) => arr[parseInt(hex, 16) - OFF];

// ---- 3) decodificar todas as strings usadas perto de 'frequencia'/'presenca'/'faltas' ----
const re = /_0x[0-9a-f]{4,6}\((0x[0-9a-f]+)\)/g;
const seen = new Set();
const out = [];
let mm;
while ((mm = re.exec(c))) {
  const h = mm[1];
  if (seen.has(h)) continue;
  seen.add(h);
  let s;
  try { s = dec(h); } catch { s = null; }
  if (typeof s === 'string') {
    const low = s.toLowerCase();
    if (/(presenca|presen|frequencia|frequ|falta|faltas|faltasbimestre|assiduidade|percentual)/.test(low)) {
      out.push(h + ' => ' + JSON.stringify(s));
    }
  }
}
console.log('decoded freq/presenca/falta-ish strings:');
console.log(out.join('\n'));
