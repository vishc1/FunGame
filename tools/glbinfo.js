// Dev helper: prints node names, transforms and mesh bounds from .glb files. Usage: node tools/glbinfo.js public/models/kart_0.glb [filter]
const fs = require('fs');
const [file, filter] = process.argv.slice(2);
const buf = fs.readFileSync(file); const len = buf.readUInt32LE(12); const json = JSON.parse(buf.slice(20, 20 + len).toString());
const r = (a) => a ? a.map((v) => +v.toFixed(2)).join(',') : '-';
for (const n of json.nodes || []) {
  if (filter && !new RegExp(filter, 'i').test(n.name || '')) continue;
  let b = '';
  if (n.mesh != null) { let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; for (const p of json.meshes[n.mesh].primitives) { const a = json.accessors[p.attributes.POSITION]; for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], a.min[i]); mx[i] = Math.max(mx[i], a.max[i]); } } b = ` size=${r(mx.map((v, i) => v - mn[i]))} center=${r(mx.map((v, i) => (v + mn[i]) / 2))}`; }
  console.log(`${(n.name || '?').padEnd(22)} t=${r(n.translation)} rot=${r(n.rotation)} s=${r(n.scale)}${b}${n.children ? ' children=' + n.children.length : ''}`);
}
console.log('materials:', (json.materials || []).map((m) => m.name + (m.pbrMetallicRoughness && m.pbrMetallicRoughness.baseColorFactor ? '(' + r(m.pbrMetallicRoughness.baseColorFactor) + ')' : '') + (m.alphaMode ? '[' + m.alphaMode + ']' : '') + (m.emissiveFactor ? '{e:' + r(m.emissiveFactor) + '}' : '')).join('  '));
