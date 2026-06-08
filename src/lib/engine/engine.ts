// ==========================================
// Lightweight 3D Engine - Main Engine Class
// Orchestrates renderer, camera, scene
// ==========================================

import { Renderer, RenderObject } from './renderer';
import { Camera } from './camera';
import { Mat4, mat4Perspective, mat4Translate, mat4Scale, mat4RotateY, mat4RotateX, mat4Multiply, mat4Identity } from './math';
import { createCube, createPyramid, createIcosphere, createTerrain, createTree, MeshData } from './geometry';

export interface SceneObject {
  mesh: { vao: WebGLVertexArrayObject; indexCount: number; triangleCount: number };
  modelMatrix: Mat4;
  triangleCount: number;
  tag?: string;
  rotationSpeed?: number;
  bobSpeed?: number;
  bobAmount?: number;
  baseY?: number;
}

export interface EngineConfig {
  canvas: HTMLCanvasElement;
  resolutionScale?: number;
  fogEnabled?: boolean;
  showStats?: boolean;
}

export class Engine3D {
  renderer!: Renderer;
  camera!: Camera;
  objects: SceneObject[] = [];
  terrainMesh!: { vao: WebGLVertexArrayObject; indexCount: number; triangleCount: number };
  terrainTris = 0;

  private animFrame = 0;
  private lastTime = 0;
  private fpsFrames = 0;
  private fpsTime = 0;
  private currentFps = 0;
  private running = false;
  private resolutionScale = 1.0;
  private animTime = 0;

  // Stats callback
  onStatsUpdate?: (stats: { fps: number; drawCalls: number; triangles: number; res: string }) => void;

  constructor(private config: EngineConfig) {
    this.resolutionScale = config.resolutionScale ?? 1.0;
  }

  init() {
    const { canvas } = this.config;
    this.renderer = new Renderer(canvas);
    this.camera = new Camera(0, 1.7, 12);
    this.camera.attach(canvas);
    this.buildScene();
    this.handleResize();
    window.addEventListener('resize', this.handleResize);
    this.start();
  }

  private handleResize = () => {
    const parent = this.config.canvas.parentElement;
    if (parent) {
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      this.renderer.resizeWithScale(w, h, this.resolutionScale);
    }
  };

  setResolutionScale(scale: number) {
    this.resolutionScale = scale;
    this.handleResize();
  }

