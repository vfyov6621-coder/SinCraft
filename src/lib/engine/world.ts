// ==========================================
// Voxel World - Chunk-based block storage + mesh generation
// Supports configurable world size, terrain types, chunk rendering
// ==========================================

import { BlockType, BLOCK_COLORS } from './blocks';
import { Chunk, CHUNK_SIZE } from './chunk';

export interface WorldSettings {
  seed: number;
  chunkSize: number;    // number of chunks in X and Z (square world)
  worldHeight: number;  // max Y blocks (32-128)
  terrainType: 'normal' | 'flat' | 'mountains' | 'islands';
  treeDensity: number;  // 0-100
}

export function defaultSettings(): WorldSettings {
  return {
    seed: 42,
    chunkSize: 8,
    worldHeight: 64,
    terrainType: 'normal',
    treeDensity: 50,
  };
}

// Simple seeded PRNG (mulberry32)
function seededRandom(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class VoxelWorld {
  chunks: Map<string, Chunk> = new Map();
  settings: WorldSettings;
  dirtyChunks: Set<string> = new Set();

  get worldWidth(): number { return this.settings.chunkSize * CHUNK_SIZE; }
  get worldDepth(): number { return this.settings.chunkSize * CHUNK_SIZE; }
  get worldHeight(): number { return this.settings.worldHeight; }

  constructor(settings: WorldSettings) {
    this.settings = { ...settings };
  }

  private chunkKey(cx: number, cz: number): string { return `${cx},${cz}`; }

  getChunk(cx: number, cz: number): Chunk | undefined {
    return this.chunks.get(this.chunkKey(cx, cz));
  }

  getOrCreateChunk(cx: number, cz: number): Chunk {
    const key = this.chunkKey(cx, cz);
    let chunk = this.chunks.get(key);
    if (!chunk) {
      chunk = new Chunk(cx, cz, this.worldHeight);
      this.chunks.set(key, chunk);
    }
    return chunk;
  }

  inBounds(wx: number, wy: number, wz: number): boolean {
    return wx >= 0 && wx < this.worldWidth &&
           wy >= 0 && wy < this.worldHeight &&
           wz >= 0 && wz < this.worldDepth;
  }

  getBlock(wx: number, wy: number, wz: number): number {
    if (wy < 0 || wy >= this.worldHeight) return 0;
    const cx = (wx / CHUNK_SIZE) | 0;
    const cz = (wz / CHUNK_SIZE) | 0;
    const chunk = this.getChunk(cx, cz);
    if (!chunk) return 0;
    return chunk.getBlock(wx - cx * CHUNK_SIZE, wy, wz - cz * CHUNK_SIZE);
  }

  setBlock(wx: number, wy: number, wz: number, type: number): void {
    if (!this.inBounds(wx, wy, wz)) return;
    const cx = (wx / CHUNK_SIZE) | 0;
    const cz = (wz / CHUNK_SIZE) | 0;
    const chunk = this.getOrCreateChunk(cx, cz);
    const lx = wx - cx * CHUNK_SIZE;
    const lz = wz - cz * CHUNK_SIZE;
    chunk.setBlock(lx, wy, lz, type);
    this.dirtyChunks.add(this.chunkKey(cx, cz));

    // Mark neighbor chunks dirty if block is on border
    if (lx === 0 && cx > 0) this.markDirty(cx - 1, cz);
    if (lx === CHUNK_SIZE - 1 && cx < this.settings.chunkSize - 1) this.markDirty(cx + 1, cz);
    if (lz === 0 && cz > 0) this.markDirty(cx, cz - 1);
    if (lz === CHUNK_SIZE - 1 && cz < this.settings.chunkSize - 1) this.markDirty(cx, cz + 1);
  }

  private markDirty(cx: number, cz: number): void {
    const key = this.chunkKey(cx, cz);
    const chunk = this.chunks.get(key);
    if (chunk) {
      chunk.dirty = true;
      this.dirtyChunks.add(key);
    }
  }

  isSolid(wx: number, wy: number, wz: number): boolean {
    const b = this.getBlock(wx, wy, wz);
    if (b === 0) return false;
    return BLOCK_COLORS[b]?.solid ?? true;
  }

  // Get dirty chunks and clear dirty set
  getAndClearDirtyChunks(): Chunk[] {
    const result: Chunk[] = [];
    for (const key of this.dirtyChunks) {
      const chunk = this.chunks.get(key);
      if (chunk && chunk.dirty) result.push(chunk);
    }
    this.dirtyChunks.clear();
    return result;
  }

  // ==========================================
  // Terrain Generation
  // ==========================================

  generateAll(): void {
    // Pass 1: base terrain per chunk
    for (let cx = 0; cx < this.settings.chunkSize; cx++) {
      for (let cz = 0; cz < this.settings.chunkSize; cz++) {
        this.generateChunkTerrain(cx, cz);
      }
    }
    // Pass 2: trees (needs world-space block access across chunk boundaries)
    this.generateTrees();
    // Mark all generated chunks dirty
    for (const chunk of this.chunks.values()) {
      chunk.dirty = true;
      this.dirtyChunks.add(this.chunkKey(chunk.cx, chunk.cz));
    }
  }

  private generateChunkTerrain(cx: number, cz: number): void {
    const chunk = this.getOrCreateChunk(cx, cz);
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const wx = cx * CHUNK_SIZE + lx;
        const wz = cz * CHUNK_SIZE + lz;
        const h = this.getTerrainHeight(wx, wz);
        for (let y = 0; y <= h && y < this.worldHeight; y++) {
          let type: number;
          if (y === 0) type = BlockType.Stone;
          else if (y === h) type = h <= 4 ? BlockType.Sand : BlockType.Grass;
          else if (y >= h - 3) type = h <= 4 ? BlockType.Sand : BlockType.Dirt;
          else type = BlockType.Stone;
          chunk.setBlock(lx, y, lz, type);
        }
      }
    }
  }

  private generateTrees(): void {
    if (this.settings.treeDensity === 0) return;
    const rng = seededRandom(this.settings.seed + 99999);
    const wW = this.worldWidth;
    const wD = this.worldDepth;
    const treeCount = Math.floor(wW * wD * this.settings.treeDensity / 10000);
    for (let i = 0; i < treeCount; i++) {
      const tx = 3 + Math.floor(rng() * (wW - 6));
      const tz = 3 + Math.floor(rng() * (wD - 6));
      let groundY = -1;
      for (let y = this.worldHeight - 1; y >= 0; y--) {
        if (this.getBlock(tx, y, tz) === BlockType.Grass) { groundY = y + 1; break; }
      }
      if (groundY < 4 || groundY > this.worldHeight - 8) continue;
      const trunkH = 3 + Math.floor(rng() * 2);
      for (let y = 0; y < trunkH; y++) this.setBlock(tx, groundY + y, tz, BlockType.Wood);
      const leafR = 2;
      for (let dx = -leafR; dx <= leafR; dx++) {
        for (let dz = -leafR; dz <= leafR; dz++) {
          for (let dy = -1; dy <= leafR; dy++) {
            if (Math.abs(dx) === leafR && Math.abs(dz) === leafR && dy === leafR) continue;
            if (Math.sqrt(dx * dx + dy * dy + dz * dz) <= leafR + 0.5) {
              const bx = tx + dx, by = groundY + trunkH + dy, bz = tz + dz;
              if (this.getBlock(bx, by, bz) === 0) {
                this.setBlock(bx, by, bz, BlockType.Leaves);
              }
            }
          }
        }
      }
    }
  }

  private getTerrainHeight(wx: number, wz: number): number {
    const { seed, terrainType } = this.settings;
    const nx = wx / this.worldWidth;
    const nz = wz / this.worldDepth;
    const H = this.worldHeight;
    switch (terrainType) {
      case 'flat': {
        let h = H * 0.15;
        h += Math.sin(nx * Math.PI * 2 + seed * 0.1) * H * 0.02;
        h += Math.cos(nz * Math.PI * 2 + seed * 0.2) * H * 0.02;
        return Math.max(1, Math.min(H - 6, Math.floor(h)));
      }
      case 'mountains': {
        let h = H * 0.25;
        h += Math.sin(nx * Math.PI * 3 + seed * 0.1) * H * 0.15;
        h += Math.cos(nz * Math.PI * 4 + seed * 0.2) * H * 0.12;
        h += Math.sin((nx + nz) * Math.PI * 5 + seed * 0.3) * H * 0.1;
        h += Math.sin(nx * Math.PI * 12 + nz * Math.PI * 10 + seed * 0.5) * H * 0.04;
        return Math.max(1, Math.min(H - 6, Math.floor(h)));
      }
      case 'islands': {
        const dx = nx - 0.5;
        const dz = nz - 0.5;
        const dist = Math.sqrt(dx * dx + dz * dz);
        let h = H * 0.12;
        h += Math.sin(nx * Math.PI * 6 + seed * 0.1) * H * 0.06;
        h += Math.cos(nz * Math.PI * 5 + seed * 0.2) * H * 0.04;
        h *= Math.max(0, 1 - dist * 2.2);
        return Math.max(0, Math.min(H - 6, Math.floor(h)));
      }
      default: { // normal
        let h = H * 0.2;
        h += Math.sin(nx * Math.PI * 3 + seed * 0.1) * H * 0.08;
        h += Math.cos(nz * Math.PI * 2.5 + seed * 0.2) * H * 0.07;
        h += Math.sin((nx + nz) * Math.PI * 5 + seed * 0.3) * H * 0.05;
        h += Math.sin(nx * Math.PI * 9 + nz * Math.PI * 7 + seed * 0.5) * H * 0.02;
        return Math.max(1, Math.min(H - 6, Math.floor(h)));
      }
    }
  }

  // ==========================================
  // Chunk Mesh Building
  // ==========================================

  buildChunkMesh(cx: number, cz: number): { vertices: number[]; normals: number[]; colors: number[]; indices: number[] } | null {
    const chunk = this.getChunk(cx, cz);
    if (!chunk || chunk.isEmpty()) return null;

    const vertices: number[] = [];
    const normals: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
    let vertCount = 0;

    const wx0 = cx * CHUNK_SIZE;
    const wz0 = cz * CHUNK_SIZE;

    for (let ly = 0; ly < this.worldHeight; ly++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          const block = chunk.getBlock(lx, ly, lz);
          if (block === 0) continue;
          const bd = BLOCK_COLORS[block];
          if (!bd) continue;

          const wx = wx0 + lx;
          const wz = wz0 + lz;

          if (!this.isSolid(wx, ly + 1, wz)) { this.addFace(wx, ly, wz, 'top', bd.top, vertices, normals, colors, indices, vertCount); vertCount += 4; }
          if (!this.isSolid(wx, ly - 1, wz)) { this.addFace(wx, ly, wz, 'bottom', bd.bottom, vertices, normals, colors, indices, vertCount); vertCount += 4; }
          if (!this.isSolid(wx + 1, ly, wz)) { this.addFace(wx, ly, wz, 'east', bd.side, vertices, normals, colors, indices, vertCount); vertCount += 4; }
          if (!this.isSolid(wx - 1, ly, wz)) { this.addFace(wx, ly, wz, 'west', bd.side, vertices, normals, colors, indices, vertCount); vertCount += 4; }
          if (!this.isSolid(wx, ly, wz + 1)) { this.addFace(wx, ly, wz, 'south', bd.side, vertices, normals, colors, indices, vertCount); vertCount += 4; }
          if (!this.isSolid(wx, ly, wz - 1)) { this.addFace(wx, ly, wz, 'north', bd.side, vertices, normals, colors, indices, vertCount); vertCount += 4; }
        }
      }
    }

    chunk.dirty = false;
    return { vertices, normals, colors, indices };
  }

  private addFace(x: number, y: number, z: number, face: string, color: number[],
    verts: number[], norms: number[], cols: number[], idx: number[], offset: number) {
    const faces: Record<string, { pos: number[][]; normal: number[] }> = {
      top:    { pos: [[x,y+1,z],[x,y+1,z+1],[x+1,y+1,z+1],[x+1,y+1,z]], normal: [0,1,0] },
      bottom: { pos: [[x,y,z+1],[x,y,z],[x+1,y,z],[x+1,y,z+1]], normal: [0,-1,0] },
      east:   { pos: [[x+1,y,z+1],[x+1,y,z],[x+1,y+1,z],[x+1,y+1,z+1]], normal: [1,0,0] },
      west:   { pos: [[x,y,z],[x,y,z+1],[x,y+1,z+1],[x,y+1,z]], normal: [-1,0,0] },
      south:  { pos: [[x,y,z+1],[x+1,y,z+1],[x+1,y+1,z+1],[x,y+1,z+1]], normal: [0,0,1] },
      north:  { pos: [[x+1,y,z],[x,y,z],[x,y+1,z],[x+1,y+1,z]], normal: [0,0,-1] },
    };
    const f = faces[face];
    if (!f) return;
    for (const p of f.pos) {
      verts.push(p[0], p[1], p[2]);
      norms.push(f.normal[0], f.normal[1], f.normal[2]);
      cols.push(color[0], color[1], color[2]);
    }
    idx.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
  }

  // ==========================================
  // Serialization
  // ==========================================

  serializeChunks(): Map<string, string> {
    const result = new Map<string, string>();
    for (const [key, chunk] of this.chunks) {
      if (!chunk.isEmpty()) {
        result.set(key, chunk.serialize());
      }
    }
    return result;
  }

  deserializeChunks(data: Map<string, string>): void {
    for (const [key, serialized] of data) {
      const parts = key.split(',');
      const cx = parseInt(parts[0]);
      const cz = parseInt(parts[1]);
      const chunk = this.getOrCreateChunk(cx, cz);
      chunk.deserialize(serialized);
      this.dirtyChunks.add(key);
    }
  }

  // Find safe spawn point
  findSpawnPoint(): { x: number; y: number; z: number } {
    const sx = Math.floor(this.worldWidth / 2);
    const sz = Math.floor(this.worldDepth / 2);
    for (let y = this.worldHeight - 1; y >= 0; y--) {
      if (this.isSolid(sx, y, sz)) {
        return { x: sx + 0.5, y: y + 1, z: sz + 0.5 };
      }
    }
    return { x: sx + 0.5, y: Math.floor(this.worldHeight / 2), z: sz + 0.5 };
  }
}
