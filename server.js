// FriendGame server: rooms, lobby, and the game loop. Each game lives in server/games/*.js
const path = require('path');
const fs = require('fs');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
app.use(require('compression')()); // gzip: the 3D library is ~1.5 MB uncompressed, which matters when friends load it over the internet
app.use(express.static(path.join(__dirname, 'public')));
app.use('/vendor/addons', express.static(path.join(__dirname, 'node_modules/three/examples/jsm')));
app.get('/favicon.ico', (req, res) => res.status(204).end());
// Lists the 3D models dropped into public/models (GLB files from Blender). The 3D games use this to decide
// which assets exist and fall back to procedural placeholders for the rest.
app.get('/models/list', (req, res) => {
  const dir = path.join(__dirname, 'public/models');
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => /\.(glb|gltf)$/i.test(f)); } catch (e) { /* folder not readable here */ }
  if (!files.length) { try { files = require('./server/models.json'); } catch (e) { /* no manifest */ } } // serverless hosts: use the list written at build time
  res.json(files);
});

// ---- games ----------------------------------------------------------------
// Locally we list the folder, so dropping a new file into server/games/ is enough. Where the folder cannot be listed
// (serverless hosts), fall back to the generated registry, whose static requires also tell the bundler what to include.
let gameModules;
try { gameModules = fs.readdirSync(path.join(__dirname, 'server/games')).filter((f) => f.endsWith('.js')).sort().map((f) => require('./server/games/' + f)); }
catch (e) { gameModules = require('./server/registry'); }

// ---- rooms and games: all of that lives in server/hub.js ---------------------
const hub = require('./server/hub')(io, {
  games: gameModules,
  randomHex: (n) => crypto.randomBytes(n).toString('hex'),
  graceMs: Number(process.env.REJOIN_GRACE_MS || 20000), // how long a disconnected player keeps their seat
});

const PORT = process.env.PORT || 3000;
// Run directly (npm start, node server.js): listen on a port. Imported by a host such as Vercel: it takes the exported
// HTTP server and manages the listening itself.
if (require.main === module) server.listen(PORT, () => console.log(`FriendGame running on http://localhost:${PORT}  (${hub.games.length} games loaded)`));
module.exports = server;
