// ==========================================
// DDA Raycasting through voxel grid
// Returns the block the ray hits and the face normal
// ==========================================

import { VoxelWorld } from './world';

export interface RayHit {
  x: number; y: number; z: number;       // block position
  nx: number; ny: number; nz: number;     // face normal (direction the face faces)
  placeX: number; placeY: number; placeZ: number; // adjacent block for placement
}

export function raycast(
  world: VoxelWorld,
  ox: number, oy: number, oz: number,     // ray origin
  dx: number, dy: number, dz: number,     // ray direction (normalized)
  maxDist: number = 8,
): RayHit | null {
  // Current voxel
  let x = Math.floor(ox);
  let y = Math.floor(oy);
  let z = Math.floor(oz);

  // Direction of stepping
  const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
  const stepZ = dz > 0 ? 1 : dz < 0 ? -1 : 0;

  // How far along ray to cross one voxel per axis
  const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  const tDeltaZ = dz !== 0 ? Math.abs(1 / dz) : Infinity;

  // Distance to next voxel boundary
  let tMaxX = dx !== 0
    ? ((dx > 0 ? (x + 1 - ox) : (ox - x)) * tDeltaX)
    : Infinity;
  let tMaxY = dy !== 0
    ? ((dy > 0 ? (y + 1 - oy) : (oy - y)) * tDeltaY)
    : Infinity;
  let tMaxZ = dz !== 0
    ? ((dz > 0 ? (z + 1 - oz) : (oz - z)) * tDeltaZ)
    : Infinity;

  let dist = 0;
  let nx = 0, ny = 0, nz = 0;

  for (let i = 0; i < 200 && dist < maxDist; i++) {
    // Check current voxel
    if (world.isSolid(x, y, z)) {
      return {
        x, y, z,
        nx, ny, nz,
        placeX: x + nx,
        placeY: y + ny,
        placeZ: z + nz,
      };
    }

    // Advance to next voxel boundary
    if (tMaxX < tMaxY) {
      if (tMaxX < tMaxZ) {
        x += stepX;
        dist = tMaxX;
        tMaxX += tDeltaX;
        nx = -stepX; ny = 0; nz = 0;
      } else {
        z += stepZ;
        dist = tMaxZ;
        tMaxZ += tDeltaZ;
        nx = 0; ny = 0; nz = -stepZ;
      }
    } else {
      if (tMaxY < tMaxZ) {
        y += stepY;
        dist = tMaxY;
        tMaxY += tDeltaY;
        nx = 0; ny = -stepY; nz = 0;
      } else {
        z += stepZ;
        dist = tMaxZ;
        tMaxZ += tDeltaZ;
        nx = 0; ny = 0; nz = -stepZ;
      }
    }
  }

  return null;
}
