// ==========================================
// LiteCraft Engine - Optimized game loop
// Directional rendering, FPS cap, crash protection
// ==========================================

import { Renderer, MeshData } from './renderer';
import { VoxelWorld, WorldSettings } from './world';
import { PlayerPhysics } from './physics';
import { raycast, RayHit } from './raycast';
import { Mat4, mat4Perspective, mat4LookAt, mat4Multiply, extractFrustumPlanes, isAABBVisible } from './math';
import { BlockType, HOTBAR_BLOCKS } from './blocks';
import { CHUNK_SIZE } from './chunk';
import { GameNetwork, RemotePlayer } from './network';

export interface GameCallbacks {
  onStatsUpdate: (stats: GameStats) => void;
  onPause: () => void;
  onRemotePlayersUpdate: (players: RemotePlayer[]) => void;
  onSlotChange: (slot: number) => void;
}

export interface GameStats {
  fps: number;
  triangles: number;
  drawCalls: number;
  chunksVisible: number;
  chunksTotal: number;
  res: string;
}

export class Game {
  renderer!: Renderer;
  world!: VoxelWorld;
  player!: PlayerPhysics;
  network: GameNetwork | null = null;

  // Chunk mesh storage
  private chunkMeshes: Map<string, MeshData> = new Map();

  private animFrame = 0;
  private lastTime = 0;
  private fpsFrames = 0;
  private fpsTime = 0;
  private currentFps = 0;
  private running = false;
  private paused = false;
  private resolutionScale = 0.75;
  private errorCount = 0;
  private maxErrors = 10;

  // Render settings
  renderDistance = 8;
  maxFps = 0; // 0 = unlimited (vsync)
  directionalRendering = true; // only render chunks in view cone

  // FPS cap timing
  private lastRenderTime = 0;
  private minFrameInterval = 0; // ms between frames (0 = no cap)

  // Dirty chunk rebuild limit (prevents freeze on mass changes)
  private maxChunkRebuildsPerFrame = 4;
  private pendingDirtyChunks: { cx: number; cz: number }[] = [];

  selectedSlot = 0;
  targetBlock: RayHit | null = null;
  callbacks: GameCallbacks;

  // WebGL context loss handling
  private contextLost = false;

  get settings(): WorldSettings { return this.world.settings; }

  constructor(private canvas: HTMLCanvasElement, private config: { resolutionScale?: number; renderDistance?: number; maxFps?: number }) {
    this.resolutionScale = config.resolutionScale ?? 0.75;
    this.renderDistance = config.renderDistance ?? 8;
    this.maxFps = config.maxFps ?? 0;
    if (this.maxFps > 0) this.minFrameInterval = 1000 / this.maxFps;
    this.callbacks = {
      onStatsUpdate: () => {},
      onPause: () => {},
      onRemotePlayersUpdate: () => {},
      onSlotChange: () => {},
    };
  }

