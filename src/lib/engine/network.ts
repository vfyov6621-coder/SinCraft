// ==========================================
// Network Client - WebSocket multiplayer
// ==========================================

export interface RemotePlayer {
  id: string;
  name: string;
  color: string;
  x: number; y: number; z: number;
  yaw: number; pitch: number;
}

export interface NetCallbacks {
  onWorldData: (data: string, w: number, h: number, d: number) => void;
  onBlockSet: (x: number, y: number, z: number, type: number) => void;
  onPlayerJoin: (id: string, name: string, color: string) => void;
  onPlayerLeave: (id: string) => void;
  onPlayerPos: (id: string, x: number, y: number, z: number, yaw: number, pitch: number) => void;
  onPlayersList: (players: RemotePlayer[]) => void;
  onChat: (name: string, msg: string) => void;
}

export class GameNetwork {
  private ws: WebSocket | null = null;
  private connected = false;
  public remotePlayers: Map<string, RemotePlayer> = new Map();
  private callbacks: NetCallbacks;
  private posTimer: ReturnType<typeof setInterval> | null = null;
  private lastPos = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };

  constructor(
    private playerId: string,
    private playerName: string,
    private playerColor: string,
    callbacks: Partial<NetCallbacks>,
  ) {
    this.callbacks = {
      onWorldData: () => {},
      onBlockSet: () => {},
      onPlayerJoin: () => {},
      onPlayerLeave: () => {},
      onPlayerPos: () => {},
      onPlayersList: () => {},
      onChat: () => {},
      ...callbacks,
    };
  }

  connect(port: number = 3003, directHost?: string) {
    let url: string;
    if (directHost) {
      // Direct connection (Tailscale IP or LAN IP)
      url = `ws://${directHost}:${port}`;
    } else {
      // Reverse proxy via Caddy
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      url = `${protocol}//${location.host}/?XTransformPort=${port}`;
    }
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.connected = true;
      this.send({ t: 'join', name: this.playerName, color: this.playerColor });
    };

    this.ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        this.handleMessage(msg);
      } catch {}
    };

    this.ws.onclose = () => {
      this.connected = false;
    };

    // Position sync every 100ms
    this.posTimer = setInterval(() => {
      if (this.connected && this.ws?.readyState === 1) {
        // Position is sent from game loop via updatePosition
      }
    }, 100);
  }

  private handleMessage(msg: any) {
    switch (msg.t) {
      case 'world':
        this.callbacks.onWorldData(msg.data, msg.w, msg.h, msg.d);
        break;
      case 'block':
        this.callbacks.onBlockSet(msg.x, msg.y, msg.z, msg.type);
        break;
      case 'player_join':
        this.remotePlayers.set(msg.id, { id: msg.id, name: msg.name, color: msg.color, x: 16, y: 20, z: 16, yaw: 0, pitch: 0 });
        this.callbacks.onPlayerJoin(msg.id, msg.name, msg.color);
        break;
      case 'player_leave':
        this.remotePlayers.delete(msg.id);
        this.callbacks.onPlayerLeave(msg.id);
        break;
      case 'pos':
        const p = this.remotePlayers.get(msg.id);
        if (p) { p.x = msg.x; p.y = msg.y; p.z = msg.z; p.yaw = msg.yaw; p.pitch = msg.pitch; }
        this.callbacks.onPlayerPos(msg.id, msg.x, msg.y, msg.z, msg.yaw, msg.pitch);
        break;
      case 'players':
        for (const pl of msg.players) {
          this.remotePlayers.set(pl.id, pl);
        }
        this.callbacks.onPlayersList(msg.players);
        break;
      case 'chat':
        this.callbacks.onChat(msg.name, msg.msg);
        break;
    }
  }

  sendBlock(x: number, y: number, z: number, type: number) {
    this.send({ t: 'block', x, y, z, type });
  }

  sendPosition(x: number, y: number, z: number, yaw: number, pitch: number) {
    // Throttle: only send if moved enough
    const dx = x - this.lastPos.x; const dy = y - this.lastPos.y; const dz = z - this.lastPos.z;
    if (dx * dx + dy * dy + dz * dz < 0.01 && Math.abs(yaw - this.lastPos.yaw) < 0.01) return;
    this.lastPos = { x, y, z, yaw, pitch };
    this.send({ t: 'pos', x, y, z, yaw, pitch });
  }

  sendWorld(data: string, w: number, h: number, d: number) {
    this.send({ t: 'world', data, w, h, d });
  }

  private send(msg: any) {
    if (this.ws && this.ws.readyState === 1) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  get isConnected() { return this.connected; }

  disconnect() {
    if (this.posTimer) clearInterval(this.posTimer);
    if (this.ws) { this.ws.close(); this.ws = null; }
    this.connected = false;
    this.remotePlayers.clear();
  }
}
