// ==========================================
// Lightweight 3D Engine - WebGL 2 Renderer
// Supports solid mesh + wireframe highlight
// ==========================================

import { Mat4 } from './math';

const VERTEX_SHADER = `
  attribute vec3 aPosition;
  attribute vec3 aNormal;
  attribute vec3 aColor;

  uniform mat4 uProjection;
  uniform mat4 uView;
  uniform mat4 uModel;
  uniform mat3 uNormalMatrix;

  varying vec3 vColor;
  varying vec3 vNormal;
  varying vec3 vWorldPos;

  void main() {
    vec4 worldPos = uModel * vec4(aPosition, 1.0);
    gl_Position = uProjection * uView * worldPos;
    vColor = aColor;
    vNormal = normalize(uNormalMatrix * aNormal);
    vWorldPos = worldPos.xyz;
  }
`;

const FRAGMENT_SHADER = `
  precision mediump float;

  varying vec3 vColor;
  varying vec3 vNormal;
  varying vec3 vWorldPos;

  uniform vec3 uLightDir;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform float uAmbient;

  void main() {
    float diff = max(dot(vNormal, normalize(uLightDir)), 0.0);
    float light = uAmbient + diff * (1.0 - uAmbient);

    vec3 color = vColor * light;

    // Distance fog
    float depth = length(vWorldPos);
    float fogFactor = clamp((uFogFar - depth) / (uFogFar - uFogNear), 0.0, 1.0);
    color = mix(uFogColor, color, fogFactor);

    gl_FragColor = vec4(color, 1.0);
  }
`;

// Simple shader for wireframe lines
const LINE_VERT = `
  attribute vec3 aPosition;
  uniform mat4 uProjection;
  uniform mat4 uView;
  void main() {
    gl_Position = uProjection * uView * vec4(aPosition, 1.0);
  }
`;

const LINE_FRAG = `
  precision mediump float;
  void main() {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 0.6);
  }
`;

export interface MeshData {
  vao: WebGLVertexArrayObject;
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
  private highlightIndexCount = 0;

  projectionMatrix: Mat4 = new Float32Array(16);
  viewMatrix: Mat4 = new Float32Array(16);

