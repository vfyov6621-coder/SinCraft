// ==========================================
// LiteCraft Engine - Minecraft on minimals
// Orchestrates world, physics, rendering
// ==========================================

import { Renderer, MeshData } from './renderer';
import { VoxelWorld, WORLD_W, WORLD_H, WORLD_D } from './world';
import { PlayerPhysics } from './physics';
import { raycast, RayHit } from './raycast';
import { Mat4, mat4Perspective, mat4LookAt, mat4Identity } from './math';
import { BlockType, HOTBAR_BLOCKS } from './blocks';

export interface GameCallbacks {
  onStatsUpdate: (stats: { fps: number; drawCalls: number; triangles: number; res: string }) => void;
  onHitUpdate: (hit: RayHit | null) => void;
  onPositionUpdate: (pos: { x: number; y: number; z: number }) => void;
}

export class Game {
  renderer!: Renderer;
  world!: VoxelWorld;
  player!: PlayerPhysics;

  private worldMesh: MeshData | null = null;
  private animFrame = 0;
  private lastTime = 0;
  private fpsFrames = 0;
  private fpsTime = 0;
  private currentFps = 0;
  private running = false;
  private resolutionScale = 0.75;
  private meshDirty = true;

  selectedSlot = 0;
  targetBlock: RayHit | null = null;
  callbacks: GameCallbacks;

  constructor(private canvas: HTMLCanvasElement, private config: { resolutionScale?: number }) {
    this.resolutionScale = config.resolutionScale ?? 0.75;
    this.callbacks = {
      onStatsUpdate: () => {},
      onHitUpdate: () => {},
      onPositionUpdate: () => {},
    };
  }

  init() {
    const { canvas } = this;
    this.renderer = new Renderer(canvas);
    this.world = new VoxelWorld();
    this.world.generate();
    this.player = new PlayerPhysics();

    // Find spawn position
    const sx = Math.floor(WORLD_W / 2);
    const sz = Math.floor(WORLD_D / 2);
    for (let y = WORLD_H - 1; y >= 0; y--) {
      if (this.world.isSolid(sx, y, sz)) {
        this.player.x = sx + 0.5;
        this.player.y = y + 1;
        this.player.z = sz + 0.5;
        break;
      }
    }

    this.rebuildMesh();
    this.handleResize();
    this.setupInput();

    window.addEventListener('resize', this.handleResize);
    this.start();
  }

  private handleResize = () => {
    const parent = this.canvas.parentElement;
    if (parent) {
      this.renderer.resizeWithScale(parent.clientWidth, parent.clientHeight, this.resolutionScale);
    }
  };

  setResolutionScale(s: number) {
    this.resolutionScale = s;
    this.handleResize();
  }

  get selectedBlockType(): BlockType {
    return HOTBAR_BLOCKS[this.selectedSlot] ?? BlockType.Stone;
  }

  // --- Block interaction ---
  removeBlock() {
    if (!this.targetBlock) return;
    const { x, y, z } = this.targetBlock;
    this.world.setBlock(x, y, z, BlockType.Air);
    this.meshDirty = true;
  }

  placeBlock() {
    if (!this.targetBlock) return;
    const { placeX, placeY, placeZ } = this.targetBlock;
    if (!this.world.inBounds(placeX, placeY, placeZ)) return;
    if (this.world.isSolid(placeX, placeY, placeZ)) return;

    // Don't place inside player
    const p = this.player;
    const hw = p.width;
    const h = p.height;
    const playerOverlaps =
      p.x + hw > placeX && p.x - hw < placeX + 1 &&
      p.y + h > placeY && p.y < placeY + 1 &&
      p.z + hw > placeZ && p.z - hw < placeZ + 1;
    if (playerOverlaps) return;

    this.world.setBlock(placeX, placeY, placeZ, this.selectedBlockType);
    this.meshDirty = true;
  }

  private rebuildMesh() {
    const data = this.world.buildMesh();
    this.worldMesh = this.renderer.createMesh(data.vertices, data.normals, data.colors, data.indices);
    this.meshDirty = false;
  }

  // --- Input ---
  private setupInput() {
    document.addEventListener('keydown', this.onKeyDown);
    document.addEventListener('keyup', this.onKeyUp);
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('mousedown', this.onMouseDown);
    document.addEventListener('wheel', this.onWheel);
    document.addEventListener('pointerlockchange', () => {});
    this.canvas.addEventListener('click', () => {
      this.canvas.requestPointerLock();
    });
  }