  init(settings: WorldSettings, savedChunks?: Map<string, string>, savedPlayer?: { x: number; y: number; z: number; yaw: number }) {
    this.renderer = new Renderer(this.canvas);
    this.world = new VoxelWorld(settings);

    // Handle WebGL context loss
    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.contextLost = true;
      console.warn('WebGL context lost - pausing game');
      this.togglePause();
    });
    this.canvas.addEventListener('webglcontextrestored', () => {
      this.contextLost = false;
      console.log('WebGL context restored - rebuilding meshes');
      try {
        this.renderer = new Renderer(this.canvas);
        this.rebuildAllChunkMeshes();
        this.updateFog();
      } catch (err) {
        console.error('Failed to restore WebGL:', err);
      }
    });

    // Generate or load terrain
    this.world.generateAll();
    if (savedChunks) {
      this.world.deserializeChunks(savedChunks);
    }

    this.player = new PlayerPhysics();

    if (savedPlayer) {
      this.player.x = savedPlayer.x;
      this.player.y = savedPlayer.y;
      this.player.z = savedPlayer.z;
      this.player.yaw = savedPlayer.yaw || 0;
    } else {
      const spawn = this.world.findSpawnPoint();
      this.player.x = spawn.x;
      this.player.y = spawn.y;
      this.player.z = spawn.z;
    }

    // Build initial chunk meshes
    this.rebuildAllChunkMeshes();

    // Set fog based on render distance
    this.updateFog();

    this.handleResize();
    this.setupInput();
    window.addEventListener('resize', this.handleResize);
    this.start();
  }

  private updateFog(): void {
    const fogFar = this.renderDistance * CHUNK_SIZE;
    this.renderer.fogFar = fogFar;
    this.renderer.fogNear = fogFar * 0.35;
  }

  private handleResize = () => {
    const parent = this.canvas.parentElement;
    if (parent && parent.clientWidth > 0 && parent.clientHeight > 0) {
      this.renderer.resizeWithScale(parent.clientWidth, parent.clientHeight, this.resolutionScale);
    }
  };

  setResolutionScale(s: number) { this.resolutionScale = s; this.handleResize(); }
  setRenderDistance(d: number) { this.renderDistance = Math.max(2, Math.min(50, d)); this.updateFog(); }
  setMaxFps(fps: number) {
    this.maxFps = fps;
    this.minFrameInterval = fps > 0 ? 1000 / fps : 0;
  }

  get selectedBlockType(): BlockType { return HOTBAR_BLOCKS[this.selectedSlot] ?? BlockType.Stone; }

  // --- Chunk Mesh Management ---

  private rebuildAllChunkMeshes(): void {
    // Delete all existing meshes
    for (const mesh of this.chunkMeshes.values()) {
      this.renderer.deleteMesh(mesh);
    }
    this.chunkMeshes.clear();
    this.pendingDirtyChunks = [];

    // Build meshes for all non-empty chunks (in batches to avoid freeze)
    const chunksToBuild: { cx: number; cz: number }[] = [];
    for (const [, chunk] of this.world.chunks) {
      if (!chunk.isEmpty()) {
        chunksToBuild.push({ cx: chunk.cx, cz: chunk.cz });
      }
    }

    // Build all upfront (needed for initial load)
    for (const { cx, cz } of chunksToBuild) {
      try {
        const key = `${cx},${cz}`;
        const data = this.world.buildChunkMesh(cx, cz);
        if (data) {
          this.chunkMeshes.set(key, this.renderer.createMesh(data.vertices, data.normals, data.colors, data.indices));
        }
      } catch (err) {
        console.error(`Failed to build mesh for chunk ${cx},${cz}:`, err);
      }
    }
  }

  private rebuildDirtyChunks(): void {
    // Collect new dirty chunks
    const newDirty = this.world.getAndClearDirtyChunks();
    for (const chunk of newDirty) {
      this.pendingDirtyChunks.push({ cx: chunk.cx, cz: chunk.cz });
    }

    // Build limited number per frame to prevent freezes
    const maxBuild = this.maxChunkRebuildsPerFrame;
    let built = 0;
    const remaining: { cx: number; cz: number }[] = [];

    for (const { cx, cz } of this.pendingDirtyChunks) {
      if (built >= maxBuild) {
        remaining.push({ cx, cz });
        continue;
      }
      try {
        const key = `${cx},${cz}`;
        const oldMesh = this.chunkMeshes.get(key);
        if (oldMesh) {
          this.renderer.deleteMesh(oldMesh);
          this.chunkMeshes.delete(key);
        }
        const data = this.world.buildChunkMesh(cx, cz);
        if (data) {
          this.chunkMeshes.set(key, this.renderer.createMesh(data.vertices, data.normals, data.colors, data.indices));
        }
        built++;
      } catch (err) {
        console.error(`Failed to rebuild chunk ${cx},${cz}:`, err);
        remaining.push({ cx, cz });
      }
    }

    this.pendingDirtyChunks = remaining;
  }

  // --- Save data ---
  getSaveData() {
    return {
      blocks: this.world.serializeChunks(),
      playerX: this.player.x, playerY: this.player.y, playerZ: this.player.z,
      playerYaw: this.player.yaw,
    };
  }

  // --- Network ---
  startNetwork(playerId: string, playerName: string, playerColor: string, port?: number) {
    this.network = new GameNetwork(playerId, playerName, playerColor, {
      onWorldData: (data, w, h, d) => {
        this.world.deserializeChunks(new Map(Object.entries(data)));
        this.rebuildDirtyChunks();
      },
      onBlockSet: (x, y, z, type) => {
        this.world.setBlock(x, y, z, type as BlockType);
        this.rebuildDirtyChunks();
      },
      onPlayerJoin: () => {},
      onPlayerLeave: () => {},
      onPlayerPos: () => {},
      onPlayersList: () => {},
      onChat: () => {},
    });
    this.network.connect(port);
  }

  hostNetwork(playerId: string, playerName: string, playerColor: string, port?: number) {
    this.startNetwork(playerId, playerName, playerColor, port);
    setTimeout(() => {
      if (this.network?.isConnected) {
        const chunks = this.world.serializeChunks();
        const obj: Record<string, string> = {};
        chunks.forEach((v, k) => obj[k] = v);
        this.network.sendWorld(obj, this.world.worldWidth, this.world.worldHeight, this.world.worldDepth);
      }
    }, 500);
  }

  stopNetwork() {
    if (this.network) { this.network.disconnect(); this.network = null; }
  }

  // --- Block interaction ---
  removeBlock() {
    if (!this.targetBlock) return;
    const { x, y, z } = this.targetBlock;
    this.world.setBlock(x, y, z, BlockType.Air);
    this.rebuildDirtyChunks();
    if (this.network?.isConnected) this.network.sendBlock(x, y, z, 0);
  }

  placeBlock() {
    if (!this.targetBlock) return;
    const { placeX, placeY, placeZ } = this.targetBlock;
    if (!this.world.inBounds(placeX, placeY, placeZ)) return;
    if (this.world.isSolid(placeX, placeY, placeZ)) return;

    const p = this.player; const hw = p.width; const h = p.height;
    if (p.x + hw > placeX && p.x - hw < placeX + 1 &&
        p.y + h > placeY && p.y < placeY + 1 &&
        p.z + hw > placeZ && p.z - hw < placeZ + 1) return;

    this.world.setBlock(placeX, placeY, placeZ, this.selectedBlockType);
    this.rebuildDirtyChunks();
    if (this.network?.isConnected) this.network.sendBlock(placeX, placeY, placeZ, this.selectedBlockType);
  }

  // --- Input ---
  private setupInput() {
    document.addEventListener('keydown', this.onKeyDown);
    document.addEventListener('keyup', this.onKeyUp);
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('mousedown', this.onMouseDown);
    document.addEventListener('wheel', this.onWheel);
    this.canvas.addEventListener('click', this.onCanvasClick);
    this.canvas.addEventListener('contextmenu', this.onCanvasContextMenu);
  }

  private onCanvasClick = () => { if (!this.paused && !this.contextLost) this.canvas.requestPointerLock(); };
  private onCanvasContextMenu = (e: Event) => e.preventDefault();

  private onKeyDown = (e: KeyboardEvent) => {
    if (this.paused) return;
    switch (e.code) {
      case 'KeyW': case 'ArrowUp': this.player.moveForward = true; break;
      case 'KeyS': case 'ArrowDown': this.player.moveBackward = true; break;
      case 'KeyA': case 'ArrowLeft': this.player.moveLeft = true; break;
      case 'KeyD': case 'ArrowRight': this.player.moveRight = true; break;
      case 'Space': this.player.wantJump = true; e.preventDefault(); break;
      case 'Digit1': case 'Digit2': case 'Digit3': case 'Digit4': case 'Digit5':
      case 'Digit6': case 'Digit7': case 'Digit8': case 'Digit9':
        this.selectedSlot = parseInt(e.code.charAt(5)) - 1;
        this.callbacks.onSlotChange(this.selectedSlot); break;
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    switch (e.code) {
      case 'KeyW': case 'ArrowUp': this.player.moveForward = false; break;
      case 'KeyS': case 'ArrowDown': this.player.moveBackward = false; break;
      case 'KeyA': case 'ArrowLeft': this.player.moveLeft = false; break;
      case 'KeyD': case 'ArrowRight': this.player.moveRight = false; break;
      case 'Space': this.player.wantJump = false; break;
    }
  };

  private onMouseMove = (e: MouseEvent) => {
    if (document.pointerLockElement !== this.canvas || this.paused) return;
    this.player.yaw += e.movementX * 0.002;
    this.player.pitch -= e.movementY * 0.002;
    this.player.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.player.pitch));
  };

  private onMouseDown = (e: MouseEvent) => {
    if (document.pointerLockElement !== this.canvas || this.paused) return;
    if (e.button === 0) this.removeBlock();
    if (e.button === 2) this.placeBlock();
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    if (this.paused) return;
    if (e.deltaY > 0) this.selectedSlot = (this.selectedSlot + 1) % HOTBAR_BLOCKS.length;
    else this.selectedSlot = (this.selectedSlot - 1 + HOTBAR_BLOCKS.length) % HOTBAR_BLOCKS.length;
    this.callbacks.onSlotChange(this.selectedSlot);
  };

  private detachInput() {
    document.removeEventListener('keydown', this.onKeyDown);
    document.removeEventListener('keyup', this.onKeyUp);
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('mousedown', this.onMouseDown);
    document.removeEventListener('wheel', this.onWheel);
    this.canvas.removeEventListener('click', this.onCanvasClick);
    this.canvas.removeEventListener('contextmenu', this.onCanvasContextMenu);
  }

  togglePause() {
    this.paused = !this.paused;
    if (this.paused) {
      document.exitPointerLock();
      this.callbacks.onPause();
    }
  }

  // --- Game loop ---
  start() {
    this.running = true; this.lastTime = performance.now(); this.lastRenderTime = 0;
    this.errorCount = 0;
    this.loop();
  }

  stop() {
    this.running = false; cancelAnimationFrame(this.animFrame); this.detachInput();
  }

  private loop = () => {
    if (!this.running) return;
    this.animFrame = requestAnimationFrame(this.loop);

    try {
      const now = performance.now();
      const dt = Math.min((now - this.lastTime) / 1000, 0.1);
      this.lastTime = now;

      // FPS counter (always counts, even if we skip rendering)
      this.fpsFrames++; this.fpsTime += dt;
      if (this.fpsTime >= 0.5) { this.currentFps = Math.round(this.fpsFrames / this.fpsTime); this.fpsFrames = 0; this.fpsTime = 0; }

      // Physics and input always run (no FPS cap for logic)
      this.rebuildDirtyChunks();

      if (!this.paused && !this.contextLost) {
        this.player.update(dt, this.world);

        const eye = this.player.getEyePos();
        const dir = this.player.getLookDir();
        this.targetBlock = raycast(this.world, eye[0], eye[1], eye[2], dir[0], dir[1], dir[2], 7);

        if (this.network?.isConnected) {
          this.network.sendPosition(this.player.x, this.player.y, this.player.z, this.player.yaw, this.player.pitch);
        }
      }

      // FPS cap: skip rendering if not enough time passed
      if (this.minFrameInterval > 0) {
        const elapsed = now - this.lastRenderTime;
        if (elapsed < this.minFrameInterval) return;
        this.lastRenderTime = now - (elapsed % this.minFrameInterval);
      }

      // --- Render ---
      if (this.contextLost) return;

      const w = this.canvas.width;
      const h = this.canvas.height;
      if (w === 0 || h === 0) return;

      const aspect = w / h;
      const fogFar = this.renderDistance * CHUNK_SIZE + 20;
      const proj = mat4Perspective(Math.PI / 3, aspect, 0.05, fogFar);
      const eyePos: [number, number, number] = [this.player.x, this.player.y + this.player.eyeHeight, this.player.z];
      const fwd: [number, number, number] = this.player.getLookDir();
      const tgt: [number, number, number] = [eyePos[0] + fwd[0], eyePos[1] + fwd[1], eyePos[2] + fwd[2]];
      const view = mat4LookAt(eyePos, tgt, [0, 1, 0]);
      this.renderer.projectionMatrix = proj;
      this.renderer.viewMatrix = view;
      this.renderer.cameraPos = eyePos;

      // Compute frustum planes for culling
      const vp = mat4Multiply(proj, view);
      const frustum = extractFrustumPlanes(vp);

      // Begin rendering
      this.renderer.beginFrame();

      // Render visible chunks with directional culling
      let chunksVisible = 0;
      const playerCX = (this.player.x / CHUNK_SIZE) | 0;
      const playerCZ = (this.player.z / CHUNK_SIZE) | 0;
      const rd = this.renderDistance;
      const rdSq = rd * rd;
      const halfH = this.world.worldHeight / 2;
      const playerYaw = this.player.yaw;

      for (const [key, mesh] of this.chunkMeshes) {
        const comma = key.indexOf(',');
        const cx = parseInt(key.substring(0, comma));
        const cz = parseInt(key.substring(comma + 1));

        // Distance check (circular)
        const dx = cx - playerCX;
        const dz = cz - playerCZ;
        if (dx * dx + dz * dz > rdSq) continue;

        // Directional culling: skip chunks behind the player
        if (this.directionalRendering) {
          const angleToChunk = Math.atan2(dx, -dz);
          let angleDiff = angleToChunk - playerYaw;
          // Normalize to [-PI, PI]
          if (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
          if (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
          // ~130 degrees from center = skip (render ~260 degree arc)
          if (Math.abs(angleDiff) > 2.27) continue;
        }

        // Frustum culling
        const chunkCenterX = cx * CHUNK_SIZE + CHUNK_SIZE / 2;
        const chunkCenterZ = cz * CHUNK_SIZE + CHUNK_SIZE / 2;
        const halfSize = CHUNK_SIZE / 2;
        if (!isAABBVisible(chunkCenterX, halfH, chunkCenterZ, halfSize, halfH, halfSize, frustum)) continue;

        this.renderer.renderMesh(mesh);
        chunksVisible++;
      }

      // Draw block highlight
      if (this.targetBlock) {
        this.renderer.renderHighlight({
          x: this.targetBlock.x, y: this.targetBlock.y, z: this.targetBlock.z,
        });
      }

      // Update stats
      this.callbacks.onStatsUpdate({
        fps: this.currentFps,
        triangles: this.renderer.totalTriangles,
        drawCalls: this.renderer.drawCalls,
        chunksVisible,
        chunksTotal: this.world.chunks.size,
        res: `${w}x${h}`,
      });
      if (this.network) this.callbacks.onRemotePlayersUpdate(Array.from(this.network.remotePlayers.values()));

      // Reset error counter on successful frame
      this.errorCount = 0;

    } catch (err) {
      console.error('Game loop error:', err);
      this.errorCount++;
      if (this.errorCount >= this.maxErrors) {
        console.error('Too many errors, stopping game loop');
        this.running = false;
        this.callbacks.onPause();
      }
    }
  };

  destroy() {
    this.stop();
    this.stopNetwork();
    window.removeEventListener('resize', this.handleResize);
    // Delete all chunk meshes
    for (const mesh of this.chunkMeshes.values()) {
      try { this.renderer.deleteMesh(mesh); } catch {}
    }
    this.chunkMeshes.clear();
    try { this.renderer.destroy(); } catch {}
  }
}
