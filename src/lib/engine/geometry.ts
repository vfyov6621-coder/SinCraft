// ==========================================
// Lightweight 3D Engine - Geometry Generator
// Low-poly meshes for weak PCs
// ==========================================

export interface MeshData {
  vertices: number[];     // flat array: x,y,z per vertex
  normals: number[];       // flat array: nx,ny,nz per vertex
  colors: number[];        // flat array: r,g,b per vertex
  indices: number[];       // triangle indices
  vertexCount: number;
  triangleCount: number;
}

// --- Color helpers ---
function r(c: number): number { return ((c >> 16) & 0xff) / 255; }
function g(c: number): number { return ((c >> 8) & 0xff) / 255; }
function b(c: number): number { return (c & 0xff) / 255; }

// --- Cube (12 triangles) ---
export function createCube(color: number = 0x66aa66): MeshData {
  const s = 0.5;
  // 6 faces, each face = 2 triangles = 4 unique vertices
  const faceVerts: number[][] = [
    // Front (+Z)
    [-s, -s, s], [s, -s, s], [s, s, s], [-s, s, s],
    // Back (-Z)
    [s, -s, -s], [-s, -s, -s], [-s, s, -s], [s, s, -s],
    // Top (+Y)
    [-s, s, s], [s, s, s], [s, s, -s], [-s, s, -s],
    // Bottom (-Y)
    [-s, -s, -s], [s, -s, -s], [s, -s, s], [-s, -s, s],
    // Right (+X)
    [s, -s, s], [s, -s, -s], [s, s, -s], [s, s, s],
    // Left (-X)
    [-s, -s, -s], [-s, -s, s], [-s, s, s], [-s, s, -s],
  ];
  const faceNormals: number[][] = [
    [0, 0, 1], [0, 0, -1], [0, 1, 0],
    [0, -1, 0], [1, 0, 0], [-1, 0, 0],
  ];

  const vertices: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  for (let f = 0; f < 6; f++) {
    const baseIdx = f * 4;
    const n = faceNormals[f];
    for (let v = 0; v < 4; v++) {
      const vt = faceVerts[baseIdx + v];
      vertices.push(...vt);
      normals.push(...n);
      colors.push(r(color), g(color), b(color));
    }
    indices.push(
      baseIdx, baseIdx + 1, baseIdx + 2,
      baseIdx, baseIdx + 2, baseIdx + 3,
    );
  }

  return {
    vertices, normals, colors, indices,
    vertexCount: 24,
    triangleCount: 12,
  };
}

// --- Pyramid (6 triangles) ---
export function createPyramid(color: number = 0xccaa44): MeshData {
  const s = 0.5;
  const h = 0.8;
  const apex = [0, h, 0];
  const base = [
    [-s, 0, -s], [s, 0, -s], [s, 0, s], [-s, 0, s],
  ];

  const vertices: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  // 4 side faces
  for (let i = 0; i < 4; i++) {
    const v1 = base[i];
    const v2 = base[(i + 1) % 4];
    const edge1 = vecSub(v2, v1);
    const edge2 = vecSub(apex, v1);
    const normal = vecNormalize(vecCross(edge1, edge2));

    const baseIdx = i * 3;
    vertices.push(...v1, ...v2, ...apex);
    normals.push(...normal, ...normal, ...normal);
    colors.push(r(color), g(color), b(color), r(color), g(color), b(color), r(color), g(color), b(color));
    indices.push(baseIdx, baseIdx + 1, baseIdx + 2);
  }

  // Base (2 triangles)
  const baseStart = 12;
  const baseNormal = [0, -1, 0];
  vertices.push(...base[3], ...base[2], ...base[1], ...base[0]);
  for (let i = 0; i < 4; i++) {
    normals.push(...baseNormal);
    colors.push(r(color) * 0.6, g(color) * 0.6, b(color) * 0.6);
  }
  indices.push(baseStart, baseStart + 1, baseStart + 2, baseStart, baseStart + 2, baseStart + 3);

  return {
    vertices, normals, colors, indices,
    vertexCount: 16,
    triangleCount: 6,
  };
}

