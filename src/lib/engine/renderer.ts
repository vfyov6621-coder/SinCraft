// ==========================================
// SinCraft - WebGL 2 Renderer
// Multi-mesh chunk rendering, shadow AO, emissive blocks
// ==========================================

import { Mat4 } from './math';

const VERTEX_SHADER = `
  attribute vec3 aPosition;
  attribute vec3 aNormal;
  attribute vec3 aColor;
  attribute float aEmissive;

  uniform mat4 uProjection;
  uniform mat4 uView;

  varying vec3 vColor;
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  varying float vEmissive;
  varying float vAO;

  void main() {
    vec4 worldPos = vec4(aPosition, 1.0);
    gl_Position = uProjection * uView * worldPos;
    vColor = aColor;
    vNormal = normalize(aNormal);
    vWorldPos = worldPos.xyz;
    vEmissive = aEmissive;
    // Simple AO: darken faces that are not top-facing
    vAO = 1.0;
    if (aNormal.y < -0.5) vAO = 0.5;       // bottom
    else if (abs(aNormal.y) < 0.5) vAO = 0.75; // sides
    // top face = 1.0 (full bright)
  }
`;

const FRAGMENT_SHADER = `
  precision mediump float;

  varying vec3 vColor;
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  varying float vEmissive;
  varying float vAO;

  uniform vec3 uLightDir;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform float uAmbient;
  uniform vec3 uCameraPos;
  uniform float uShadowStrength;

  void main() {
    // Emissive blocks glow on their own
    vec3 emissiveColor = vColor * vEmissive * 2.0;

    // Directional lighting
    float diff = max(dot(vNormal, normalize(uLightDir)), 0.0);
    float light = uAmbient + diff * (1.0 - uAmbient);

    // Apply ambient occlusion
    light *= mix(1.0, vAO, uShadowStrength);

    vec3 color = vColor * light + emissiveColor;

    // Distance fog from camera
    float depth = distance(vWorldPos, uCameraPos);
    float fogFactor = clamp((uFogFar - depth) / (uFogFar - uFogNear), 0.0, 1.0);
    color = mix(uFogColor, color, fogFactor);

    gl_FragColor = vec4(color, 1.0);
  }
`;

// Wireframe shader for block highlight
const LINE_VERT = `
  attribute vec3 aPosition;
  uniform mat4 uProjection;
  uniform mat4 uView;
  uniform vec3 uOffset;
  void main() {
    gl_Position = uProjection * uView * vec4(aPosition + uOffset, 1.0);
  }
`;

const LINE_FRAG = `
  precision mediump float;
  void main() {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 0.7);
  }
`;

export interface MeshData {
  vao: WebGLVertexArrayObject;
  buffers: WebGLBuffer[];
  indexCount: number;
  triangleCount: number;
}

export class Renderer {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram | null = null;
  private lineProgram: WebGLProgram | null = null;
  private uniforms: Record<string, WebGLUniformLocation | null> = {};
  private lineUniforms: Record<string, WebGLUniformLocation | null> = {};
  private highlightVAO: WebGLVertexArrayObject | null = null;
  private highlightBuffers: WebGLBuffer[] = [];
  private highlightIndexCount = 0;

  projectionMatrix: Mat4 = new Float32Array(16);
  viewMatrix: Mat4 = new Float32Array(16);

  fogColor: [number, number, number] = [0.62, 0.72, 0.82];
  fogNear = 20;
  fogFar = 55;
  ambientStrength = 0.45;
  lightDir: [number, number, number] = [0.3, 0.8, 0.5];
  shadowStrength = 0.3; // Face AO intensity (vertex AO in mesh builder handles main shadows)