  fogColor: [number, number, number] = [0.62, 0.72, 0.82];
  fogNear = 20;
  fogFar = 55;
  ambientStrength = 0.45;
  lightDir: [number, number, number] = [0.3, 0.8, 0.5];

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
      const log = gl.getShaderInfoLog(shader);
      console.error('Shader compile error:', log || 'unknown');
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
      const log = gl.getProgramInfoLog(prog);
      console.error('Program link error:', log || 'unknown');
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
      uModel: gl.getUniformLocation(this.program, 'uModel'),
      uNormalMatrix: gl.getUniformLocation(this.program, 'uNormalMatrix'),
      uLightDir: gl.getUniformLocation(this.program, 'uLightDir'),
      uFogColor: gl.getUniformLocation(this.program, 'uFogColor'),
      uFogNear: gl.getUniformLocation(this.program, 'uFogNear'),
      uFogFar: gl.getUniformLocation(this.program, 'uFogFar'),
      uAmbient: gl.getUniformLocation(this.program, 'uAmbient'),
    };

    // Line shader
    const lvs = this.compileShader(gl.VERTEX_SHADER, LINE_VERT);
    const lfs = this.compileShader(gl.FRAGMENT_SHADER, LINE_FRAG);
    this.lineProgram = this.linkProgram(lvs, lfs);
    this.lineUniforms = {
      uProjection: gl.getUniformLocation(this.lineProgram, 'uProjection'),
      uView: gl.getUniformLocation(this.lineProgram, 'uView'),
    };
  }

  // Create wireframe cube for block highlight
  private initHighlight() {
    const gl = this.gl;
    const e = 0.002; // slight expansion to avoid z-fighting
    const v = [
      -e, -e, -e,  e, -e, -e,  e, 1+e, -e,  -e, 1+e, -e,
      -e, -e,  1+e,  e, -e,  1+e,  e, 1+e,  1+e,  -e, 1+e,  1+e,
    ];
    const idx = [
      // bottom
      0,1, 1,2, 2,3, 3,0,
      // top
      4,5, 5,6, 6,7, 7,4,
      // sides
      0,4, 1,5, 2,6, 3,7,
    ];

    this.highlightVAO = gl.createVertexArray()!;
    gl.bindVertexArray(this.highlightVAO);

    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

    const ibuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);

    gl.bindVertexArray(null);
    this.highlightIndexCount = idx.length;
  }

  createMesh(
    vertices: number[],
    normals: number[],
    colors: number[],
    indices: number[],
  ): MeshData {
    const gl = this.gl;
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);

    const posBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

    const normBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, normBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(normals), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);

    const colBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, colBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 0, 0);

    const idxBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

    gl.bindVertexArray(null);
    return { vao, indexCount: indices.length, triangleCount: indices.length / 3 };
  }

  render(worldMesh: MeshData, modelMatrix: Mat4, time: number, highlightPos: { x: number; y: number; z: number } | null) {
    const gl = this.gl;
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.clearColor(this.fogColor[0], this.fogColor[1], this.fogColor[2], 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);

    // --- Draw solid world ---
    gl.useProgram(this.program!);
    gl.uniformMatrix4fv(this.uniforms.uProjection, false, this.projectionMatrix);
    gl.uniformMatrix4fv(this.uniforms.uView, false, this.viewMatrix);
    gl.uniformMatrix4fv(this.uniforms.uModel, false, modelMatrix);
    gl.uniformMatrix3fv(this.uniforms.uNormalMatrix, false, new Float32Array([
      modelMatrix[0], modelMatrix[1], modelMatrix[2],
      modelMatrix[4], modelMatrix[5], modelMatrix[6],
      modelMatrix[8], modelMatrix[9], modelMatrix[10],
    ]));
    gl.uniform3fv(this.uniforms.uLightDir, this.lightDir);
    gl.uniform3fv(this.uniforms.uFogColor, this.fogColor);
    gl.uniform1f(this.uniforms.uFogNear, this.fogNear);
    gl.uniform1f(this.uniforms.uFogFar, this.fogFar);
    gl.uniform1f(this.uniforms.uAmbient, this.ambientStrength);

    gl.bindVertexArray(worldMesh.vao);
    gl.drawElements(gl.TRIANGLES, worldMesh.indexCount, gl.UNSIGNED_SHORT, 0);

    // --- Draw highlight wireframe ---
    if (highlightPos && this.highlightVAO) {
      gl.disable(gl.CULL_FACE);
      gl.useProgram(this.lineProgram!);
      gl.uniformMatrix4fv(this.lineUniforms.uProjection, false, this.projectionMatrix);
      gl.uniformMatrix4fv(this.lineUniforms.uView, false, this.viewMatrix);

      gl.bindVertexArray(this.highlightVAO);
      const hx = highlightPos.x, hy = highlightPos.y, hz = highlightPos.z;
      // Push model-view-projection manually with translation
      gl.drawElements(gl.LINES, this.highlightIndexCount, gl.UNSIGNED_SHORT, 0);

      // We need to actually translate — simplest: use a uniform approach
      // Since line shader has no model matrix, we bake translation into view matrix
      // Actually let's just use a simpler approach: temporarily shift the vertices
      // No — let's create a simple translation in the shader... but line shader has no model uniform.
      // Simplest fix: push translate into viewMatrix temporarily
      // Actually the cleanest: use the main program's model uniform
      // Let me just re-draw using the main program for lines too... 
      // OK simplest approach: I'll bake the translate into the view matrix temporarily

      // Actually let me just translate the view and undo:
      const view = this.viewMatrix;
      // Bake highlight position into a temp matrix
      gl.uniformMatrix4fv(this.lineUniforms.uView, false, this.translateView(view, hx, hy, hz));
      gl.drawElements(gl.LINES, this.highlightIndexCount, gl.UNSIGNED_SHORT, 0);

      gl.enable(gl.CULL_FACE);
    }

    gl.bindVertexArray(null);
  }

  private translateView(view: Mat4, tx: number, ty: number, tz: number): Mat4 {
    // Create a temporary view matrix that includes translation for the highlight block
    const out = new Float32Array(view);
    // Apply translation: out = view * translate(-tx, -ty, -tz)
    // But simpler: just modify view to pre-translate
    out[12] += view[0] * tx + view[4] * ty + view[8] * tz;
    out[13] += view[1] * tx + view[5] * ty + view[9] * tz;
    out[14] += view[2] * tx + view[6] * ty + view[10] * tz;
    return out;
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
    const ext = gl.getExtension('WEBGL_lose_context');
    if (ext) ext.loseContext();
  }
}
