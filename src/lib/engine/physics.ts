// ==========================================
// Player Physics - gravity, jumping, AABB collision
// ==========================================

import { VoxelWorld, WORLD_W, WORLD_D } from './world';

export interface AABB {
  minX: number; minY: number; minZ: number;
  maxX: number; maxY: number; maxZ: number;
}

export class PlayerPhysics {
  // Position (feet)
  x = 16;
  y = 20;
  z = 16;

  // Velocity
  vx = 0;
  vy = 0;
  vz = 0;

  // Constants
  moveSpeed = 5.0;
  jumpSpeed = 7.5;
  gravity = -20;
  terminalVel = -30;
  eyeHeight = 1.62;
  width = 0.3; // half-width (total 0.6)
  height = 1.7;

  // State
  onGround = false;
  yaw = 0;
  pitch = 0;

  moveForward = false;
  moveBackward = false;
  moveLeft = false;
  moveRight = false;
  wantJump = false;

  update(dt: number, world: VoxelWorld) {
    dt = Math.min(dt, 0.05); // cap dt

    // --- Horizontal movement ---
    const forward = this.getForward();
    const right = this.getRight();

    this.vx = 0;
    this.vz = 0;

    if (this.moveForward) {
      this.vx += forward[0] * this.moveSpeed;
      this.vz += forward[2] * this.moveSpeed;
    }
    if (this.moveBackward) {
      this.vx -= forward[0] * this.moveSpeed;
      this.vz -= forward[2] * this.moveSpeed;
    }
    if (this.moveLeft) {
      this.vx -= right[0] * this.moveSpeed;
      this.vz -= right[2] * this.moveSpeed;
    }
    if (this.moveRight) {
      this.vx += right[0] * this.moveSpeed;
      this.vz += right[2] * this.moveSpeed;
    }

    // --- Jump ---
    if (this.wantJump && this.onGround) {
      this.vy = this.jumpSpeed;
      this.onGround = false;
    }

    // --- Gravity ---
    this.vy += this.gravity * dt;
    if (this.vy < this.terminalVel) this.vy = this.terminalVel;

    // --- Move with collision on each axis ---
    this.onGround = false;

    // X axis
    this.x += this.vx * dt;
    if (this.collides(world)) {
      this.x -= this.vx * dt;
      this.vx = 0;
    }

    // Z axis
    this.z += this.vz * dt;
    if (this.collides(world)) {
      this.z -= this.vz * dt;
      this.vz = 0;
    }

    // Y axis
    this.y += this.vy * dt;
    if (this.collides(world)) {
      this.y -= this.vy * dt;
      if (this.vy < 0) this.onGround = true;
      this.vy = 0;
    }

    // Clamp to world bounds
    const w = 0.01;
    this.x = Math.max(w, Math.min(WORLD_W - w, this.x));
    this.z = Math.max(w, Math.min(WORLD_D - w, this.z));
    if (this.y < 0) { this.y = 20; this.vy = 0; } // respawn if fell
  }

  getForward(): [number, number, number] {
    return [
      Math.sin(this.yaw) * Math.cos(this.pitch),
      0, // no vertical component for movement
      -Math.cos(this.yaw) * Math.cos(this.pitch),
    ];
  }

  getRight(): [number, number, number] {
    const fwd = this.getForward();
    // cross(up, fwd)
    return [
      fwd[2], 0, -fwd[0],
    ];
  }

  getLookDir(): [number, number, number] {
    return [
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch),
    ];
  }

  getEyePos(): [number, number, number] {
    return [this.x, this.y + this.eyeHeight, this.z];
  }

  collides(world: VoxelWorld): boolean {
    const hw = this.width;
    const h = this.height;

    // Check all block positions the player AABB overlaps
    const minBX = Math.floor(this.x - hw);
    const maxBX = Math.floor(this.x + hw);
    const minBY = Math.floor(this.y);
    const maxBY = Math.floor(this.y + h);
    const minBZ = Math.floor(this.z - hw);
    const maxBZ = Math.floor(this.z + hw);

    for (let bx = minBX; bx <= maxBX; bx++) {
      for (let by = minBY; by <= maxBY; by++) {
        for (let bz = minBZ; bz <= maxBZ; bz++) {
          if (world.isSolid(bx, by, bz)) {
            // AABB vs block overlap check
            if (this.x + hw > bx && this.x - hw < bx + 1 &&
                this.y + h > by && this.y < by + 1 &&
                this.z + hw > bz && this.z - hw < bz + 1) {
              return true;
            }
          }
        }
      }
    }
    return false;
  }
}