  // Stats
  drawCalls = 0;
  totalTriangles = 0;

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      powerPreference: 'low-power',
      failIfMajorPerformanceCaveat: false,
    });
    if (!gl) throw new Error('WebGL 2 not supported');
    this.gl = gl;
    this.initShaders();
    this.initHighlight();
  }

  private compileShader(type: number, source: string): WebGLShader {
    const gl = this.gl;
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compile error:', gl.getShaderInfoLog(shader));
    }
    return shader;
  }

  private linkProgram(vs: WebGLShader, fs: WebGLShader): WebGLProgram {
    const gl = this.gl;
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('Program link error:', gl.getProgramInfoLog(prog));
    }
    return prog;
  }

  private initShaders() {
    const gl = this.gl;
    const vs = this.compileShader(gl.VERTEX_SHADER, VERTEX_SHADER);
    const fs = this.compileShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    this.program = this.linkProgram(vs, fs);

    this.uniforms = {
      uProjection: gl.getUniformLocation(this.program, 'uProjection'),
      uView: gl.getUniformLocation(this.program, 'uView'),
      uLightDir: gl.getUniformLocation(this.program, 'uLightDir'),
      uFogColor: gl.getUniformLocation(this.program, 'uFogColor'),
      uFogNear: gl.getUniformLocation(this.program, 'uFogNear'),
      uFogFar: gl.getUniformLocation(this.program, 'uFogFar'),
      uAmbient: gl.getUniformLocation(this.program, 'uAmbient'),
      uCameraPos: gl.getUniformLocation(this.program, 'uCameraPos'),
      uShadowStrength: gl.getUniformLocation(this.program, 'uShadowStrength'),
    };

    const lvs = this.compileShader(gl.VERTEX_SHADER, LINE_VERT);
    const lfs = this.compileShader(gl.FRAGMENT_SHADER, LINE_FRAG);
    this.lineProgram = this.linkProgram(lvs, lfs);
    this.lineUniforms = {
      uProjection: gl.getUniformLocation(this.lineProgram, 'uProjection'),
      uView: gl.getUniformLocation(this.lineProgram, 'uView'),
      uOffset: gl.getUniformLocation(this.lineProgram, 'uOffset'),
    };
  }

  private initHighlight() {
    const gl = this.gl;
    const e = 0.003;
    const v = [
      -e, -e, -e,  e, -e, -e,  e, 1+e, -e,  -e, 1+e, -e,
      -e, -e,  1+e,  e, -e,  1+e,  e, 1+e,  1+e,  -e, 1+e,  1+e,
    ];
    const idx = [0,1, 1,2, 2,3, 3,0, 4,5, 5,6, 6,7, 7,4, 0,4, 1,5, 2,6, 3,7];
    this.highlightVAO = gl.createVertexArray()!;
    gl.bindVertexArray(this.highlightVAO);
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    this.highlightBuffers.push(buf);
    const ibuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
    this.highlightBuffers.push(ibuf);
    gl.bindVertexArray(null);
    this.highlightIndexCount = idx.length;
  }

  createMesh(
    vertices: number[],
    normals: number[],
    colors: number[],
    indices: number[],
    emissive?: number[],
  ): MeshData {
    const gl = this.gl;
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const buffers: WebGLBuffer[] = [];

    const posBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    buffers.push(posBuf);

    const normBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, normBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(normals), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
    buffers.push(normBuf);

    const colBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, colBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 0, 0);
    buffers.push(colBuf);

    // Emissive per-vertex
    const emBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, emBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(emissive || colors.map(() => 0)), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 0, 0);
    buffers.push(emBuf);

    const idxBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(indices), gl.STATIC_DRAW);
    buffers.push(idxBuf);

    gl.bindVertexArray(null);
    return { vao, buffers, indexCount: indices.length, triangleCount: indices.length / 3 };
  }

  deleteMesh(mesh: MeshData): void {
    const gl = this.gl;
    gl.deleteVertexArray(mesh.vao);
    for (const buf of mesh.buffers) gl.deleteBuffer(buf);
  }

  cameraPos: [number, number, number] = [0, 0, 0];

  beginFrame(): void {
    const gl = this.gl;
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.clearColor(this.fogColor[0], this.fogColor[1], this.fogColor[2], 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    this.drawCalls = 0;
    this.totalTriangles = 0;
  }

  renderMesh(mesh: MeshData): void {
    const gl = this.gl;
    gl.useProgram(this.program!);

    gl.uniformMatrix4fv(this.uniforms.uProjection, false, this.projectionMatrix);
    gl.uniformMatrix4fv(this.uniforms.uView, false, this.viewMatrix);
    gl.uniform3fv(this.uniforms.uLightDir, this.lightDir);
    gl.uniform3fv(this.uniforms.uFogColor, this.fogColor);
    gl.uniform1f(this.uniforms.uFogNear, this.fogNear);
    gl.uniform1f(this.uniforms.uFogFar, this.fogFar);
    gl.uniform1f(this.uniforms.uAmbient, this.ambientStrength);
    gl.uniform3fv(this.uniforms.uCameraPos, this.cameraPos);
    gl.uniform1f(this.uniforms.uShadowStrength, this.shadowStrength);

    gl.bindVertexArray(mesh.vao);
    gl.drawElements(gl.TRIANGLES, mesh.indexCount, gl.UNSIGNED_INT, 0);

    this.drawCalls++;
    this.totalTriangles += mesh.triangleCount;
  }

  renderHighlight(pos: { x: number; y: number; z: number }): void {
    const gl = this.gl;
    gl.disable(gl.CULL_FACE);
    gl.useProgram(this.lineProgram!);
    gl.uniformMatrix4fv(this.lineUniforms.uProjection, false, this.projectionMatrix);
    gl.uniformMatrix4fv(this.lineUniforms.uView, false, this.viewMatrix);
    gl.uniform3fv(this.lineUniforms.uOffset!, [pos.x, pos.y, pos.z]);
    gl.bindVertexArray(this.highlightVAO);
    gl.drawElements(gl.LINES, this.highlightIndexCount, gl.UNSIGNED_SHORT, 0);
    gl.enable(gl.CULL_FACE);
    gl.bindVertexArray(null);
  }

  resizeWithScale(width: number, height: number, scale: number) {
    const s = Math.max(0.25, Math.min(1, scale));
    this.canvas.width = Math.floor(width * s);
    this.canvas.height = Math.floor(height * s);
    this.canvas.style.width = width + 'px';
    this.canvas.style.height = height + 'px';
  }

  destroy() {
    const gl = this.gl;
    if (this.program) gl.deleteProgram(this.program);
    if (this.lineProgram) gl.deleteProgram(this.lineProgram);
    if (this.highlightVAO) {
      gl.deleteVertexArray(this.highlightVAO);
      for (const buf of this.highlightBuffers) gl.deleteBuffer(buf);
    }
    const ext = gl.getExtension('WEBGL_lose_context');
    if (ext) ext.loseContext();
  }
}
