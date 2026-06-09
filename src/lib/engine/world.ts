// ==========================================
// SinCraft - Voxel World
// Chunk storage, terrain gen, ore caves, mesh building
// ==========================================

import { BlockType, BLOCK_COLORS } from './blocks';
import { Chunk, CHUNK_SIZE } from './chunk';

export interface WorldSettings {
  seed: number;
  chunkSize: number;
  worldHeight: number;
  terrainType: 'normal' | 'flat' | 'mountains' | 'islands' | 'parkour';
  treeDensity: number;
  gameMode: 'survival' | 'creative';
}

export function defaultSettings(): WorldSettings {
  return {
    seed: 42,
    chunkSize: 16,
    worldHeight: 80,
    terrainType: 'normal',
    treeDensity: 40,
    gameMode: 'survival',
  };
}

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
    if (this.settings.terrainType === 'parkour') {
      this.generateParkour();
    } else {
      for (let cx = 0; cx < this.settings.chunkSize; cx++) {
        for (let cz = 0; cz < this.settings.chunkSize; cz++) {
          this.generateChunkTerrain(cx, cz);
        }
      }
      // Bedrock layer
      for (let cx = 0; cx < this.settings.chunkSize; cx++) {
        for (let cz = 0; cz < this.settings.chunkSize; cz++) {
          const chunk = this.getOrCreateChunk(cx, cz);
          for (let lx = 0; lx < CHUNK_SIZE; lx++) {
            for (let lz = 0; lz < CHUNK_SIZE; lz++) {
              chunk.setBlock(lx, 0, lz, BlockType.Bedrock);
            }
          }
        }
      }
      // Ores and caves
      this.generateOres();
      // Trees
      this.generateTrees();
    }
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
        for (let y = 1; y <= h && y < this.worldHeight; y++) {
          let type: number;
          if (y === h) {
            type = h <= 4 ? BlockType.Sand : (this.settings.terrainType === 'mountains' && h > this.worldHeight * 0.5 ? BlockType.Snow : BlockType.Grass);
          }
          else if (y >= h - 3) type = h <= 4 ? BlockType.Sand : BlockType.Dirt;
          else type = BlockType.Stone;
          chunk.setBlock(lx, y, lz, type);
        }
      }
    }
  }

  private generateOres(): void {
    const rng = seededRandom(this.settings.seed + 55555);
    const W = this.worldWidth;
    const D = this.worldDepth;

    // Ore definitions: [type, minDepth, maxDepth, rarity (0-1)]
    const ores: { type: BlockType; minH: number; maxH: number; chance: number; veinSize: number }[] = [
      { type: BlockType.CoalOre, minH: 1, maxH: 0.8, chance: 0.008, veinSize: 8 },
      { type: BlockType.IronOre, minH: 1, maxH: 0.6, chance: 0.005, veinSize: 6 },
      { type: BlockType.GoldOre, minH: 1, maxH: 0.35, chance: 0.002, veinSize: 4 },
      { type: BlockType.DiamondOre, minH: 1, maxH: 0.2, chance: 0.001, veinSize: 3 },
    ];

    for (const ore of ores) {
      const count = Math.floor(W * D * ore.chance);
      for (let i = 0; i < count; i++) {
        const ox = Math.floor(rng() * W);
        const oz = Math.floor(rng() * D);
        const maxY = Math.floor(this.worldHeight * ore.maxH);
        const oy = 1 + Math.floor(rng() * maxY);
        // Place vein
        for (let v = 0; v < ore.veinSize; v++) {
          const vx = ox + Math.floor(rng() * 3) - 1;
          const vy = oy + Math.floor(rng() * 3) - 1;
          const vz = oz + Math.floor(rng() * 3) - 1;
          if (this.getBlock(vx, vy, vz) === BlockType.Stone) {
            this.setBlock(vx, vy, vz, ore.type);
          }
        }
      }
    }

    // Small caves: carve out some stone areas
    const caveCount = Math.floor(W * D * 0.0003);
    for (let i = 0; i < caveCount; i++) {
      const cx = 3 + Math.floor(rng() * (W - 6));
      const cz = 3 + Math.floor(rng() * (D - 6));
      const cy = 3 + Math.floor(rng() * (this.worldHeight * 0.5));
      const len = 5 + Math.floor(rng() * 15);
      let dx = 0, dy = 0, dz = 0;
      for (let j = 0; j < len; j++) {
        // Carve a 1-2 block wide tunnel
        for (let ex = -1; ex <= 1; ex++) {
          for (let ez = -1; ez <= 1; ez++) {
            const bx = cx + ex, by = cy, bz = cz + ez;
            if (this.getBlock(bx, by, bz) === BlockType.Stone && by > 0) {
              this.setBlock(bx, by, bz, BlockType.Air);
            }
          }
        }
        // Random walk
        dx += Math.floor(rng() * 3) - 1;
        dy += Math.floor(rng() * 3) - 1;
        dz += Math.floor(rng() * 3) - 1;
        dx = Math.max(-1, Math.min(1, dx));
        dy = Math.max(-1, Math.min(1, dy));
        dz = Math.max(-1, Math.min(1, dz));
      }
    }
  }

  private generateTrees(): void {
    if (this.settings.treeDensity === 0) return;
    const rng = seededRandom(this.settings.seed + 99999);
    const wW = this.worldWidth;
    const wD = this.worldDepth;
    const treeCount = Math.floor(wW * wD * this.settings.treeDensity / 12000);

    for (let i = 0; i < treeCount; i++) {
      const tx = 3 + Math.floor(rng() * (wW - 6));
      const tz = 3 + Math.floor(rng() * (wD - 6));
      let groundY = -1;
      for (let y = this.worldHeight - 1; y >= 0; y--) {
        if (this.getBlock(tx, y, tz) === BlockType.Grass) { groundY = y + 1; break; }
      }
      if (groundY < 4 || groundY > this.worldHeight - 10) continue;

      // Random tree type
      const treeType = rng();
      let logType = BlockType.OakLog;
      let leafType = BlockType.OakLeaves;

      if (treeType > 0.66) {
        logType = BlockType.BirchLog;
        leafType = BlockType.BirchLeaves;
      } else if (treeType > 0.33) {
        logType = BlockType.SpruceLog;
        leafType = BlockType.SpruceLeaves;
      }

      const trunkH = 4 + Math.floor(rng() * 3);
      for (let y = 0; y < trunkH; y++) {
        this.setBlock(tx, groundY + y, tz, logType);
      }

      const leafR = 2;
      for (let dx = -leafR; dx <= leafR; dx++) {
        for (let dz = -leafR; dz <= leafR; dz++) {
          for (let dy = -1; dy <= leafR; dy++) {
            if (Math.abs(dx) === leafR && Math.abs(dz) === leafR && dy === leafR) continue;
            if (Math.sqrt(dx * dx + dy * dy + dz * dz) <= leafR + 0.5) {
              const bx = tx + dx, by = groundY + trunkH + dy, bz = tz + dz;
              if (this.getBlock(bx, by, bz) === 0) {
                this.setBlock(bx, by, bz, leafType);
              }
            }
          }
        }
      }
    }
  }

  // ==========================================
  // Parkour Generator
  // ==========================================

  private generateParkour(): void {
    const rng = seededRandom(this.settings.seed + 77777);
    const W = this.worldWidth;
    const D = this.worldDepth;
    const H = this.worldHeight;

    for (let x = 0; x < W; x++) {
      for (let z = 0; z < D; z++) {
        this.setBlock(x, 0, z, BlockType.Bedrock);
      }
    }

    const levelStep = 8;
    const numLevels = Math.max(2, Math.floor((H - 16) / levelStep));
    const levelBlocks: number[] = [BlockType.OakPlanks, BlockType.Cobblestone, BlockType.Sand, BlockType.Snow, BlockType.Brick, BlockType.StoneBrick];

    const startY = 3;
    const startSize = 6;
    const startX = 3;
    const startZ = 3;

    for (let x = startX; x < startX + startSize && x < W - 1; x++) {
      for (let z = startZ; z < startZ + startSize && z < D - 1; z++) {
        for (let y = 1; y < startY; y++) this.setBlock(x, y, z, BlockType.Stone);
        this.setBlock(x, startY, z, BlockType.OakPlanks);
      }
    }

    let curX = startX + startSize;
    let curZ = startZ + Math.floor(startSize / 2);
    let curY = startY;

    for (let level = 0; level < numLevels; level++) {
      const surfaceBlock = levelBlocks[level % levelBlocks.length];
      const platformsPerLevel = 4 + Math.floor(rng() * 4);

      for (let p = 0; p < platformsPerLevel; p++) {
        const gap = 2 + Math.floor(rng() * 3);
        const pSize = 3 + Math.floor(rng() * 4);

        let dirX = 0, dirZ = 0;
        const dirRoll = rng();
        if (dirRoll < 0.5) { dirX = 1; }
        else if (dirRoll < 0.75) { dirX = -1; }
        else if (dirRoll < 0.875) { dirZ = 1; }
        else { dirZ = -1; }

        let nx = curX + dirX * gap;
        let nz = curZ + dirZ * gap;

        if (nx < 1 || nx + pSize >= W - 1 || nz < 1 || nz + pSize >= D - 1) {
          nx = 2 + Math.floor(rng() * Math.max(1, W - pSize - 4));
          nz = 2 + Math.floor(rng() * Math.max(1, D - pSize - 4));
        }

        for (let px = nx; px < nx + pSize && px < W - 1; px++) {
          for (let pz = nz; pz < nz + pSize && pz < D - 1; pz++) {
            if ((px === nx || px === nx + pSize - 1) && (pz === nz || pz === nz + pSize - 1)) {
              for (let y = 1; y < curY; y++) this.setBlock(px, y, pz, BlockType.Stone);
            }
            this.setBlock(px, curY, pz, surfaceBlock);
          }
        }
        curX = nx + pSize;
        curZ = nz + Math.floor(pSize / 2);
      }

      if (level < numLevels - 1) {
        const stepsCount = 2 + Math.floor(rng() * 2);
        for (let step = 0; step < stepsCount; step++) {
          const stepX = curX + 1 + step;
          const stepZ = curZ;
          const stepY = curY + 1 + Math.floor((step / stepsCount) * levelStep);
          if (stepX < W - 1 && stepZ >= 1 && stepZ < D - 1 && stepY < H - 2) {
            for (let dx = 0; dx < 2; dx++) {
              for (let dz = -1; dz <= 0; dz++) {
                const bx = stepX + dx;
                const bz = stepZ + dz;
                if (bx >= 1 && bx < W - 1 && bz >= 1 && bz < D - 1) {
                  for (let y = 1; y < stepY; y++) this.setBlock(bx, y, bz, BlockType.Stone);
                  this.setBlock(bx, stepY, bz, BlockType.OakPlanks);
                }
              }
            }
          }
        }
        curX += stepsCount + 1;
        curY += levelStep;
        if (curX >= W - 8) {
          curX = 3;
          curZ = 3 + Math.floor(rng() * Math.max(1, D - 10));
        }
      }
    }

    const finishY = curY;
    if (finishY < H - 4) {
      const finishSize = 6;
      const finishX = Math.max(2, Math.min(W - finishSize - 2, Math.floor(W / 2) - 3));
      const finishZ = Math.max(2, Math.min(D - finishSize - 2, Math.floor(D / 2) - 3));
      for (let x = finishX; x < finishX + finishSize && x < W - 1; x++) {
        for (let z = finishZ; z < finishZ + finishSize && z < D - 1; z++) {
          for (let y = 1; y <= finishY; y++) {
            this.setBlock(x, y, z, y === finishY ? BlockType.Snow : BlockType.Stone);
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
        let h = H * 0.30;
        h += Math.sin(nx * Math.PI * 3 + seed * 0.1) * H * 0.18;
        h += Math.cos(nz * Math.PI * 4 + seed * 0.2) * H * 0.14;
        h += Math.sin((nx + nz) * Math.PI * 5 + seed * 0.3) * H * 0.10;
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
      default: {
        let h = H * 0.22;
        h += Math.sin(nx * Math.PI * 3 + seed * 0.1) * H * 0.09;
        h += Math.cos(nz * Math.PI * 2.5 + seed * 0.2) * H * 0.07;
        h += Math.sin((nx + nz) * Math.PI * 5 + seed * 0.3) * H * 0.05;
        h += Math.sin(nx * Math.PI * 9 + nz * Math.PI * 7 + seed * 0.5) * H * 0.025;
        return Math.max(1, Math.min(H - 6, Math.floor(h)));
      }
    }
  }

  // ==========================================
  // Mesh Building (with emissive)
  // ==========================================

  buildChunkMesh(cx: number, cz: number): { vertices: number[]; normals: number[]; colors: number[]; indices: number[]; emissive: number[] } | null {
    const chunk = this.getChunk(cx, cz);
    if (!chunk || chunk.isEmpty()) return null;

    const vertices: number[] = [];
    const normals: number[] = [];
    const colors: number[] = [];
    const emissive: number[] = [];
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
          const em = bd.emissive || 0;

          const addFace = (face: string, color: number[]) => {
            this.addFaceDataAO(wx, ly, wz, face, color, em, vertices, normals, colors, emissive, indices, vertCount);
            vertCount += 4;
          };

          if (!this.isSolid(wx, ly + 1, wz)) addFace('top', bd.top);
          if (!this.isSolid(wx, ly - 1, wz)) addFace('bottom', bd.bottom);
          if (!this.isSolid(wx + 1, ly, wz)) addFace('east', bd.side);
          if (!this.isSolid(wx - 1, ly, wz)) addFace('west', bd.side);
          if (!this.isSolid(wx, ly, wz + 1)) addFace('south', bd.side);
          if (!this.isSolid(wx, ly, wz - 1)) addFace('north', bd.side);
        }
      }
    }

    chunk.dirty = false;
    return { vertices, normals, colors, indices, emissive };
  }

  private vertexAO(s1: boolean, s2: boolean, c: boolean): number {
    if (s1 && s2) return 0.35; // fully occluded corner
    const v = 3 - (s1 ? 1 : 0) - (s2 ? 1 : 0) - (c ? 1 : 0);
    return [0.55, 0.7, 0.85, 1.0][v];
  }

  private addFaceDataAO(x: number, y: number, z: number, face: string, color: number[], em: number,
    verts: number[], norms: number[], cols: number[], emis: number[], idx: number[], offset: number) {
    const faces: Record<string, { pos: number[][]; normal: number[]; ao: [number[], number[], number[]][] }> = {
      top: {
        pos: [[x,y+1,z],[x,y+1,z+1],[x+1,y+1,z+1],[x+1,y+1,z]], normal: [0,1,0],
        ao: [[[-1,1,0],[0,1,-1],[-1,1,-1]],[[-1,1,1],[0,1,2],[-1,1,2]],[[2,1,1],[1,1,2],[2,1,2]],[[2,1,0],[1,1,-1],[2,1,-1]]],
      },
      bottom: {
        pos: [[x,y,z+1],[x,y,z],[x+1,y,z],[x+1,y,z+1]], normal: [0,-1,0],
        ao: [[[-1,-1,1],[0,-1,2],[-1,-1,2]],[[-1,-1,0],[0,-1,-1],[-1,-1,-1]],[[2,-1,0],[1,-1,-1],[2,-1,-1]],[[2,-1,1],[1,-1,2],[2,-1,2]]],
      },
      east: {
        pos: [[x+1,y,z+1],[x+1,y,z],[x+1,y+1,z],[x+1,y+1,z+1]], normal: [1,0,0],
        ao: [[[1,0,2],[1,-1,1],[1,-1,2]],[[1,0,-1],[1,-1,0],[1,-1,-1]],[[1,2,-1],[1,1,0],[1,1,-1]],[[1,2,2],[1,1,1],[1,1,2]]],
      },
      west: {
        pos: [[x,y,z],[x,y,z+1],[x,y+1,z+1],[x,y+1,z]], normal: [-1,0,0],
        ao: [[[-1,0,-1],[-1,-1,0],[-1,-1,-1]],[[-1,0,2],[-1,-1,1],[-1,-1,2]],[[-1,2,2],[-1,1,1],[-1,1,2]],[[-1,2,-1],[-1,1,0],[-1,1,-1]]],
      },
      south: {
        pos: [[x,y,z+1],[x+1,y,z+1],[x+1,y+1,z+1],[x,y+1,z+1]], normal: [0,0,1],
        ao: [[[-1,0,1],[0,-1,1],[-1,-1,1]],[[2,0,1],[1,-1,1],[2,-1,1]],[[2,2,1],[1,1,1],[2,1,1]],[[-1,2,1],[0,1,1],[-1,1,1]]],
      },
      north: {
        pos: [[x+1,y,z],[x,y,z],[x,y+1,z],[x+1,y+1,z]], normal: [0,0,-1],
        ao: [[[2,0,-1],[1,-1,-1],[2,-1,-1]],[[-1,0,-1],[0,-1,-1],[-1,-1,-1]],[[-1,2,-1],[0,1,-1],[-1,1,-1]],[[2,2,-1],[1,1,-1],[2,1,-1]]],
      },
    };
    const f = faces[face];
    if (!f) return;
    for (let i = 0; i < 4; i++) {
      const p = f.pos[i];
      const ao = f.ao[i];
      const aoVal = this.vertexAO(
        this.isSolid(x + ao[0][0], y + ao[0][1], z + ao[0][2]),
        this.isSolid(x + ao[1][0], y + ao[1][1], z + ao[1][2]),
        this.isSolid(x + ao[2][0], y + ao[2][1], z + ao[2][2])
      );
      verts.push(p[0], p[1], p[2]);
      norms.push(f.normal[0], f.normal[1], f.normal[2]);
      // Modulate color by AO
      const aoFactor = em > 0 ? 1.0 : aoVal; // emissive blocks don't get AO
      cols.push(color[0] * aoFactor, color[1] * aoFactor, color[2] * aoFactor);
      emis.push(em);
    }
    idx.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
  }

  // ==========================================
  // Serialization
  // ==========================================

  serializeChunks(): Map<string, string> {
    const result = new Map<string, string>();
    for (const [key, chunk] of this.chunks) {
      if (!chunk.isEmpty()) result.set(key, chunk.serialize());
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
