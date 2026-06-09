// ==========================================
// SinCraft Game Server - Node.js WebSocket
// ==========================================
// Standalone Node.js version of the game server for Electron.
// Equivalent to the Bun server in mini-services/game-server/index.ts

const WebSocket = require('ws');
const http = require('http');

const PORT = parseInt(process.env.PORT || '3003', 10);

// Player object structure
// { id, name, color, x, y, z, yaw, pitch }

const players = new Map();
let worldData = null;
let worldSize = { w: 32, h: 24, d: 32 };

function broadcast(msg, excludeId) {
  const data = JSON.stringify(msg);
  players.forEach((entry) => {
    if (entry.ws.readyState === 1 && entry.data.id !== excludeId) {
      entry.ws.send(data);
    }
  });
}

function send(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('SinCraft Game Server');
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  const id = Math.random().toString(36).slice(2, 10);
  const player = {
    id,
    name: 'Player',
    color: '#e74c3c',
    x: 16, y: 20, z: 16,
    yaw: 0, pitch: 0,
  };
  players.set(id, { data: player, ws });

  // Send existing world if host already sent it
  if (worldData) {
    send(ws, { t: 'world', data: worldData, w: worldSize.w, h: worldSize.h, d: worldSize.d });
  }

  // Send player list
  const list = Array.from(players.values()).map((p) => p.data);
  send(ws, { t: 'players', players: list });

  // Notify others
  broadcast({ t: 'player_join', id: player.id, name: player.name, color: player.color }, id);
  console.log(`[+] Player ${id} connected (${players.size} total)`);

  ws.on('message', (message) => {
    try {
      const msg = JSON.parse(message.toString());

      // Find player by ws
      let playerEntry;
      for (const [, entry] of players) {
        if (entry.ws === ws) { playerEntry = entry; break; }
      }
      if (!playerEntry) return;
      const p = playerEntry.data;

      switch (msg.t) {
        case 'join':
          p.name = msg.name || 'Player';
          p.color = msg.color || '#e74c3c';
          broadcast({ t: 'player_join', id: p.id, name: p.name, color: p.color }, p.id);
          break;

        case 'world':
          worldData = msg.data;
          worldSize = { w: msg.w, h: msg.h, d: msg.d };
          console.log(`[W] World data received (${worldSize.w}x${worldSize.h}x${worldSize.d})`);
          break;

        case 'block':
          broadcast({ t: 'block', x: msg.x, y: msg.y, z: msg.z, type: msg.type, from: p.id }, p.id);
          break;

        case 'pos':
          p.x = msg.x; p.y = msg.y; p.z = msg.z; p.yaw = msg.yaw; p.pitch = msg.pitch;
          broadcast({ t: 'pos', id: p.id, x: msg.x, y: msg.y, z: msg.z, yaw: msg.yaw, pitch: msg.pitch }, p.id);
          break;

        case 'chat':
          broadcast({ t: 'chat', name: p.name, msg: msg.msg });
          break;
      }
    } catch (e) {
      // ignore parse errors
    }
  });

  ws.on('close', () => {
    let playerId;
    let playerName = 'Player';
    for (const [id, entry] of players) {
      if (entry.ws === ws) { playerId = id; playerName = entry.data.name; break; }
    }
    if (playerId) {
      players.delete(playerId);
      broadcast({ t: 'player_leave', id: playerId, name: playerName });
      console.log(`[-] Player ${playerId} disconnected (${players.size} total)`);
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`SinCraft Game Server running on ws://0.0.0.0:${PORT}`);
});
