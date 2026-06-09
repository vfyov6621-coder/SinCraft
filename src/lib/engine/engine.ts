// ==========================================
// SinCraft Engine - Game loop
// Frustum culling, FPS cap, inventory, survival
// ==========================================

import { Renderer, MeshData } from './renderer';
import { VoxelWorld, WorldSettings } from './world';
import { PlayerPhysics } from './physics';
import { raycast, RayHit } from './raycast';
import { Mat4, mat4Perspective, mat4LookAt, mat4Multiply, extractFrustumPlanes, isAABBVisible } from './math';
import { BlockType, HOTBAR_BLOCKS, BLOCK_COLORS, ItemStack, createInventory, addToInventory, removeFromInventory, hasItems } from './blocks';
import { CHUNK_SIZE } from './chunk';
import { GameNetwork, RemotePlayer } from './network';

export interface GameCallbacks {
  onStatsUpdate: (stats: GameStats) => void;
  onPause: () => void;
  onRemotePlayersUpdate: (players: RemotePlayer[]) => void;
  onSlotChange: (slot: number) => void;
  onFlightToggle: (flying: boolean) => void;
  onHealthUpdate: (health: number, hunger: number) => void;
  onInventoryUpdate: (inventory: ItemStack[]) => void;
  onDeath: () => void;
  onBreakingProgress: (progress: number, maxProgress: number) => void;
  onInventoryToggle: (open: boolean) => void;
  onBlockLookAt: (name: string) => void;
}

export interface GameStats {
  fps: number;
  flying: boolean;
  health: number;
  hunger: number;
  position: { x: number; y: number; z: number };
}

export class Game {
  renderer!: Renderer;
  world!: VoxelWorld;
  player!: PlayerPhysics;
  network: GameNetwork | null = null;

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

  // Throttle for UI updates
  private lastStatsUpdate = 0;
  private lastHealthUpdate = 0;
  private statsUpdateInterval = 0.2; // 200ms
  private healthUpdateInterval = 0.5; // 500ms
  private cachedStats: GameStats = { fps: 0, flying: false, health: 20, hunger: 20, position: { x: 0, y: 0, z: 0 } };

  renderDistance = 10;
  maxFps = 0;
  private lastRenderTime = 0;
  private minFrameInterval = 0;
  private maxChunkRebuildsPerFrame = 6;
  private pendingDirtyChunks: { cx: number; cz: number }[] = [];

  selectedSlot = 0;
  targetBlock: RayHit | null = null;
  callbacks: GameCallbacks;
  private contextLost = false;

  // Breaking system
  private breakingProgress = 0;
  private breakingHardness = 1;
  private mouseHeld = false;
  private currentBreakKey = '';
  isInventoryOpen = false;

  // Inventory
  inventory: ItemStack[] = createInventory();

  get settings(): WorldSettings { return this.world.settings; }

  constructor(private canvas: HTMLCanvasElement, private config: { resolutionScale?: number; renderDistance?: number; maxFps?: number }) {
    this.resolutionScale = config.resolutionScale ?? 0.75;
    this.renderDistance = config.renderDistance ?? 10;
    this.maxFps = config.maxFps ?? 0;
    if (this.maxFps > 0) this.minFrameInterval = 1000 / this.maxFps;
    this.callbacks = {
      onStatsUpdate: () => {},
      onPause: () => {},
      onRemotePlayersUpdate: () => {},
      onSlotChange: () => {},
      onFlightToggle: () => {},
      onHealthUpdate: () => {},
      onInventoryUpdate: () => {},
      onDeath: () => {},
      onBreakingProgress: () => {},
      onInventoryToggle: () => {},
      onBlockLookAt: () => {},
    };
  }

