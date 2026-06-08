// ==========================================
// Voxel World - block storage + mesh generation
// Supports serialization for save/load
// ==========================================

import { BlockType, BLOCK_COLORS } from './blocks';

export const WORLD_W = 32;
export const WORLD_H = 24;
export const WORLD_D = 32;

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
  blocks: Uint8Array;
  seed = 42;

  constructor(seed: number = 42) {
    this.seed = seed;
    this.blocks = new Uint8Array(WORLD_W * WORLD_H * WORLD_D);
  }

  private idx(x: number, y: number, z: number): number {
    return y * WORLD_W * WORLD_D + z * WORLD_W + x;
  }

  inBounds(x: number, y: number, z: number): boolean {
    return x >= 0 && x < WORLD_W && y >= 0 && y < WORLD_H && z >= 0 && z < WORLD_D;
  }

  getBlock(x: number, y: number, z: number): BlockType {
    if (!this.inBounds(x, y, z)) return BlockType.Air;
    return this.blocks[this.idx(x, y, z)] as BlockType;
  }

  setBlock(x: number, y: number, z: number, type: BlockType) {
    if (!this.inBounds(x, y, z)) return;
    this.blocks[this.idx(x, y, z)] = type;
  }

  isSolid(x: number, y: number, z: number): boolean {
    const b = this.getBlock(x, y, z);
    if (b === BlockType.Air) return false;
    return BLOCK_COLORS[b]?.solid ?? true;
  }

  generate(seed: number = this.seed) {
    this.seed = seed;
    const rng = seededRandom(seed);

    for (let x = 0; x < WORLD_W; x++) {
      for (let z = 0; z < WORLD_D; z++) {
        const nx = x / WORLD_W;
        const nz = z / WORLD_D;
        let h = 8;
        h += Math.sin(nx * Math.PI * 4 + seed * 0.1) * 2;
        h += Math.cos(nz * Math.PI * 3 + seed * 0.2) * 2;
        h += Math.sin((nx + nz) * Math.PI * 6 + seed * 0.3) * 1.5;
        h += Math.sin(nx * Math.PI * 10 + nz * Math.PI * 8 + seed * 0.5) * 0.5;
        h = Math.floor(h);
        h = Math.max(1, Math.min(WORLD_H - 6, h));

        for (let y = 0; y <= h; y++) {
          if (y === 0) this.setBlock(x, y, z, BlockType.Stone);
          else if (y === h) {
            this.setBlock(x, y, z, h <= 4 ? BlockType.Sand : BlockType.Grass);
          } else if (y >= h - 3) {
            this.setBlock(x, y, z, h <= 4 ? BlockType.Sand : BlockType.Dirt);
          } else {
            this.setBlock(x, y, z, BlockType.Stone);
          }
        }
      }
    }

    // Trees using seeded random
    const treeCount = 12 + Math.floor(rng() * 8);
    for (let i = 0; i < treeCount; i++) {
      const tx = 3 + Math.floor(rng() * (WORLD_W - 6));
      const tz = 3 + Math.floor(rng() * (WORLD_D - 6));
      let ty = 0;
      for (let y = WORLD_H - 1; y >= 0; y--) {
        if (this.getBlock(tx, y, tz) === BlockType.Grass) { ty = y + 1; break; }
      }
      if (ty < 6 || ty > WORLD_H - 8) continue;
      const trunkH = 3 + Math.floor(rng() * 2);
      for (let y = 0; y < trunkH; y++) this.setBlock(tx, ty + y, tz, BlockType.Wood);
      const leafR = 2;
      for (let dx = -leafR; dx <= leafR; dx++) {
        for (let dz = -leafR; dz <= leafR; dz++) {
          for (let dy = -1; dy <= leafR; dy++) {
            if (Math.abs(dx) === leafR && Math.abs(dz) === leafR && dy === leafR) continue;
            if (Math.sqrt(dx * dx + dy * dy + dz * dz) <= leafR + 0.5) {
              if (this.getBlock(tx + dx, ty + trunkH + dy, tz + dz) === BlockType.Air) {
                this.setBlock(tx + dx, ty + trunkH + dy, tz + dz, BlockType.Leaves);
              }
            }
          }
        }
      }
    }
  }

  buildMesh(): { vertices: number[]; normals: number[]; colors: number[]; indices: number[] } {
    const vertices: number[] = []; const normals: number[] = [];
    const colors: number[] = []; const indices: number[] = [];
    let vertCount = 0;

    for (let y = 0; y < WORLD_H; y++) {
      for (let z = 0; z < WORLD_D; z++) {
        for (let x = 0; x < WORLD_W; x++) {
          const block = this.getBlock(x, y, z);
          if (block === BlockType.Air) continue;
          const bd = BLOCK_COLORS[block];
          if (!bd) continue;

          if (!this.isSolid(x, y + 1, z)) { this.addFace(x, y, z, 'top', bd.top, vertices, normals, colors, indices, vertCount); vertCount += 4; }
          if (!this.isSolid(x, y - 1, z)) { this.addFace(x, y, z, 'bottom', bd.bottom, vertices, normals, colors, indices, vertCount); vertCount += 4; }
          if (!this.isSolid(x + 1, y, z)) { this.addFace(x, y, z, 'east', bd.side, vertices, normals, colors, indices, vertCount); vertCount += 4; }
          if (!this.isSolid(x - 1, y, z)) { this.addFace(x, y, z, 'west', bd.side, vertices, normals, colors, indices, vertCount); vertCount += 4; }
          if (!this.isSolid(x, y, z + 1)) { this.addFace(x, y, z, 'south', bd.side, vertices, normals, colors, indices, vertCount); vertCount += 4; }
          if (!this.isSolid(x, y, z - 1)) { this.addFace(x, y, z, 'north', bd.side, vertices, normals, colors, indices, vertCount); vertCount += 4; }
        }
      }
    }
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
    for (const p of f.pos) { verts.push(p[0], p[1], p[2]); norms.push(f.normal[0], f.normal[1], f.normal[2]); cols.push(color[0], color[1], color[2]); }
    idx.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
  }

  // --- Serialization ---
  serialize(): string {
    // Convert Uint8Array to base64
    let binary = '';
    for (let i = 0; i < this.blocks.length; i++) binary += String.fromCharCode(this.blocks[i]);
    return btoa(binary);
  }

  deserialize(data: string) {
    const binary = atob(data);
    this.blocks = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) this.blocks[i] = binary.charCodeAt(i);
  }
}