// --- Low-poly Icosphere (subdivision 1 = 80 triangles) ---
export function createIcosphere(radius: number = 0.5, subdivisions: number = 1, color: number = 0x4488cc): MeshData {
  const t = (1 + Math.sqrt(5)) / 2;

  let positions: number[][] = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ];

  let faces: number[][] = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];

  // Normalize to unit sphere
  positions = positions.map(p => {
    const len = Math.sqrt(p[0] * p[0] + p[1] * p[1] + p[2] * p[2]);
    return [p[0] / len, p[1] / len, p[2] / len];
  });

  // Subdivide
  const midPointCache: Record<string, number> = {};
  function getMidPoint(i1: number, i2: number): number {
    const key = Math.min(i1, i2) + '_' + Math.max(i1, i2);
    if (key in midPointCache) return midPointCache[key];
    const p1 = positions[i1];
    const p2 = positions[i2];
    const mid: number[] = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2, (p1[2] + p2[2]) / 2];
    const len = Math.sqrt(mid[0] * mid[0] + mid[1] * mid[1] + mid[2] * mid[2]);
    mid[0] /= len; mid[1] /= len; mid[2] /= len;
    const idx = positions.length;
    positions.push(mid);
    midPointCache[key] = idx;
    return idx;
  }

  for (let s = 0; s < subdivisions; s++) {
    const newFaces: number[][] = [];
    for (const face of faces) {
      const a = getMidPoint(face[0], face[1]);
      const b = getMidPoint(face[1], face[2]);
      const c = getMidPoint(face[2], face[0]);
      newFaces.push([face[0], a, c], [face[1], b, a], [face[2], c, b], [a, b, c]);
    }
    faces = newFaces;
  }

  // Build flat arrays
  const vertices: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  for (const face of faces) {
    const baseIdx = vertices.length / 3;
    for (const vi of face) {
      const p = positions[vi];
      vertices.push(p[0] * radius, p[1] * radius, p[2] * radius);
      // Normal = position for sphere
      normals.push(p[0], p[1], p[2]);
      colors.push(r(color), g(color), b(color));
    }
    indices.push(baseIdx, baseIdx + 1, baseIdx + 2);
  }

  return {
    vertices, normals, colors, indices,
    vertexCount: faces.length * 3,
    triangleCount: faces.length,
  };
}

// --- Ground plane (flat terrain grid) ---
export function createTerrain(
  width: number = 40,
  depth: number = 40,
  segments: number = 20,
  color1: number = 0x445533,
  color2: number = 0x556644,
): MeshData {
  const vertices: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  const halfW = width / 2;
  const halfD = depth / 2;
  const stepX = width / segments;
  const stepZ = depth / segments;

  for (let iz = 0; iz <= segments; iz++) {
    for (let ix = 0; ix <= segments; ix++) {
      const x = -halfW + ix * stepX;
      const z = -halfD + iz * stepZ;
      // Slight height variation for visual interest
      const y = Math.sin(x * 0.3) * 0.2 + Math.cos(z * 0.3) * 0.15;
      vertices.push(x, y, z);
      normals.push(0, 1, 0); // flat shading approximation
      // Checkerboard pattern
      const check = (ix + iz) % 2 === 0;
      const c = check ? color1 : color2;
      colors.push(r(c), g(c), b(c));
    }
  }

  for (let iz = 0; iz < segments; iz++) {
    for (let ix = 0; ix < segments; ix++) {
      const a = iz * (segments + 1) + ix;
      const b = a + 1;
      const c = a + (segments + 1);
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  return {
    vertices, normals, colors, indices,
    vertexCount: (segments + 1) * (segments + 1),
    triangleCount: segments * segments * 2,
  };
}

// --- Low-poly tree (trunk cone + crown cone) ---
export function createTree(trunkColor: number = 0x885533, crownColor: number = 0x337733): MeshData {
  const segments = 6;
  const vertices: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  // Trunk: cylinder approximation
  const trunkH = 0.6;
  const trunkR = 0.08;
  const trunkBase = vertices.length / 3;

  // Top center vertex
  vertices.push(0, trunkH, 0);
  normals.push(0, 1, 0);
  colors.push(r(trunkColor), g(trunkColor), b(trunkColor));

  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const x = Math.cos(angle) * trunkR;
    const z = Math.sin(angle) * trunkR;
    vertices.push(x, 0, z);
    const nx = Math.cos(angle);
    const nz = Math.sin(angle);
    normals.push(nx, 0, nz);
    colors.push(r(trunkColor), g(trunkColor), b(trunkColor));
  }

  for (let i = 0; i < segments; i++) {
    indices.push(trunkBase, trunkBase + 1 + i, trunkBase + 1 + (i + 1) % segments);
  }

  // Crown: cone
  const crownR = 0.35;
  const crownH = 1.2;
  const crownBase = vertices.length / 3;

  vertices.push(0, trunkH + crownH, 0);
  normals.push(0, 1, 0);
  colors.push(r(crownColor), g(crownColor), b(crownColor));

  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const x = Math.cos(angle) * crownR;
    const z = Math.sin(angle) * crownR;
    vertices.push(x, trunkH, z);
    const nx = Math.cos(angle);
    const nz = Math.sin(angle);
    normals.push(nx, 0.4, nz);
    colors.push(r(crownColor), g(crownColor), b(crownColor));
  }

  for (let i = 0; i < segments; i++) {
    indices.push(crownBase, crownBase + 1 + (i + 1) % segments, crownBase + 1 + i);
  }

  return {
    vertices, normals, colors, indices,
    vertexCount: vertices.length / 3,
    triangleCount: indices.length / 3,
  };
}

// --- helpers ---
function vecSub(a: number[], b: number[]): number[] {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function vecCross(a: number[], b: number[]): number[] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function vecNormalize(v: number[]): number[] {
  const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  return len > 0 ? [v[0] / len, v[1] / len, v[2] / len] : [0, 0, 0];
}
