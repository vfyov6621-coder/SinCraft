// ==========================================
// Player Physics - gravity, jumping, AABB collision
// Supports flight mode (double-space toggle)
// ==========================================

import { VoxelWorld } from './world';

export class PlayerPhysics {
  x = 16; y = 20; z = 16;
  vx = 0; vy = 0; vz = 0;

  moveSpeed = 5.0;
  flySpeed = 8.0;
  jumpSpeed = 7.5;
  gravity = -20;
  terminalVel = -30;
  eyeHeight = 1.62;
  width = 0.3;
  height = 1.7;

  onGround = false;
  yaw = 0;
  pitch = 0;

  moveForward = false;
  moveBackward = false;
  moveLeft = false;
  moveRight = false;
  wantJump = false;
  wantSneak = false; // shift key

  // Flight mode
  flying = false;
  private lastSpacePress = 0;
  private spaceJustPressed = false;

  // Callback for flight toggle notification
  onFlightToggle?: (flying: boolean) => void;

  update(dt: number, world: VoxelWorld) {
    dt = Math.min(dt, 0.05);

    if (this.flying) {
      this.updateFlying(dt, world);
    } else {
      this.updateWalking(dt, world);
    }

    // Clamp to world bounds
    const w = this.width + 0.01;
    this.x = Math.max(w, Math.min(world.worldWidth - w, this.x));
    this.z = Math.max(w, Math.min(world.worldDepth - w, this.z));
    if (this.y < -10) {
      const spawn = world.findSpawnPoint();
      this.x = spawn.x; this.y = spawn.y; this.z = spawn.z;
      this.vx = 0; this.vy = 0; this.vz = 0;
    }
  }

  private updateWalking(dt: number, world: VoxelWorld) {
    const forward = this.getForward();
    const right = this.getRight();

    this.vx = 0;
    this.vz = 0;

    if (this.moveForward) { this.vx += forward[0] * this.moveSpeed; this.vz += forward[2] * this.moveSpeed; }
    if (this.moveBackward) { this.vx -= forward[0] * this.moveSpeed; this.vz -= forward[2] * this.moveSpeed; }
    if (this.moveLeft) { this.vx -= right[0] * this.moveSpeed; this.vz -= right[2] * this.moveSpeed; }
    if (this.moveRight) { this.vx += right[0] * this.moveSpeed; this.vz += right[2] * this.moveSpeed; }

    if (this.wantJump && this.onGround) { this.vy = this.jumpSpeed; this.onGround = false; }
    this.vy += this.gravity * dt;
    if (this.vy < this.terminalVel) this.vy = this.terminalVel;

    this.onGround = false;
    this.x += this.vx * dt;
    if (this.collides(world)) { this.x -= this.vx * dt; this.vx = 0; }
    this.z += this.vz * dt;
    if (this.collides(world)) { this.z -= this.vz * dt; this.vz = 0; }
    this.y += this.vy * dt;
    if (this.collides(world)) { this.y -= this.vy * dt; if (this.vy < 0) this.onGround = true; this.vy = 0; }
  }

  private updateFlying(dt: number, world: VoxelWorld) {
    const lookDir = this.getLookDir();
    // Forward/backward along look direction (horizontal + vertical)
    const speed = this.flySpeed;

    this.vx = 0; this.vy = 0; this.vz = 0;

    if (this.moveForward) {
      this.vx += lookDir[0] * speed;
      this.vy += lookDir[1] * speed;
      this.vz += lookDir[2] * speed;
    }
    if (this.moveBackward) {
      this.vx -= lookDir[0] * speed;
      this.vy -= lookDir[1] * speed;
      this.vz -= lookDir[2] * speed;
    }
    if (this.moveLeft) { this.vx -= this.getRight()[0] * speed; this.vz -= this.getRight()[2] * speed; }
    if (this.moveRight) { this.vx += this.getRight()[0] * speed; this.vz += this.getRight()[2] * speed; }

    // Space = up, Shift = down
    if (this.wantJump) this.vy += speed;
    if (this.wantSneak) this.vy -= speed;

    // Apply movement
    this.x += this.vx * dt;
    if (this.collides(world)) { this.x -= this.vx * dt; }
    this.z += this.vz * dt;
    if (this.collides(world)) { this.z -= this.vz * dt; }
    this.y += this.vy * dt;
    if (this.collides(world)) { this.y -= this.vy * dt; }

    // Stay above ground in fly mode (don't clip through floor)
    if (this.y < 0) this.y = 0;
  }

  // Handle space press for double-tap flight toggle
  handleSpacePress(now: number): boolean {
    // Double-tap detection (within 300ms)
    if (now - this.lastSpacePress < 300) {
      this.flying = !this.flying;
      this.vy = 0; // reset vertical velocity on toggle
      if (this.onFlightToggle) this.onFlightToggle(this.flying);
      this.lastSpacePress = 0; // reset to prevent triple-tap
      return true; // consumed by flight toggle
    }
    this.lastSpacePress = now;
    return false; // normal jump
  }

  getForward(): [number, number, number] {
    return [Math.sin(this.yaw), 0, -Math.cos(this.yaw)];
  }

  getRight(): [number, number, number] {
    return [Math.cos(this.yaw), 0, Math.sin(this.yaw)];
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
    const hw = this.width; const h = this.height;
    const minBX = Math.floor(this.x - hw); const maxBX = Math.floor(this.x + hw);
    const minBY = Math.floor(this.y); const maxBY = Math.floor(this.y + h);
    const minBZ = Math.floor(this.z - hw); const maxBZ = Math.floor(this.z + hw);
    for (let bx = minBX; bx <= maxBX; bx++) {
      for (let by = minBY; by <= maxBY; by++) {
        for (let bz = minBZ; bz <= maxBZ; bz++) {
          if (world.isSolid(bx, by, bz)) {
            if (this.x + hw > bx && this.x - hw < bx + 1 &&
                this.y + h > by && this.y < by + 1 &&
                this.z + hw > bz && this.z - hw < bz + 1) return true;
          }
        }
      }
    }
    return false;
  }
}
