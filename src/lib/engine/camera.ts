// ==========================================
// Lightweight 3D Engine - First-Person Camera
// WASD + Mouse Look (Pointer Lock)
// ==========================================

import { Vec3, vec3, vec3Add, vec3Sub, vec3Cross, vec3Normalize, vec3Dot, Mat4, mat4LookAt } from './math';

export class Camera {
  position: Vec3;
  yaw: number = 0;   // rotation around Y axis (radians)
  pitch: number = 0;  // rotation around X axis (radians)

  // Movement config
  moveSpeed: number = 5.0;
  lookSpeed: number = 0.002;

  // Key state
  private keys: Set<string> = new Set();
  private locked: boolean = false;

  // World up
  private worldUp: Vec3 = [0, 1, 0];

  constructor(x: number = 0, y: number = 1.7, z: number = 8) {
    this.position = [x, y, z];
  }

  // --- Input handlers ---
  onKeyDown = (e: KeyboardEvent) => {
    this.keys.add(e.code);
  };

  onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  onMouseMove = (e: MouseEvent) => {
    if (!this.locked) return;
    this.yaw -= e.movementX * this.lookSpeed;
    this.pitch -= e.movementY * this.lookSpeed;
    // Clamp pitch
    this.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.pitch));
  };

  onClick = (canvas: HTMLCanvasElement) => {
    canvas.requestPointerLock();
  };

  onPointerLockChange = () => {
    this.locked = document.pointerLockElement !== null;
  };

  attach(canvas: HTMLCanvasElement) {
    document.addEventListener('keydown', this.onKeyDown);
    document.addEventListener('keyup', this.onKeyUp);
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    canvas.addEventListener('click', () => this.onClick(canvas));
  }

  detach() {
    document.removeEventListener('keydown', this.onKeyDown);
    document.removeEventListener('keyup', this.onKeyUp);
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
  }

  // --- Update movement ---
  update(dt: number) {
    const forward = this.getForward();
    const right = this.getRight();

    const speed = this.moveSpeed * dt;

    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) {
      this.position = vec3Add(this.position, vec3Scale(forward, speed));
    }
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) {
      this.position = vec3Sub(this.position, vec3Scale(forward, speed));
    }
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) {
      this.position = vec3Sub(this.position, vec3Scale(right, speed));
    }
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) {
      this.position = vec3Add(this.position, vec3Scale(right, speed));
    }
    if (this.keys.has('Space')) {
      this.position[1] += speed;
    }
    if (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')) {
      this.position[1] -= speed;
    }

    // Clamp height
    this.position[1] = Math.max(0.3, Math.min(30, this.position[1]));
  }

  getForward(): Vec3 {
    return vec3Normalize([
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch),
    ]);
  }

  getRight(): Vec3 {
    return vec3Normalize(vec3Cross(this.getForward(), this.worldUp));
  }

  getViewMatrix(): Mat4 {
    const forward = this.getForward();
    const target = vec3Add(this.position, forward);
    return mat4LookAt(this.position, target, this.worldUp);
  }
}

function vec3Scale(v: Vec3, s: number): Vec3 {
  return [v[0] * s, v[1] * s, v[2] * s];
}
