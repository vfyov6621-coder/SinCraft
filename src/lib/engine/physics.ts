// ==========================================
// SinCraft - Player Physics
// Walking, sprinting, flying, AABB collision
// Survival: health, hunger, fall damage
// ==========================================

import { VoxelWorld } from './world';

export class PlayerPhysics {
  x = 16; y = 20; z = 16;
  vx = 0; vy = 0; vz = 0;

  moveSpeed = 4.3;
  sprintSpeed = 6.0;
  flySpeed = 10.0;
  jumpSpeed = 7.5;
  gravity = -22;
  terminalVel = -40;
  eyeHeight = 1.62;
  width = 0.3;
  height = 1.8;

  onGround = false;
  yaw = 0;
  pitch = 0;

  // Movement flags
  moveForward = false;
  moveBackward = false;
  moveLeft = false;
  moveRight = false;
  wantJump = false;
  wantSneak = false;
  wantSprint = false;

  // Flying
  flying = false;
  flyHeld = false; // space held down in flying mode

  // Survival
  health = 20;
  maxHealth = 20;
  hunger = 20;
  maxHunger = 20;
  lastFallY = 0; // track fall start Y for fall damage
  inWater = false;

  // Damage cooldown
  damageCooldown = 0;
  hurtTimer = 0; // red flash

  update(dt: number, world: VoxelWorld) {
    dt = Math.min(dt, 0.05);

    // Cooldowns
    if (this.damageCooldown > 0) this.damageCooldown -= dt;
    if (this.hurtTimer > 0) this.hurtTimer -= dt;

    // Check if in water
    this.inWater = this.isInWater(world);

    if (this.flying) {
      this.updateFlying(dt, world);
    } else {
      this.updateWalking(dt, world);
    }

    // Hunger drain (slow, ~1 per 30 seconds)
    // Handled externally for control

    // World bounds
    const w = this.width + 0.01;
    this.x = Math.max(w, Math.min(world.worldWidth - w, this.x));
    this.z = Math.max(w, Math.min(world.worldDepth - w, this.z));

    // Void death
    if (this.y < -10) {
      this.takeDamage(100, world);
    }
  }

  private updateWalking(dt: number, world: VoxelWorld) {
    const forward = this.getForward();
    const right = this.getRight();
    const speed = this.wantSprint && this.moveForward && !this.wantSneak ? this.sprintSpeed : this.moveSpeed;

    this.vx = 0;
    this.vz = 0;

    if (this.moveForward) { this.vx += forward[0] * speed; this.vz += forward[2] * speed; }
    if (this.moveBackward) { this.vx -= forward[0] * speed * 0.6; this.vz -= forward[2] * speed * 0.6; }
    if (this.moveLeft) { this.vx -= right[0] * speed; this.vz -= right[2] * speed; }
    if (this.moveRight) { this.vx += right[0] * speed; this.vz += right[2] * speed; }

    // Jump (only if on ground, or swimming)
    if (this.wantJump && (this.onGround || this.inWater)) {
      if (this.inWater) {
        this.vy = 3.5; // slower in water
      } else {
        this.vy = this.jumpSpeed;
      }
      this.onGround = false;
    }

    // Gravity
    if (this.inWater) {
      this.vy += this.gravity * dt * 0.15; // reduced gravity in water
      this.vy = Math.max(this.vy, -2); // terminal in water
      // Swim up if holding jump
      if (this.wantJump) this.vy = Math.max(this.vy, 2);
    } else {
      this.vy += this.gravity * dt;
      if (this.vy < this.terminalVel) this.vy = this.terminalVel;
    }

    // Track fall start
    if (this.onGround) {
      this.lastFallY = this.y;
    }

    // Move with collision
    this.onGround = false;
    this.x += this.vx * dt;
    if (this.collides(world)) { this.x -= this.vx * dt; this.vx = 0; }
    this.z += this.vz * dt;
    if (this.collides(world)) { this.z -= this.vz * dt; this.vz = 0; }
    this.y += this.vy * dt;
    if (this.collides(world)) {
      this.y -= this.vy * dt;
      if (this.vy < 0) {
        this.onGround = true;
        // Fall damage: more than 3 blocks
        const fallDist = this.lastFallY - this.y;
        if (fallDist > 3 && !this.inWater) {
          const dmg = Math.floor(fallDist - 3);
          this.takeDamage(dmg, world);
        }
      }
      this.vy = 0;
    }
  }

  private updateFlying(dt: number, world: VoxelWorld) {
    const lookDir = this.getLookDir();
    const speed = this.flySpeed;
    const forward = this.getForward();
    const right = this.getRight();

    this.vx = 0; this.vy = 0; this.vz = 0;

    // Horizontal movement
    if (this.moveForward) { this.vx += forward[0] * speed; this.vz += forward[2] * speed; }
    if (this.moveBackward) { this.vx -= forward[0] * speed; this.vz -= forward[2] * speed; }
    if (this.moveLeft) { this.vx -= right[0] * speed; this.vz -= right[2] * speed; }
    if (this.moveRight) { this.vx += right[0] * speed; this.vz += right[2] * speed; }

    // Vertical: space up, shift down
    if (this.wantJump) this.vy += speed;
    if (this.wantSneak) this.vy -= speed;

    // Move with collision
    this.x += this.vx * dt;
    if (this.collides(world)) this.x -= this.vx * dt;
    this.z += this.vz * dt;
    if (this.collides(world)) this.z -= this.vz * dt;
    this.y += this.vy * dt;
    if (this.collides(world)) this.y -= this.vy * dt;
    if (this.y < 0) this.y = 0;
  }

  takeDamage(amount: number, world: VoxelWorld): void {
    if (this.damageCooldown > 0) return;
    this.health = Math.max(0, this.health - amount);
    this.damageCooldown = 0.5;
    this.hurtTimer = 0.3;
    // Knockback slightly upward
    this.vy = 4;
  }

  heal(amount: number): void {
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  private isInWater(world: VoxelWorld): boolean {
    const eyeY = Math.floor(this.y + this.eyeHeight);
    return world.getBlock(Math.floor(this.x), eyeY, Math.floor(this.z)) !== 0 &&
           !world.isSolid(Math.floor(this.x), eyeY, Math.floor(this.z));
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