  private onKeyDown = (e: KeyboardEvent) => {
    switch (e.code) {
      case 'KeyW': case 'ArrowUp': this.player.moveForward = true; break;
      case 'KeyS': case 'ArrowDown': this.player.moveBackward = true; break;
      case 'KeyA': case 'ArrowLeft': this.player.moveLeft = true; break;
      case 'KeyD': case 'ArrowRight': this.player.moveRight = true; break;
      case 'Space': this.player.wantJump = true; e.preventDefault(); break;
      case 'Digit1': case 'Digit2': case 'Digit3': case 'Digit4': case 'Digit5':
      case 'Digit6': case 'Digit7': case 'Digit8': case 'Digit9':
        this.selectedSlot = parseInt(e.code.charAt(5)) - 1;
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
    }
  };

  private onMouseMove = (e: MouseEvent) => {
    if (document.pointerLockElement !== this.canvas) return;
    this.player.yaw -= e.movementX * 0.002;
    this.player.pitch -= e.movementY * 0.002;
    this.player.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.player.pitch));
  };

  private onMouseDown = (e: MouseEvent) => {
    if (document.pointerLockElement !== this.canvas) return;
    if (e.button === 0) this.removeBlock();  // left click = break
    if (e.button === 2) this.placeBlock();   // right click = place
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    if (e.deltaY > 0) {
      this.selectedSlot = (this.selectedSlot + 1) % HOTBAR_BLOCKS.length;
    } else {
      this.selectedSlot = (this.selectedSlot - 1 + HOTBAR_BLOCKS.length) % HOTBAR_BLOCKS.length;
    }
  };

  private detachInput() {
    document.removeEventListener('keydown', this.onKeyDown);
    document.removeEventListener('keyup', this.onKeyUp);
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('mousedown', this.onMouseDown);
    document.removeEventListener('wheel', this.onWheel);
  }

  // --- Game loop ---
  start() {
    this.running = true;
    this.lastTime = performance.now();
    this.loop();
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.animFrame);
    this.detachInput();
  }

  private loop = () => {
    if (!this.running) return;
    this.animFrame = requestAnimationFrame(this.loop);

    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;

    // FPS
    this.fpsFrames++;
    this.fpsTime += dt;
    if (this.fpsTime >= 0.5) {
      this.currentFps = Math.round(this.fpsFrames / this.fpsTime);
      this.fpsFrames = 0;
      this.fpsTime = 0;
    }

    // Rebuild mesh if needed
    if (this.meshDirty) {
      this.rebuildMesh();
    }

    // Update player
    this.player.update(dt, this.world);

    // Raycasting for block targeting
    const eye = this.player.getEyePos();
    const dir = this.player.getLookDir();
    this.targetBlock = raycast(this.world, eye[0], eye[1], eye[2], dir[0], dir[1], dir[2], 7);

    // Set matrices
    const aspect = this.canvas.width / this.canvas.height;
    const proj = mat4Perspective(Math.PI / 3, aspect, 0.05, 80);
    const eyePos: [number, number, number] = [this.player.x, this.player.y + this.player.eyeHeight, this.player.z];
    const fwd: [number, number, number] = this.player.getLookDir();
    const target: [number, number, number] = [eyePos[0] + fwd[0], eyePos[1] + fwd[1], eyePos[2] + fwd[2]];
    const view = mat4LookAt(eyePos, target, [0, 1, 0]);

    this.renderer.projectionMatrix = proj;
    this.renderer.viewMatrix = view;

    // Render
    if (this.worldMesh) {
      this.renderer.render(this.worldMesh, mat4Identity(), 0, this.targetBlock ? {
        x: this.targetBlock.x,
        y: this.targetBlock.y,
        z: this.targetBlock.z,
      } : null);
    }

    // Callbacks
    this.callbacks.onStatsUpdate({
      fps: this.currentFps,
      drawCalls: 1,
      triangles: this.worldMesh?.triangleCount ?? 0,
      res: `${this.canvas.width}x${this.canvas.height}`,
    });
    this.callbacks.onHitUpdate(this.targetBlock);
    this.callbacks.onPositionUpdate({ x: this.player.x, y: this.player.y, z: this.player.z });
  };

  destroy() {
    this.stop();
    window.removeEventListener('resize', this.handleResize);
    this.renderer.destroy();
  }
}