  init(settings: WorldSettings, savedChunks?: Map<string, string>, savedPlayer?: { x: number; y: number; z: number; yaw: number }) {
    this.renderer = new Renderer(this.canvas);
    this.world = new VoxelWorld(settings);

    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.contextLost = true;
      this.togglePause();
    });
    this.canvas.addEventListener('webglcontextrestored', () => {
      this.contextLost = false;
      try {
        this.renderer = new Renderer(this.canvas);
        this.rebuildAllChunkMeshes();
        this.updateFog();
      } catch (err) { console.error('WebGL restore failed:', err); }
    });

    this.world.generateAll();
    if (savedChunks) this.world.deserializeChunks(savedChunks);

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

    this.player.onFlightToggle = (flying) => this.callbacks.onFlightToggle(flying);

    // Give starter items in survival
    if (settings.gameMode === 'survival') {
      // No starter items - pure survival
    }

    this.rebuildAllChunkMeshes();
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
  setMaxFps(fps: number) { this.maxFps = fps; this.minFrameInterval = fps > 0 ? 1000 / fps : 0; }

  // --- Chunk Mesh Management ---

  private rebuildAllChunkMeshes(): void {
    for (const mesh of this.chunkMeshes.values()) this.renderer.deleteMesh(mesh);
    this.chunkMeshes.clear();
    this.pendingDirtyChunks = [];

    for (const [, chunk] of this.world.chunks) {
      if (!chunk.isEmpty()) {
        try {
          const key = `${chunk.cx},${chunk.cz}`;
          const data = this.world.buildChunkMesh(chunk.cx, chunk.cz);
          if (data) {
            this.chunkMeshes.set(key, this.renderer.createMesh(data.vertices, data.normals, data.colors, data.indices, data.emissive));
          }
        } catch (err) {
          console.error(`Mesh build error ${chunk.cx},${chunk.cz}:`, err);
        }
      }
    }
  }

  private rebuildDirtyChunks(): void {
    const newDirty = this.world.getAndClearDirtyChunks();
    for (const chunk of newDirty) {
      const exists = this.pendingDirtyChunks.some(p => p.cx === chunk.cx && p.cz === chunk.cz);
      if (!exists) this.pendingDirtyChunks.push({ cx: chunk.cx, cz: chunk.cz });
    }

    const maxBuild = this.maxChunkRebuildsPerFrame;
    let built = 0;
    const remaining: { cx: number; cz: number }[] = [];

    for (const { cx, cz } of this.pendingDirtyChunks) {
      if (built >= maxBuild) { remaining.push({ cx, cz }); continue; }
      try {
        const key = `${cx},${cz}`;
        const oldMesh = this.chunkMeshes.get(key);
        if (oldMesh) { this.renderer.deleteMesh(oldMesh); this.chunkMeshes.delete(key); }
        const data = this.world.buildChunkMesh(cx, cz);
        if (data) {
          this.chunkMeshes.set(key, this.renderer.createMesh(data.vertices, data.normals, data.colors, data.indices, data.emissive));
        } else {
          this.chunkMeshes.delete(key);
        }
        built++;
      } catch (err) {
        console.error(`Rebuild error ${cx},${cz}:`, err);
        remaining.push({ cx, cz });
      }
    }
    this.pendingDirtyChunks = remaining;
  }

  // --- Save / Network ---

  getSaveData() {
    return {
      blocks: this.world.serializeChunks(),
      playerX: this.player.x, playerY: this.player.y, playerZ: this.player.z,
      playerYaw: this.player.yaw,
    };
  }

  private directHost: string | undefined;

  startNetwork(pid: string, name: string, color: string, port?: number, host?: string) {
    this.directHost = host;
    this.network = new GameNetwork(pid, name, color, {
      onWorldData: (data) => { this.world.deserializeChunks(new Map(Object.entries(data))); this.rebuildDirtyChunks(); },
      onBlockSet: (x, y, z, type) => { this.world.setBlock(x, y, z, type as BlockType); this.rebuildDirtyChunks(); },
      onPlayerJoin: () => {}, onPlayerLeave: () => {},
      onPlayerPos: () => {}, onPlayersList: () => {}, onChat: () => {},
    });
    this.network.connect(port, host);
  }

  hostNetwork(pid: string, name: string, color: string, port?: number) {
    this.startNetwork(pid, name, color, port);
    setTimeout(() => {
      if (this.network?.isConnected) {
        const chunks = this.world.serializeChunks();
        const obj: Record<string, string> = {};
        chunks.forEach((v, k) => obj[k] = v);
        this.network.sendWorld(obj, this.world.worldWidth, this.world.worldHeight, this.world.worldDepth);
      }
    }, 500);
  }

  stopNetwork() { if (this.network) { this.network.disconnect(); this.network = null; } }

  // --- Block Interaction ---

  removeBlock() {
    if (!this.targetBlock) return;
    const { x, y, z } = this.targetBlock;
    const blockType = this.world.getBlock(x, y, z);
    const bd = BLOCK_COLORS[blockType];

    // Leaves: instant break, drop nothing
    const isLeaf = blockType === BlockType.OakLeaves || blockType === BlockType.BirchLeaves || blockType === BlockType.SpruceLeaves;

    this.world.setBlock(x, y, z, BlockType.Air);
    this.rebuildDirtyChunks();

    // Drop item to inventory (in survival, bedrock/lava can't be broken, leaves drop nothing)
    if (bd && bd.hardness < 100 && !isLeaf) {
      const dropType = bd.drops ?? blockType;
      addToInventory(this.inventory, dropType, 1);
      this.callbacks.onInventoryUpdate([...this.inventory]);
    }

    if (this.network?.isConnected) this.network.sendBlock(x, y, z, 0);
  }

  placeBlock() {
    if (!this.targetBlock) return;
    const { placeX, placeY, placeZ } = this.targetBlock;
    if (!this.world.inBounds(placeX, placeY, placeZ)) return;
    if (this.world.isSolid(placeX, placeY, placeZ)) return;

    const p = this.player;
    if (p.x + p.width > placeX && p.x - p.width < placeX + 1 &&
        p.y + p.height > placeY && p.y < placeY + 1 &&
        p.z + p.width > placeZ && p.z - p.width < placeZ + 1) return;

    // Check inventory
    const hotbarItem = this.inventory[this.selectedSlot];
    if (hotbarItem.count <= 0 || hotbarItem.block === BlockType.Air) return;

    const blockToPlace = hotbarItem.block;
    this.world.setBlock(placeX, placeY, placeZ, blockToPlace);
    this.rebuildDirtyChunks();

    // Consume from inventory
    removeFromInventory(this.inventory, blockToPlace, 1);
    this.callbacks.onInventoryUpdate([...this.inventory]);

    if (this.network?.isConnected) this.network.sendBlock(placeX, placeY, placeZ, blockToPlace);
  }

  // --- Input ---

  private setupInput() {
    document.addEventListener('keydown', this.onKeyDown);
    document.addEventListener('keyup', this.onKeyUp);
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('mousedown', this.onMouseDown);
    document.addEventListener('mouseup', this.onMouseUp);
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
      case 'ShiftLeft': case 'ShiftRight':
        this.player.wantSneak = true;
        // Toggle fly in creative
        if (this.settings.gameMode === 'creative') {
          this.player.flying = !this.player.flying;
          this.player.vy = 0;
          this.callbacks.onFlightToggle(this.player.flying);
        }
        break;
      case 'ControlLeft': case 'ControlRight':
        this.player.wantSprint = true;
        e.preventDefault();
        break;
      case 'Space':
        this.player.wantJump = true;
        e.preventDefault();
        break;
      case 'KeyE':
        this.isInventoryOpen = !this.isInventoryOpen;
        this.callbacks.onInventoryToggle(this.isInventoryOpen);
        if (this.isInventoryOpen) {
          document.exitPointerLock();
        } else {
          this.canvas.requestPointerLock();
        }
        e.preventDefault();
        break;
      case 'Digit1': case 'Digit2': case 'Digit3': case 'Digit4': case 'Digit5':
      case 'Digit6': case 'Digit7': case 'Digit8': case 'Digit9':
        this.selectedSlot = parseInt(e.code.charAt(5)) - 1;
        this.callbacks.onSlotChange(this.selectedSlot);
        break;
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    switch (e.code) {
      case 'KeyW': case 'ArrowUp': this.player.moveForward = false; break;
      case 'KeyS': case 'ArrowDown': this.player.moveBackward = false; break;
      case 'KeyA': case 'ArrowLeft': this.player.moveLeft = false; break;
      case 'KeyD': case 'ArrowRight': this.player.moveRight = false; break;
      case 'Space': this.player.wantJump = false; break;
      case 'ShiftLeft': case 'ShiftRight': this.player.wantSneak = false; break;
      case 'ControlLeft': case 'ControlRight': this.player.wantSprint = false; break;
    }
  };

  private onMouseMove = (e: MouseEvent) => {
    if (document.pointerLockElement !== this.canvas || this.paused) return;
    this.player.yaw += e.movementX * 0.002;
    this.player.pitch -= e.movementY * 0.002;
    this.player.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.player.pitch));
  };

  private onMouseDown = (e: MouseEvent) => {
    if (document.pointerLockElement !== this.canvas || this.paused || this.isInventoryOpen) return;
    if (e.button === 0) {
      this.mouseHeld = true;
      this.breakingProgress = 0;
      this.currentBreakKey = '';
    }
    if (e.button === 2) this.handleRightClick();
  };

  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) {
      this.mouseHeld = false;
      this.breakingProgress = 0;
      this.currentBreakKey = '';
      this.callbacks.onBreakingProgress(0, 1);
    }
  };

  private handleRightClick() {
    if (!this.targetBlock) return;
    const hotbarItem = this.inventory[this.selectedSlot];
    // Food eating (Wheat only - leaves are NOT food)
    if (hotbarItem.count > 0 && hotbarItem.block === BlockType.Wheat) {
      this.player.hunger = Math.min(this.player.maxHunger, this.player.hunger + 3);
      this.player.heal(1);
      removeFromInventory(this.inventory, hotbarItem.block, 1);
      this.callbacks.onInventoryUpdate([...this.inventory]);
      return;
    }
    this.placeBlock();
  }

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    if (this.paused) return;
    if (e.deltaY > 0) this.selectedSlot = (this.selectedSlot + 1) % 9;
    else this.selectedSlot = (this.selectedSlot - 1 + 9) % 9;
    this.callbacks.onSlotChange(this.selectedSlot);
  };

  private detachInput() {
    document.removeEventListener('keydown', this.onKeyDown);
    document.removeEventListener('keyup', this.onKeyUp);
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('mousedown', this.onMouseDown);
    document.removeEventListener('mouseup', this.onMouseUp);
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

  resumeGame() {
    this.paused = false;
    this.canvas.requestPointerLock();
  }

  // --- Game Loop ---

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

      this.fpsFrames++; this.fpsTime += dt;
      if (this.fpsTime >= 0.5) {
        this.currentFps = Math.round(this.fpsFrames / this.fpsTime);
        this.fpsFrames = 0; this.fpsTime = 0;
      }

      this.rebuildDirtyChunks();

      if (!this.paused && !this.contextLost && !this.isInventoryOpen) {
        // Breaking progress
        if (this.mouseHeld && this.targetBlock) {
          const { x, y, z } = this.targetBlock;
          const key = `${x},${y},${z}`;
          if (this.currentBreakKey !== key) {
            this.currentBreakKey = key;
            this.breakingProgress = 0;
            const bt = this.world.getBlock(x, y, z);
            const bd = BLOCK_COLORS[bt];
            this.breakingHardness = bd ? Math.max(0.1, (bd.hardness || 1) * 0.35) : 0.3;
          }
          this.breakingProgress += dt;
          this.callbacks.onBreakingProgress(this.breakingProgress, this.breakingHardness);
          if (this.breakingProgress >= this.breakingHardness) {
            this.removeBlock();
            this.breakingProgress = 0;
            this.currentBreakKey = '';
            this.callbacks.onBreakingProgress(0, 1);
          }
        } else if (this.breakingProgress > 0) {
          this.breakingProgress = 0;
          this.currentBreakKey = '';
          this.callbacks.onBreakingProgress(0, 1);
        }

        this.player.update(dt, this.world);

        // Survival: hunger drain
        if (this.settings.gameMode === 'survival') {
          this.player.hunger = Math.max(0, this.player.hunger - dt * 0.03);
          // Heal if well fed
          if (this.player.hunger > 14 && this.player.health < this.player.maxHealth) {
            this.player.health = Math.min(this.player.maxHealth, this.player.health + dt * 0.5);
          }
          // Starve if no hunger
          if (this.player.hunger <= 0) {
            this.player.takeDamage(1, this.world);
          }
        }

        const eye = this.player.getEyePos();
        const dir = this.player.getLookDir();
        this.targetBlock = raycast(this.world, eye[0], eye[1], eye[2], dir[0], dir[1], dir[2], 7);

        if (this.network?.isConnected) {
          this.network.sendPosition(this.player.x, this.player.y, this.player.z, this.player.yaw, this.player.pitch);
        }

        // Check death
        if (this.player.health <= 0) {
          this.paused = true;
          document.exitPointerLock();
          this.callbacks.onDeath();
        }

        // Block look-at name
        if (this.targetBlock) {
          const bt = this.world.getBlock(this.targetBlock.x, this.targetBlock.y, this.targetBlock.z);
          const bd = BLOCK_COLORS[bt];
          if (bd) this.callbacks.onBlockLookAt(bd.name);
          else this.callbacks.onBlockLookAt('');
        } else {
          this.callbacks.onBlockLookAt('');
        }

      }

      // FPS cap
      if (this.minFrameInterval > 0) {
        const elapsed = now - this.lastRenderTime;
        if (elapsed < this.minFrameInterval) return;
        this.lastRenderTime = now - (elapsed % this.minFrameInterval);
      }

      if (this.contextLost) return;

      const w = this.canvas.width;
      const h = this.canvas.height;
      if (w === 0 || h === 0) return;

      const aspect = w / Math.max(1, h);
      const fogFar = this.renderDistance * CHUNK_SIZE + 20;
      const proj = mat4Perspective(Math.PI / 3, aspect, 0.05, fogFar);
      const eyePos: [number, number, number] = [this.player.x, this.player.y + this.player.eyeHeight, this.player.z];
      const fwd: [number, number, number] = this.player.getLookDir();
      const tgt: [number, number, number] = [eyePos[0] + fwd[0], eyePos[1] + fwd[1], eyePos[2] + fwd[2]];
      const view = mat4LookAt(eyePos, tgt, [0, 1, 0]);
      this.renderer.projectionMatrix = proj;
      this.renderer.viewMatrix = view;
      this.renderer.cameraPos = eyePos;

      const vp = mat4Multiply(proj, view);
      const frustum = extractFrustumPlanes(vp);

      this.renderer.beginFrame();

      let chunksVisible = 0;
      const playerCX = (this.player.x / CHUNK_SIZE) | 0;
      const playerCZ = (this.player.z / CHUNK_SIZE) | 0;
      const rd = this.renderDistance;
      const rdSq = rd * rd;
      const worldH = this.world.worldHeight;
      const halfSizeXZ = CHUNK_SIZE / 2;
      const halfSizeY = worldH / 2;

      for (const [key, mesh] of this.chunkMeshes) {
        const comma = key.indexOf(',');
        const cx = parseInt(key.substring(0, comma));
        const cz = parseInt(key.substring(comma + 1));

        const dx = cx - playerCX;
        const dz = cz - playerCZ;
        if (dx * dx + dz * dz > rdSq) continue;

        const ccx = cx * CHUNK_SIZE + halfSizeXZ;
        const ccz = cz * CHUNK_SIZE + halfSizeXZ;
        if (!isAABBVisible(ccx, halfSizeY, ccz, halfSizeXZ, halfSizeY, halfSizeXZ, frustum)) continue;

        this.renderer.renderMesh(mesh);
        chunksVisible++;
      }

      if (this.targetBlock) {
        this.renderer.renderHighlight({ x: this.targetBlock.x, y: this.targetBlock.y, z: this.targetBlock.z });
      }

      // Update stats (throttled to ~10fps)
      const statsNow = performance.now();
      this.cachedStats.fps = this.currentFps;
      this.cachedStats.flying = this.player.flying;
      this.cachedStats.health = this.player.health;
      this.cachedStats.hunger = this.player.hunger;
      this.cachedStats.position = { x: this.player.x, y: this.player.y, z: this.player.z };
      if (statsNow - this.lastStatsUpdate >= this.statsUpdateInterval * 1000) {
        this.callbacks.onStatsUpdate({ ...this.cachedStats });
        this.lastStatsUpdate = statsNow;
      }
      // Health/hunger separate throttle
      if (statsNow - this.lastHealthUpdate >= this.healthUpdateInterval * 1000) {
        this.callbacks.onHealthUpdate(this.player.health, this.player.hunger);
        this.lastHealthUpdate = statsNow;
      }

      this.errorCount = 0;
    } catch (err) {
      console.error('Game loop error:', err);
      this.errorCount++;
      if (this.errorCount >= this.maxErrors) {
        this.running = false;
        this.callbacks.onPause();
      }
    }
  };

  destroy() {
    this.stop();
    this.stopNetwork();
    window.removeEventListener('resize', this.handleResize);
    for (const mesh of this.chunkMeshes.values()) { try { this.renderer.deleteMesh(mesh); } catch {} }
    this.chunkMeshes.clear();
    this.pendingDirtyChunks = [];
    try { this.renderer.destroy(); } catch {}
  }
}