  private buildScene() {
    const r = this.renderer;

    // --- Terrain ---
    const terrainData = createTerrain(60, 60, 30);
    this.terrainMesh = r.createMesh(terrainData.vertices, terrainData.normals, terrainData.colors, terrainData.indices);
    this.terrainTris = terrainData.triangleCount;

    // --- Trees (scattered) ---
    const treePositions = [
      [-8, 0, -5], [-3, 0, -12], [5, 0, -8], [10, 0, -3],
      [-12, 0, 2], [7, 0, 5], [-6, 0, 8], [15, 0, -10],
      [-15, 0, -8], [12, 0, 7], [-4, 0, 15], [8, 0, -15],
    ];
    for (const [tx, _, tz] of treePositions) {
      const tree = createTree(
        0x664422,
        Math.random() > 0.5 ? 0x2d6b2d : 0x3a7d3a,
      );
      const mesh = r.createMesh(tree.vertices, tree.normals, tree.colors, tree.indices);
      const scaleVal = 0.7 + Math.random() * 0.6;
      const model = mat4Multiply(
        mat4Translate(tx, 0, tz),
        mat4Scale(scaleVal, scaleVal, scaleVal),
      );
      this.objects.push({ mesh, modelMatrix: model, triangleCount: tree.triangleCount, tag: 'tree' });
    }

    // --- Cubes (demo objects) ---
    const cubePositions = [
      { pos: [0, 0.5, 0] as [number, number, number], color: 0xcc4444, size: 1 },
      { pos: [3, 0.4, -2] as [number, number, number], color: 0x4444cc, size: 0.8 },
      { pos: [-2, 0.3, -4] as [number, number, number], color: 0xcccc44, size: 0.6 },
    ];
    for (const { pos, color, size } of cubePositions) {
      const cubeData = createCube(color);
      const mesh = r.createMesh(cubeData.vertices, cubeData.normals, cubeData.colors, cubeData.indices);
      const model = mat4Multiply(mat4Translate(pos[0], pos[1], pos[2]), mat4Scale(size, size, size));
      this.objects.push({
        mesh, modelMatrix: model, triangleCount: cubeData.triangleCount, tag: 'cube',
        rotationSpeed: 0.5 + Math.random(),
        baseY: pos[1],
        bobSpeed: 1.5,
        bobAmount: 0.15,
      });
    }

    // --- Pyramids ---
    const pyramidData = createPyramid(0xdd8833);
    const pyramidMesh = r.createMesh(pyramidData.vertices, pyramidData.normals, pyramidData.colors, pyramidData.indices);
    this.objects.push({
      mesh: pyramidMesh,
      modelMatrix: mat4Translate(-5, 0, 3),
      triangleCount: pyramidData.triangleCount,
      tag: 'pyramid',
      rotationSpeed: 0.3,
      baseY: 0,
      bobSpeed: 1.0,
      bobAmount: 0.1,
    });

    // --- Spheres ---
    const sphereData = createIcosphere(0.6, 1, 0x33aacc);
    const sphereMesh = r.createMesh(sphereData.vertices, sphereData.normals, sphereData.colors, sphereData.indices);
    this.objects.push({
      mesh: sphereMesh,
      modelMatrix: mat4Translate(5, 0.6, 0),
      triangleCount: sphereData.triangleCount,
      tag: 'sphere',
      rotationSpeed: 0.7,
      baseY: 0.6,
      bobSpeed: 2.0,
      bobAmount: 0.2,
    });

    // --- Platform of pillars ---
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const px = Math.cos(angle) * 8;
      const pz = Math.sin(angle) * 8;
      const pillar = createCube(0x998877);
      const pillarMesh = r.createMesh(pillar.vertices, pillar.normals, pillar.colors, pillar.indices);
      const h = 1.5 + Math.random() * 2;
      this.objects.push({
        mesh: pillarMesh,
        modelMatrix: mat4Multiply(mat4Translate(px, h / 2, pz), mat4Scale(0.3, h, 0.3)),
        triangleCount: pillar.triangleCount,
        tag: 'pillar',
      });
    }
  }

  addObject(type: 'cube' | 'pyramid' | 'sphere' | 'tree') {
    const r = this.renderer;
    const ox = (Math.random() - 0.5) * 20;
    const oz = (Math.random() - 0.5) * 20;
    const color = Math.floor(Math.random() * 0xffffff);

    let meshData: MeshData;
    let yOff = 0;
    let scaleVal = 1;

    switch (type) {
      case 'cube':
        meshData = createCube(color);
        yOff = 0.5;
        break;
      case 'pyramid':
        meshData = createPyramid(color);
        yOff = 0;
        break;
      case 'sphere':
        meshData = createIcosphere(0.5, 1, color);
        yOff = 0.5;
        scaleVal = 1;
        break;
      case 'tree':
        meshData = createTree(0x664422, color || 0x2d6b2d);
        yOff = 0;
        scaleVal = 0.7 + Math.random() * 0.6;
        break;
    }

    const mesh = r.createMesh(meshData.vertices, meshData.normals, meshData.colors, meshData.indices);
    const model = mat4Multiply(mat4Translate(ox, yOff, oz), mat4Scale(scaleVal, scaleVal, scaleVal));

    this.objects.push({
      mesh,
      modelMatrix: model,
      triangleCount: meshData.triangleCount,
      tag: type,
      rotationSpeed: type !== 'tree' ? 0.3 + Math.random() : 0,
      baseY: yOff,
      bobSpeed: 1.5,
      bobAmount: 0.1,
    });
  }

  private updateAnimations(dt: number) {
    this.animTime += dt;
    for (const obj of this.objects) {
      if (obj.rotationSpeed) {
        const rotated = mat4Multiply(mat4RotateY(this.animTime * obj.rotationSpeed), obj.modelMatrix);
        // Apply rotation to the original position
        const pos = [obj.modelMatrix[12], obj.baseY ?? obj.modelMatrix[13], obj.modelMatrix[14]] as [number, number, number];
        const scale = [obj.modelMatrix[0], obj.modelMatrix[5], obj.modelMatrix[10]]; // extract scale from diagonal
        const newModel = mat4Multiply(
          mat4Translate(pos[0], pos[1], pos[2]),
          mat4Multiply(
            mat4RotateY(this.animTime * obj.rotationSpeed),
            mat4Scale(scale[0], scale[1], scale[2]),
          ),
        );
        // Bobbing
        if (obj.bobSpeed && obj.bobAmount) {
          newModel[13] += Math.sin(this.animTime * obj.bobSpeed) * obj.bobAmount;
        }
        obj.modelMatrix = newModel;
      }
    }
  }

  start() {
    this.running = true;
    this.lastTime = performance.now();
    this.loop();
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.animFrame);
    this.camera.detach();
    window.removeEventListener('resize', this.handleResize);
  }

  private loop = () => {
    if (!this.running) return;
    this.animFrame = requestAnimationFrame(this.loop);

    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 0.1); // cap dt
    this.lastTime = now;

    // FPS counter
    this.fpsFrames++;
    this.fpsTime += dt;
    if (this.fpsTime >= 0.5) {
      this.currentFps = Math.round(this.fpsFrames / this.fpsTime);
      this.fpsFrames = 0;
      this.fpsTime = 0;
    }

    // Update camera
    this.camera.update(dt);

    // Update animations
    this.updateAnimations(dt);

    // Set matrices
    const aspect = this.config.canvas.width / this.config.canvas.height;
    const projection = mat4Perspective(Math.PI / 3, aspect, 0.1, 100);
    const view = this.camera.getViewMatrix();

    this.renderer.setProjection(projection);
    this.renderer.setView(view);

    // Render terrain first
    const terrainObj: RenderObject = {
      vao: this.terrainMesh.vao,
      indexCount: this.terrainMesh.indexCount,
      triangleCount: this.terrainTris,
      modelMatrix: mat4Identity(),
    };

    const renderObjects: RenderObject[] = [terrainObj, ...this.objects.map(o => ({
      vao: o.mesh.vao,
      indexCount: o.mesh.indexCount,
      triangleCount: o.triangleCount,
      modelMatrix: o.modelMatrix,
    }))];

    const stats = this.renderer.render(renderObjects, this.animTime);

    // Callback
    if (this.onStatsUpdate) {
      this.onStatsUpdate({
        fps: this.currentFps,
        drawCalls: stats.drawCalls,
        triangles: stats.totalTriangles,
        res: `${this.config.canvas.width}x${this.config.canvas.height}`,
      });
    }
  };

  destroy() {
    this.stop();
    this.renderer.destroy();
  }
}
