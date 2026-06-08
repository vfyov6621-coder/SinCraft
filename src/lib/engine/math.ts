// ==========================================
// Lightweight 3D Engine - Math Library
// Optimized for weak PCs - no external deps
// Includes frustum culling for chunk rendering
// ==========================================

export type Vec3 = [number, number, number];
export type Mat4 = Float32Array;

export function vec3(x: number, y: number, z: number): Vec3 {
  return [x, y, z];
}

export function vec3Add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function vec3Sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function vec3Scale(v: Vec3, s: number): Vec3 {
  return [v[0] * s, v[1] * s, v[2] * s];
}

export function vec3Cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function vec3Dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function vec3Normalize(v: Vec3): Vec3 {
  const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  if (len === 0) return [0, 0, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
}

export function vec3Length(v: Vec3): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

export function mat4Identity(): Mat4 {
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ]);
}

export function mat4Perspective(fovY: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1.0 / Math.tan(fovY / 2);
  const rangeInv = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (near + far) * rangeInv, -1,
    0, 0, near * far * rangeInv * 2, 0,
  ]);
}

export function mat4LookAt(eye: Vec3, center: Vec3, up: Vec3): Mat4 {
  const z = vec3Normalize(vec3Sub(eye, center));
  const x = vec3Normalize(vec3Cross(up, z));
  const y = vec3Cross(z, x);
  return new Float32Array([
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -vec3Dot(x, eye), -vec3Dot(y, eye), -vec3Dot(z, eye), 1,
  ]);
}

export function mat4Multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Float32Array(16);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      out[j * 4 + i] =
        a[0 * 4 + i] * b[j * 4 + 0] +
        a[1 * 4 + i] * b[j * 4 + 1] +
        a[2 * 4 + i] * b[j * 4 + 2] +
        a[3 * 4 + i] * b[j * 4 + 3];
    }
  }
  return out;
}

export function mat4Translate(x: number, y: number, z: number): Mat4 {
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    x, y, z, 1,
  ]);
}

export function mat4Scale(x: number, y: number, z: number): Mat4 {
  return new Float32Array([
    x, 0, 0, 0,
    0, y, 0, 0,
    0, 0, z, 0,
    0, 0, 0, 1,
  ]);
}

export function mat4RotateY(angle: number): Mat4 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return new Float32Array([
    c, 0, s, 0,
    0, 1, 0, 0,
    -s, 0, c, 0,
    0, 0, 0, 1,
  ]);
}

export function mat4RotateX(angle: number): Mat4 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return new Float32Array([
    1, 0, 0, 0,
    0, c, -s, 0,
    0, s, c, 0,
    0, 0, 0, 1,
  ]);
}

export function mat4RotateZ(angle: number): Mat4 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return new Float32Array([
    c, -s, 0, 0,
    s, c, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ]);
}

export function mat4Transpose(m: Mat4): Mat4 {
  return new Float32Array([
    m[0], m[4], m[8], m[12],
    m[1], m[5], m[9], m[13],
    m[2], m[6], m[10], m[14],
    m[3], m[7], m[11], m[15],
  ]);
}

// ==========================================
// Frustum Culling
// Extract 6 clip planes from VP matrix
// ==========================================

/**
 * Extract 6 frustum planes from view-projection matrix.
 * Matrix is in column-major order (WebGL convention).
 * Returns Float32Array with 24 floats (6 planes x 4 components).
 * Each plane: [a, b, c, d] where ax + by + cz + d >= 0 means inside.
 */
export function extractFrustumPlanes(vp: Mat4): Float32Array {
  const planes = new Float32Array(24);

  // Column-major: m[col*4 + row]
  // Row 0: m[0], m[4], m[8], m[12]
  // Row 1: m[1], m[5], m[9], m[13]
  // Row 2: m[2], m[6], m[10], m[14]
  // Row 3: m[3], m[7], m[11], m[15]

  // Left: row3 + row0
  planes[0] = vp[3] + vp[0]; planes[1] = vp[7] + vp[4];
  planes[2] = vp[11] + vp[8]; planes[3] = vp[15] + vp[12];
  // Right: row3 - row0
  planes[4] = vp[3] - vp[0]; planes[5] = vp[7] - vp[4];
  planes[6] = vp[11] - vp[8]; planes[7] = vp[15] - vp[12];
  // Bottom: row3 + row1
  planes[8] = vp[3] + vp[1]; planes[9] = vp[7] + vp[5];
  planes[10] = vp[11] + vp[9]; planes[11] = vp[15] + vp[13];
  // Top: row3 - row1
  planes[12] = vp[3] - vp[1]; planes[13] = vp[7] - vp[5];
  planes[14] = vp[11] - vp[9]; planes[15] = vp[15] - vp[13];
  // Near: row3 + row2
  planes[16] = vp[3] + vp[2]; planes[17] = vp[7] + vp[6];
  planes[18] = vp[11] + vp[10]; planes[19] = vp[15] + vp[14];
  // Far: row3 - row2
  planes[20] = vp[3] - vp[2]; planes[21] = vp[7] - vp[6];
  planes[22] = vp[11] - vp[10]; planes[23] = vp[15] - vp[14];

  return planes;
}

/**
 * Test AABB against frustum planes.
 * Returns true if AABB is potentially visible (not fully outside any plane).
 * cx,cy,cz = center of AABB
 * hx,hy,hz = half-extents of AABB
 */
export function isAABBVisible(
  cx: number, cy: number, cz: number,
  hx: number, hy: number, hz: number,
  planes: Float32Array,
): boolean {
  for (let i = 0; i < 6; i++) {
    const base = i * 4;
    const a = planes[base];
    const b = planes[base + 1];
    const c = planes[base + 2];
    const d = planes[base + 3];
    // Pick the corner of AABB most negative along the plane normal
    const px = (a > 0) ? cx + hx : cx - hx;
    const py = (b > 0) ? cy + hy : cy - hy;
    const pz = (c > 0) ? cz + hz : cz - hz;
    if (a * px + b * py + c * pz + d < 0) return false;
  }
  return true;
}
