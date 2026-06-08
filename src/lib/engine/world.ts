// ==========================================
// Voxel World - block storage + mesh generation
// Optimized: only visible faces, rebuild on change
// ==========================================

import { BlockType, BLOCK_COLORS } from './blocks';

// World dimensions (small for weak PCs)
export const WORLD_W = 32;
export const WORLD_H = 24;
export const WORLD_D = 32;

export class VoxelWorld {
  // Flat array for fast access
  blocks: Uint8Array;

  constructor() {
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

  // Simple terrain generation with layered sine noise
  generate() {
    for (let x = 0; x < WORLD_W; x++) {
      for (let z = 0; z < WORLD_D; z++) {
        // Height from sum of sines (poor man's noise)
        const nx = x / WORLD_W;
        const nz = z / WORLD_D;
        let h = 8;
        h += Math.sin(nx * Math.PI * 4) * 2;
        h += Math.cos(nz * Math.PI * 3) * 2;
        h += Math.sin((nx + nz) * Math.PI * 6) * 1.5;
        h += Math.sin(nx * Math.PI * 10 + nz * Math.PI * 8) * 0.5;
        h = Math.floor(h);
        h = Math.max(1, Math.min(WORLD_H - 6, h));

        for (let y = 0; y <= h; y++) {
          if (y === 0) {
            this.setBlock(x, y, z, BlockType.Stone);
          } else if (y === h) {
            if (h <= 4) this.setBlock(x, y, z, BlockType.Sand);
            else this.setBlock(x, y, z, BlockType.Grass);
          } else if (y >= h - 3) {
            if (h <= 4) this.setBlock(x, y, z, BlockType.Sand);
            else this.setBlock(x, y, z, BlockType.Dirt);
          } else {
            this.setBlock(x, y, z, BlockType.Stone);
          }
        }

        // Water at level 4
        for (let y = 5; y <= 4; y++) {
          if (this.getBlock(x, y, z) === BlockType.Air) {
            this.setBlock(x, y, z, BlockType.Water);
          }
        }
      }
    }

    // Spawn some trees
    this.generateTrees();
  }

  private generateTrees() {
    const treeCount = 15;
    for (let i = 0; i < treeCount; i++) {
      const tx = 3 + Math.floor(Math.random() * (WORLD_W - 6));
      const tz = 3 + Math.floor(Math.random() * (WORLD_D - 6));
      // Find surface
      let ty = 0;
      for (let y = WORLD_H - 1; y >= 0; y--) {
        if (this.getBlock(tx, y, tz) === BlockType.Grass) {
          ty = y + 1;
          break;
        }
      }
      if (ty < 6 || ty > WORLD_H - 8) continue;

      const trunkH = 3 + Math.floor(Math.random() * 2);
      // Trunk
      for (let y = 0; y < trunkH; y++) {
        this.setBlock(tx, ty + y, tz, BlockType.Wood);
      }
      // Leaves (simple sphere-ish)
      const leafR = 2;
      for (let dx = -leafR; dx <= leafR; dx++) {
        for (let dz = -leafR; dz <= leafR; dz++) {
          for (let dy = -1; dy <= leafR; dy++) {
            if (Math.abs(dx) === leafR && Math.abs(dz) === leafR && dy === leafR) continue;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (dist <= leafR + 0.5) {
              const lx = tx + dx;
              const ly = ty + trunkH + dy;
              const lz = tz + dz;
              if (this.getBlock(lx, ly, lz) === BlockType.Air) {
                this.setBlock(lx, ly, lz, BlockType.Leaves);
              }
            }
          }
        }
      }
    }
  }

  // Build mesh - only exposed faces
  buildMesh(): { vertices: number[]; normals: number[]; colors: number[]; indices: number[] } {
    const vertices: number[] = [];
    const normals: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
    let vertCount = 0;

    for (let y = 0; y < WORLD_H; y++) {
      for (let z = 0; z < WORLD_D; z++) {
        for (let x = 0; x < WORLD_W; x++) {
          const block = this.getBlock(x, y, z);
          if (block === BlockType.Air) continue;

          const blockDef = BLOCK_COLORS[block];
          if (!blockDef) continue;

          // Check each face
          // +Y (top)
          if (!this.isSolid(x, y + 1, z)) {
            this.addFace(x, y, z, 'top', blockDef.top, vertices, normals, colors, indices, vertCount);
            vertCount += 4;
          }
          // -Y (bottom)
          if (!this.isSolid(x, y - 1, z)) {
            this.addFace(x, y, z, 'bottom', blockDef.bottom, vertices, normals, colors, indices, vertCount);
            vertCount += 4;
          }
          // +X
          if (!this.isSolid(x + 1, y, z)) {
            this.addFace(x, y, z, 'east', blockDef.side, vertices, normals, colors, indices, vertCount);
            vertCount += 4;
          }
          // -X
          if (!this.isSolid(x - 1, y, z)) {
            this.addFace(x, y, z, 'west', blockDef.side, vertices, normals, colors, indices, vertCount);
            vertCount += 4;
          }
          // +Z
          if (!this.isSolid(x, y, z + 1)) {
            this.addFace(x, y, z, 'south', blockDef.side, vertices, normals, colors, indices, vertCount);
            vertCount += 4;
          }
          // -Z
          if (!this.isSolid(x, y, z - 1)) {
            this.addFace(x, y, z, 'north', blockDef.side, vertices, normals, colors, indices, vertCount);
            vertCount += 4;
          }
        }
      }
    }

    return { vertices, normals, colors, indices };
  }

  private addFace(
    x: number, y: number, z: number,
    face: string,
    color: number[],
    verts: number[], norms: number[], cols: number[], idx: number[],
    offset: number,
  ) {
    // Face vertex positions (CCW winding for front-face)
    const faces: Record<string, { pos: number[][]; normal: number[] }> = {
      top:    { pos: [[x,y+1,z], [x,y+1,z+1], [x+1,y+1,z+1], [x+1,y+1,z]], normal: [0,1,0] },
      bottom: { pos: [[x,y,z+1], [x,y,z], [x+1,y,z], [x+1,y,z+1]], normal: [0,-1,0] },
      east:   { pos: [[x+1,y,z+1], [x+1,y,z], [x+1,y+1,z], [x+1,y+1,z+1]], normal: [1,0,0] },
      west:   { pos: [[x,y,z], [x,y,z+1], [x,y+1,z+1], [x,y+1,z]], normal: [-1,0,0] },
      south:  { pos: [[x,y,z+1], [x+1,y,z+1], [x+1,y+1,z+1], [x,y+1,z+1]], normal: [0,0,1] },
      north:  { pos: [[x+1,y,z], [x,y,z], [x,y+1,z], [x+1,y+1,z]], normal: [0,0,-1] },
    };

    const f = faces[face];
    if (!f) return;

    for (const p of f.pos) {
      verts.push(p[0], p[1], p[2]);
      norms.push(f.normal[0], f.normal[1], f.normal[2]);
      cols.push(color[0], color[1], color[2]);
    }

    // Two triangles per quad
    idx.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
  }

  // Count solid blocks
  countBlocks(): number {
    let count = 0;
    for (let i = 0; i < this.blocks.length; i++) {
      if (this.blocks[i] !== BlockType.Air) count++;
    }
    return count;
  }
}
