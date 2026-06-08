'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Game } from '@/lib/engine/engine';
import { BlockType, HOTBAR_BLOCKS, BLOCK_NAMES } from '@/lib/engine/blocks';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import {
  Gauge, Triangle, Layers, Monitor, Info, Maximize2,
} from 'lucide-react';

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const mountedRef = useRef(false);
  const readyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [stats, setStats] = useState({ fps: 0, drawCalls: 0, triangles: 0, res: '0x0' });
  const [ready, setReady] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(0);
  const [showPanel, setShowPanel] = useState(true);
  const [showHelp, setShowHelp] = useState(true);
  const [resolutionScale, setResolutionScale] = useState(0.75);

  useEffect(() => {
    if (resolutionScale && gameRef.current) {
      gameRef.current.setResolutionScale(resolutionScale);
    }
  }, [resolutionScale]);

  // Game init + cleanup
  useEffect(() => {
    if (!canvasRef.current || mountedRef.current) return;
    mountedRef.current = true;

    const canvas = canvasRef.current;
    const game = new Game(canvas, { resolutionScale: 0.75 });
    game.callbacks.onStatsUpdate = setStats;
    game.callbacks.onHitUpdate = () => {};
    game.callbacks.onPositionUpdate = () => {};
    // Poll selected slot from game
    const slotPoll = setInterval(() => {
      if (gameRef.current) {
        setSelectedSlot(gameRef.current.selectedSlot);
      }
    }, 100);
    game.init();
    gameRef.current = game;
    readyTimerRef.current = setTimeout(() => setReady(true), 0);

    return () => {
      if (readyTimerRef.current) clearTimeout(readyTimerRef.current);
      clearInterval(slotPoll);
      game.destroy();
      gameRef.current = null;
      mountedRef.current = false;
    };
  }, []);

  const fpsColor = stats.fps >= 50 ? 'text-emerald-400' : stats.fps >= 30 ? 'text-yellow-400' : 'text-red-400';

  const blockColorMap: Record<number, string> = {
    [BlockType.Grass]: 'bg-green-600',
    [BlockType.Dirt]: 'bg-amber-700',
    [BlockType.Stone]: 'bg-gray-500',
    [BlockType.Wood]: 'bg-amber-900',
    [BlockType.Planks]: 'bg-amber-600',
    [BlockType.Cobblestone]: 'bg-gray-600',
    [BlockType.Sand]: 'bg-yellow-500',
    [BlockType.Leaves]: 'bg-green-800',
    [BlockType.Snow]: 'bg-gray-100',
  };

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-gray-100 overflow-hidden select-none">
      {/* Header */}
      <header className="flex items-center justify-between px-3 py-1.5 bg-gray-900/90 border-b border-gray-800 z-20">
        <div className="flex items-center gap-2">
          <Triangle className="w-4 h-4 text-emerald-400" />
          <h1 className="text-sm font-bold tracking-tight">
            LiteCraft <span className="text-emerald-400 text-xs font-normal">Mini</span>
          </h1>
          <Badge variant="outline" className="text-[10px] border-gray-700 text-gray-500">
            Minecraft on minimals
          </Badge>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-xs text-gray-500 hidden sm:block">
            FPS: <span className={`font-mono font-bold ${fpsColor}`}>{stats.fps}</span>
          </div>
          <Badge variant="outline" className="text-[10px] border-gray-700 text-gray-500 hidden md:inline-flex">
            {stats.triangles} tris
          </Badge>
          <Switch
            checked={showPanel}
            onCheckedChange={setShowPanel}
            className="scale-75"
          />
          <span className="text-[10px] text-gray-500 hidden sm:inline">Panel</span>
        </div>
      </header>

      {/* Main */}
      <main className="flex flex-1 overflow-hidden relative">
        {/* Canvas area */}
        <div className="flex-1 relative bg-black">
          <canvas ref={canvasRef} className="w-full h-full block" />

          {/* Crosshair */}
          {ready && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
              <div className="relative w-6 h-6">
                <div className="absolute top-1/2 left-0 right-0 h-[2px] -translate-y-1/2 bg-white/70" />
                <div className="absolute left-1/2 top-0 bottom-0 w-[2px] -translate-x-1/2 bg-white/70" />
              </div>
            </div>
          )}

          {/* Hotbar */}
          {ready && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10">
              <div className="flex gap-1 p-1.5 bg-black/60 rounded-lg backdrop-blur-sm border border-gray-700/50">
                {HOTBAR_BLOCKS.map((blockType, i) => {
                  const isSelected = i === selectedSlot;
                  return (
                    <div
                      key={i}
                      className={`w-11 h-11 rounded-md flex items-center justify-center relative transition-all ${
                        isSelected
                          ? 'ring-2 ring-white scale-110 bg-white/20'
                          : 'bg-white/5 hover:bg-white/10'
                      }`}
                    >
                      <div className={`w-7 h-7 rounded-sm ${blockColorMap[blockType] || 'bg-gray-500'}`} />
                      <span className="absolute bottom-0.5 right-1 text-[8px] text-gray-400 font-mono">
                        {i + 1}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="text-center mt-1 text-[10px] text-gray-400">
                {BLOCK_NAMES[HOTBAR_BLOCKS[selectedSlot]] || 'Block'}
              </div>
            </div>
          )}

          {/* Stats overlay */}
          {ready && (
            <div className="absolute top-3 right-3 z-10">
              <Card className="bg-black/60 border-gray-700/50 p-2 backdrop-blur-sm min-w-[110px]">
                <div className="space-y-0.5 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-gray-500 flex items-center gap-1"><Gauge className="w-3 h-3" />FPS</span>
                    <span className={`font-mono font-bold ${fpsColor}`}>{stats.fps}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 flex items-center gap-1"><Triangle className="w-3 h-3" />Tris</span>
                    <span className="font-mono text-gray-300">{stats.triangles}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 flex items-center gap-1"><Monitor className="w-3 h-3" />Res</span>
                    <span className="font-mono text-gray-300">{stats.res}</span>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {/* Help overlay */}
          {showHelp && ready && (
            <div className="absolute top-3 left-3 z-10">
              <Card className="bg-black/60 border-gray-700/50 p-2.5 backdrop-blur-sm max-w-[200px]">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-emerald-400 text-xs font-semibold flex items-center gap-1">
                    <Info className="w-3 h-3" /> Controls
                  </span>
                  <button onClick={() => setShowHelp(false)} className="text-gray-500 hover:text-gray-300 text-xs">x</button>
                </div>
                <div className="space-y-0.5 text-[10px] text-gray-400">
                  <p><kbd className="px-1 py-0.5 bg-gray-800 rounded text-gray-300 font-mono text-[9px]">WASD</kbd> Move</p>
                  <p><kbd className="px-1 py-0.5 bg-gray-800 rounded text-gray-300 font-mono text-[9px]">Mouse</kbd> Look (click canvas)</p>
                  <p><kbd className="px-1 py-0.5 bg-gray-800 rounded text-gray-300 font-mono text-[9px]">Space</kbd> Jump</p>
                  <p><kbd className="px-1 py-0.5 bg-gray-800 rounded text-gray-300 font-mono text-[9px]">LMB</kbd> Break block</p>
                  <p><kbd className="px-1 py-0.5 bg-gray-800 rounded text-gray-300 font-mono text-[9px]">RMB</kbd> Place block</p>
                  <p><kbd className="px-1 py-0.5 bg-gray-800 rounded text-gray-300 font-mono text-[9px]">1-9</kbd> / <kbd className="px-1 py-0.5 bg-gray-800 rounded text-gray-300 font-mono text-[9px]">Scroll</kbd> Select block</p>
                </div>
              </Card>
            </div>
          )}
        </div>

        {/* Control Panel */}
        {showPanel && (
          <aside className="w-64 bg-gray-900 border-l border-gray-800 overflow-y-auto p-3 space-y-3 shrink-0">
            {/* Resolution Scale */}
            <Card className="bg-gray-850 border-gray-700">
              <div className="p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Maximize2 className="w-3.5 h-3.5 text-emerald-400" />
                  <h3 className="text-xs font-semibold">Resolution</h3>
                </div>
                <Slider
                  value={[resolutionScale]}
                  onValueChange={([v]) => setResolutionScale(v)}
                  min={0.25}
                  max={1.0}
                  step={0.05}
                  className="w-full"
                />
                <div className="flex justify-between text-[10px] text-gray-500">
                  <span>25%</span>
                  <span className="text-emerald-400 font-mono font-bold">{Math.round(resolutionScale * 100)}%</span>
                  <span>100%</span>
                </div>
              </div>
            </Card>

            {/* Info */}
            <div className="space-y-2 text-[10px] text-gray-500">
              <h3 className="text-xs font-semibold text-gray-400">About</h3>
              <p>Custom WebGL 2 voxel engine. Minecraft-style block building on minimal hardware.</p>
              <ul className="list-disc list-inside space-y-0.5 text-gray-600 ml-1">
                <li>32x24x32 block world</li>
                <li>9 block types</li>
                <li>Procedural terrain + trees</li>
                <li>Player physics & collision</li>
                <li>DDA raycasting</li>
                <li>Exposed face culling</li>
                <li>Resolution scaling</li>
              </ul>
            </div>
          </aside>
        )}
      </main>
    </div>
  );
}
