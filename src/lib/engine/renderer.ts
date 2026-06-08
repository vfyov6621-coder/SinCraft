// ==========================================
// Lightweight 3D Engine - WebGL Renderer
// Minimal shaders, flat shading for performance
// ==========================================

import { Mat4, mat4Multiply, mat4Identity, mat4Transpose } from './math';

export interface RenderObject {
  vao: WebGLVertexArrayObject;
  indexCount: number;
  triangleCount: number;
  modelMatrix: Mat4;
}

export interface EngineStats {
  fps: number;
  drawCalls: number;
  triangleCount: number;
  resolution: string;
  gpuMemoryEstimate: string;
}

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
    // Flat shading: transform normal
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
  uniform float uTime;

  void main() {
    // Directional light with flat shading
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

export class Renderer {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram | null = null;
  private uniforms: Record<string, WebGLUniformLocation | null> = {};
  private projectionMatrix = mat4Identity();
  private viewMatrix = mat4Identity();

  // Fog settings
  fogColor: [number, number, number] = [0.55, 0.65, 0.75];
  fogNear = 15;
  fogFar = 50;
  ambientStrength = 0.35;
  lightDir: [number, number, number] = [0.4, 0.8, 0.3];

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false, // Performance: no AA for weak PCs
      powerPreference: 'low-power',
      failIfMajorPerformanceCaveat: false,
    });
    if (!gl) throw new Error('WebGL 2 not supported');
    this.gl = gl;
    this.initShaders();
  }

  private initShaders() {
    const gl = this.gl;
    const vs = this.compileShader(gl.VERTEX_SHADER, VERTEX_SHADER);
    const fs = this.compileShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Shader link error:', gl.getProgramInfoLog(program));
    }
    this.program = program;
    this.uniforms = {
      uProjection: gl.getUniformLocation(program, 'uProjection'),
      uView: gl.getUniformLocation(program, 'uView'),
      uModel: gl.getUniformLocation(program, 'uModel'),
      uNormalMatrix: gl.getUniformLocation(program, 'uNormalMatrix'),
      uLightDir: gl.getUniformLocation(program, 'uLightDir'),
      uFogColor: gl.getUniformLocation(program, 'uFogColor'),
      uFogNear: gl.getUniformLocation(program, 'uFogNear'),
      uFogFar: gl.getUniformLocation(program, 'uFogFar'),
      uAmbient: gl.getUniformLocation(program, 'uAmbient'),
      uTime: gl.getUniformLocation(program, 'uTime'),
    };
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

  createMesh(
    vertices: number[],
    normals: number[],
    colors: number[],
    indices: number[],
  ): { vao: WebGLVertexArrayObject; indexCount: number; triangleCount: number } {
    const gl = this.gl;
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);

    // Position buffer
    const posBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

    // Normal buffer
    const normBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, normBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(normals), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);

    // Color buffer
    const colBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, colBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 0, 0);

    // Index buffer
    const idxBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

    gl.bindVertexArray(null);

    return {
      vao,
      indexCount: indices.length,
      triangleCount: indices.length / 3,
    };
  }

  setProjection(projection: Mat4) {
    this.projectionMatrix = projection;
  }

  setView(view: Mat4) {
    this.viewMatrix = view;
  }

  render(objects: RenderObject[], time: number): { drawCalls: number; totalTriangles: number } {
    const gl = this.gl;
    let drawCalls = 0;
    let totalTriangles = 0;

    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.clearColor(this.fogColor[0], this.fogColor[1], this.fogColor[2], 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);

    gl.useProgram(this.program!);

    // Set global uniforms
    gl.uniformMatrix4fv(this.uniforms.uProjection, false, this.projectionMatrix);
    gl.uniformMatrix4fv(this.uniforms.uView, false, this.viewMatrix);
    gl.uniform3fv(this.uniforms.uLightDir, this.lightDir);
    gl.uniform3fv(this.uniforms.uFogColor, this.fogColor);
    gl.uniform1f(this.uniforms.uFogNear, this.fogNear);
    gl.uniform1f(this.uniforms.uFogFar, this.fogFar);
    gl.uniform1f(this.uniforms.uAmbient, this.ambientStrength);
    gl.uniform1f(this.uniforms.uTime, time);

    // Draw each object
    for (const obj of objects) {
      gl.bindVertexArray(obj.vao);
      gl.uniformMatrix4fv(this.uniforms.uModel, false, obj.modelMatrix);

      // Compute normal matrix (3x3 from model matrix transpose for uniform scale)
      const nm = new Float32Array([
        obj.modelMatrix[0], obj.modelMatrix[1], obj.modelMatrix[2],
        obj.modelMatrix[4], obj.modelMatrix[5], obj.modelMatrix[6],
        obj.modelMatrix[8], obj.modelMatrix[9], obj.modelMatrix[10],
      ]);
      gl.uniformMatrix3fv(this.uniforms.uNormalMatrix, false, nm);

      gl.drawElements(gl.TRIANGLES, obj.indexCount, gl.UNSIGNED_SHORT, 0);
      drawCalls++;
      totalTriangles += obj.triangleCount;
    }

    gl.bindVertexArray(null);
    return { drawCalls, totalTriangles };
  }

  resize(width: number, height: number) {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5); // Cap DPR for weak PCs
    this.canvas.width = Math.floor(width * dpr);
    this.canvas.height = Math.floor(height * dpr);
    this.canvas.style.width = width + 'px';
    this.canvas.style.height = height + 'px';
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
    gl.deleteProgram(this.program!);
    const ext = gl.getExtension('WEBGL_lose_context');
    if (ext) ext.loseContext();
  }
}
