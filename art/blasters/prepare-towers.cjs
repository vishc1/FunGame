// Preserve the official coordinate export and supplement its missing block colours.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
execFileSync(process.execPath, ['tools/blasters-map.js', 'towers'], { cwd: root, stdio: 'inherit' });
const filename = path.join(__dirname, 'map-towers.json');
const data = JSON.parse(fs.readFileSync(filename, 'utf8'));
const map = require('../../public/games/blasters.shared.js').mapById('towers');
for (const b of data.boxes) {
  const source = map.boxes[b.i];
  if (source.t !== b.type) throw Error('Map index mismatch');
  if (source.c) b.color = source.c;
}
data.color_source = 'public/games/blasters.shared.js: mapById("towers").boxes[i].c (read only)';
fs.writeFileSync(filename, JSON.stringify(data, null, 2) + '\n');
console.log('Added original map colours to', data.boxes.filter(b => b.color).length, 'boxes');
