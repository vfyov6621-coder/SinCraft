'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Engine3D } from '@/lib/engine/engine';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  Box, Pyramid, Circle, TreePine,
  RotateCcw, Maximize2, Monitor,
  Gauge, Layers, Triangle,
  Gamepad2, Info,
} from 'lucide-react';

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine3D | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [stats, setStats] = useState({ fps: 0, drawCalls: 0, triangles: 0, res: '0x0' });
  const [resolutionScale, setResolutionScale] = useState(0.75);
  const [showPanel, setShowPanel] = useState(true);
  const [showHelp, setShowHelp] = useState(true);
  const [spawnCount, setSpawnCount] = useState(0);
  const [engineReady, setEngineReady] = useState(false);
  const mountedRef = useRef(false);
  const readyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Resolution scale change
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setResolutionScale(resolutionScale);
    }
  }, [resolutionScale]);

  // Engine lifecycle — init once, destroy on unmount
  useEffect(() => {
    if (!canvasRef.current || mountedRef.current) return;
    mountedRef.current = true;

    const canvas = canvasRef.current;
    const engine = new Engine3D({
      canvas,
      resolutionScale: 0.75,
    });
    engine.onStatsUpdate = setStats;
    engine.init();
    engineRef.current = engine;
    // Defer setState outside of effect body
    readyTimerRef.current = setTimeout(() => setEngineReady(true), 0);

    return () => {
      if (readyTimerRef.current) clearTimeout(readyTimerRef.current);
      engine.destroy();
      engineRef.current = null;
      mountedRef.current = false;
    };
  }, []);

  const handleSpawn = (type: 'cube' | 'pyramid' | 'sphere' | 'tree') => {
    if (engineRef.current) {
      engineRef.current.addObject(type);
      setSpawnCount(prev => prev + 1);
    }
  };

  const handleResetScene = () => {
    if (engineRef.current) {
      engineRef.current.destroy();
      engineRef.current = null;
      setSpawnCount(0);
      setEngineReady(false);

      setTimeout(() => {
        if (canvasRef.current) {
          const engine = new Engine3D({
            canvas: canvasRef.current,
            resolutionScale,
          });
          engine.onStatsUpdate = setStats;
          engine.init();
          engineRef.current = engine;
          setEngineReady(true);
        }
      }, 100);
    }
  };

  const fpsColor = stats.fps >= 50 ? 'text-emerald-400' : stats.fps >= 30 ? 'text-yellow-400' : 'text-red-400';

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-gray-100 overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 bg-gray-900/80 border-b border-gray-800 z-10">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Triangle className="w-5 h-5 text-emerald-400" />
            <h1 className="text-lg font-bold tracking-tight">
              Lite3D <span className="text-emerald-400 text-sm font-normal">Engine</span>
            </h1>
          </div>
          <Badge variant="outline" className="text-xs border-gray-700 text-gray-400">
            v0.1 alpha
          </Badge>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-xs text-gray-500 hidden sm:block">
            FPS: <span className={`font-mono font-bold ${fpsColor}`}>{stats.fps}</span>
          </div>
          <Badge variant="outline" className="text-xs border-gray-700 text-gray-400 hidden md:inline-flex">
            {stats.triangles} tris
          </Badge>
          <Badge variant="outline" className="text-xs border-gray-700 text-gray-400 hidden lg:inline-flex">
            {stats.drawCalls} draws
          </Badge>
          <Switch
            checked={showPanel}
            onCheckedChange={setShowPanel}
            className="scale-75"
          />
          <span className="text-xs text-gray-500 hidden sm:inline">Panel</span>
        </div>
      </header>

      {/* Main area */}
      <main className="flex flex-1 overflow-hidden relative">
        {/* 3D Canvas */}
        <div ref={containerRef} className="flex-1 relative bg-black">
          <canvas
            ref={canvasRef}
            className="w-full h-full block cursor-crosshair"
          />

          {/* Help overlay */}
          {showHelp && engineReady && (
            <div className="absolute bottom-4 left-4 z-10">
              <Card className="bg-gray-900/90 border-gray-700 p-3 text-xs max-w-xs backdrop-blur-sm">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                    <Info className="w-3.5 h-3.5" />
                    Controls
                  </div>
                  <button onClick={() => setShowHelp(false)} className="text-gray-500 hover:text-gray-300">
                    x
                  </button>
                </div>
                <div className="space-y-1 text-gray-400">
                  <p><kbd className="px-1.5 py-0.5 bg-gray-800 rounded text-gray-300 font-mono text-[10px]">WASD</kbd> Move</p>
                  <p><kbd className="px-1.5 py-0.5 bg-gray-800 rounded text-gray-300 font-mono text-[10px]">Mouse</kbd> Look around (click canvas)</p>
                  <p><kbd className="px-1.5 py-0.5 bg-gray-800 rounded text-gray-300 font-mono text-[10px]">Space / Shift</kbd> Up / Down</p>
                </div>
              </Card>
            </div>
          )}

          {/* Stats overlay */}
          {engineReady && (
            <div className="absolute top-4 right-4 z-10">
              <Card className="bg-gray-900/80 border-gray-700 p-2 backdrop-blur-sm min-w-[120px]">
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-500 flex items-center gap-1"><Gauge className="w-3 h-3" />FPS</span>
                    <span className={`font-mono font-bold ${fpsColor}`}>{stats.fps}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 flex items-center gap-1"><Triangle className="w-3 h-3" />Tris</span>
                    <span className="font-mono text-gray-300">{stats.triangles}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 flex items-center gap-1"><Layers className="w-3 h-3" />Draws</span>
                    <span className="font-mono text-gray-300">{stats.drawCalls}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 flex items-center gap-1"><Monitor className="w-3 h-3" />Res</span>
                    <span className="font-mono text-gray-300">{stats.res}</span>
                  </div>
                </div>
              </Card>
            </div>
          )}
        </div>

        {/* Control Panel */}
        {showPanel && (
          <aside className="w-72 bg-gray-900 border-l border-gray-800 overflow-y-auto p-4 space-y-4 shrink-0">
            {/* Resolution Scale */}
            <Card className="bg-gray-850 border-gray-700">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Maximize2 className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-sm font-semibold">Resolution Scale</h3>
                </div>
                <Slider
                  value={[resolutionScale]}
                  onValueChange={([v]) => setResolutionScale(v)}
                  min={0.25}
                  max={1.0}
                  step={0.05}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-gray-500">
                  <span>25%</span>
                  <span className="text-emerald-400 font-mono font-bold">{Math.round(resolutionScale * 100)}%</span>
                  <span>100%</span>
                </div>
                <p className="text-[10px] text-gray-600">
                  Lower resolution = better performance on weak hardware
                </p>
              </CardContent>
            </Card>

            {/* Spawn Objects */}
            <Card className="bg-gray-850 border-gray-700">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Box className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-sm font-semibold">Spawn Objects</h3>
                  {spawnCount > 0 && (
                    <Badge variant="secondary" className="text-[10px] ml-auto">
                      +{spawnCount}
                    </Badge>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-gray-700 hover:border-emerald-500 hover:bg-emerald-950"
                    onClick={() => handleSpawn('cube')}
                  >
                    <Box className="w-3.5 h-3.5 mr-1.5" /> Cube
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-gray-700 hover:border-emerald-500 hover:bg-emerald-950"
                    onClick={() => handleSpawn('pyramid')}
                  >
                    <Pyramid className="w-3.5 h-3.5 mr-1.5" /> Pyramid
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-gray-700 hover:border-emerald-500 hover:bg-emerald-950"
                    onClick={() => handleSpawn('sphere')}
                  >
                    <Circle className="w-3.5 h-3.5 mr-1.5" /> Sphere
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-gray-700 hover:border-emerald-500 hover:bg-emerald-950"
                    onClick={() => handleSpawn('tree')}
                  >
                    <TreePine className="w-3.5 h-3.5 mr-1.5" /> Tree
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Scene Controls */}
            <Card className="bg-gray-850 border-gray-700">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <RotateCcw className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-sm font-semibold">Scene</h3>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full border-gray-700 hover:border-red-500 hover:bg-red-950"
                  onClick={handleResetScene}
                >
                  <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Reset Scene
                </Button>
              </CardContent>
            </Card>

            <Separator className="bg-gray-800" />

            {/* Engine Info */}
            <div className="space-y-2 text-xs text-gray-500">
              <h3 className="text-sm font-semibold text-gray-400">About Engine</h3>
              <div className="space-y-1">
                <p>Custom WebGL 2 renderer with flat shading for maximum performance.</p>
                <p>Optimizations for weak PCs:</p>
                <ul className="list-disc list-inside space-y-0.5 text-gray-600 ml-1">
                  <li>No anti-aliasing</li>
                  <li>Low-poly geometry</li>
                  <li>No textures (vertex colors)</li>
                  <li>Distance fog (cull far)</li>
                  <li>Resolution scaling</li>
                  <li>Back-face culling</li>
                  <li>Static VAO batching</li>
                </ul>
              </div>
              <Separator className="bg-gray-800" />
              <div className="text-[10px] text-gray-600">
                <p>Renderer: WebGL 2</p>
                <p>Shading: Flat (directional + ambient)</p>
                <p>Geometry: Software-generated low-poly</p>
                <p>Camera: First-person (pointer lock)</p>
              </div>
            </div>
          </aside>
        )}
      </main>
    </div>
  );
}
