// SinCraft Game Server - WebSocket multiplayer for LAN / Tailscale

const PORT = parseInt(process.env.PORT || '3003');

interface Player {
  id: string;
  name: string;
  color: string;
  x: number; y: number; z: number;
  yaw: number; pitch: number;
}

const players = new Map<string, { data: Player; ws: any }>();
let worldData: string | null = null;
let worldSize = { w: 32, h: 24, d: 32 };

function broadcast(msg: object, excludeId?: string) {
  const data = JSON.stringify(msg);
  players.forEach((p) => {
    if (p.ws.readyState === 1 && p.data.id !== excludeId) {
      p.ws.send(data);
    }
  });
}

function send(ws: any, msg: object) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}

const server = Bun.serve({
  port: PORT,
  fetch(req, server) {
    const success = server.upgradeWebSocket(req);
    if (success) return undefined;
    return new Response("SinCraft Game Server", { status: 200 });
  },
  websocket: {
    open(ws) {
      const id = crypto.randomUUID?.().slice(0, 8) || Math.random().toString(36).slice(2, 10);
      const player: Player = { id, name: 'Player', color: '#e74c3c', x: 16, y: 20, z: 16, yaw: 0, pitch: 0 };
      players.set(id, { data: player, ws });

      // Send existing world if host already sent it
      if (worldData) {
        send(ws, { t: 'world', data: worldData, w: worldSize.w, h: worldSize.h, d: worldSize.d });
      }

      // Send player list
      const list = Array.from(players.values()).map(p => p.data);
      send(ws, { t: 'players', players: list });

      // Notify others
      broadcast({ t: 'player_join', id: player.id, name: player.name, color: player.color }, id);
      console.log(`[+] Player ${id} connected (${players.size} total)`);
    },

    message(ws, message) {
      try {
        const msg = JSON.parse(message.toString());

        // Find player by ws
        let playerEntry: { data: Player; ws: any } | undefined;
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
    },

    close(ws) {
      let playerId: string | undefined;
      let playerName = 'Player';
      for (const [id, entry] of players) {
        if (entry.ws === ws) { playerId = id; playerName = entry.data.name; break; }
      }
      if (playerId) {
        players.delete(playerId);
        broadcast({ t: 'player_leave', id: playerId, name: playerName });
        console.log(`[-] Player ${playerId} disconnected (${players.size} total)`);
      }
    },
  },
});

console.log(`SinCraft Game Server running on ws://0.0.0.0:${PORT}`);
