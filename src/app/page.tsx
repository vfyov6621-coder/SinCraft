'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Game, GameStats } from '@/lib/engine/engine';
import { BlockType, HOTBAR_BLOCKS, BLOCK_NAMES } from '@/lib/engine/blocks';
import { WorldSettings, defaultSettings } from '@/lib/engine/world';
import { CHUNK_SIZE } from '@/lib/engine/chunk';
import {
  getSavedWorlds, saveWorld, deleteWorld, generateId,
  WorldSaveData, loadWorld, estimateMemoryMB,
} from '@/lib/engine/save';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
  Gauge, Triangle, Monitor, Info, Play, Plus, Trash2, Save, FolderOpen,
  Globe, Users, Pause, LogOut, ArrowLeft, Mountain, Waves, Trees, Box,
  Loader2, Eye,
} from 'lucide-react';

type Screen = 'menu' | 'worlds' | 'create' | 'playing' | 'multiplayer';

const TERRAIN_LABELS: Record<string, string> = {
  normal: 'Normal',
  flat: 'Flat',
  mountains: 'Mountains',
  islands: 'Islands',
};

const TERRAIN_ICONS: Record<string, React.ReactNode> = {
  normal: <Mountain className="w-4 h-4" />,
  flat: <Box className="w-4 h-4" />,
  mountains: <Mountain className="w-4 h-4" />,
  islands: <Waves className="w-4 h-4" />,
};

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const readyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [screen, setScreen] = useState<Screen>('menu');
  const [stats, setStats] = useState<GameStats>({ fps: 0, triangles: 0, drawCalls: 0, chunksVisible: 0, chunksTotal: 0, res: '0x0' });
  const [ready, setReady] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(0);
  const [showHelp, setShowHelp] = useState(true);
  const [paused, setPaused] = useState(false);
  const [resolutionScale, setResolutionScale] = useState(0.75);
  const [renderDistance, setRenderDistance] = useState(8);
  const [loadingText, setLoadingText] = useState('');

  // World creation settings
  const [newWorldName, setNewWorldName] = useState('');
  const [newWorldSeed, setNewWorldSeed] = useState('');
  const [worldChunkSize, setWorldChunkSize] = useState(8);
  const [worldHeight, setWorldHeight] = useState(64);
  const [terrainType, setTerrainType] = useState<WorldSettings['terrainType']>('normal');
  const [treeDensity, setTreeDensity] = useState(50);

  // World list
  const [savedWorlds, setSavedWorlds] = useState<WorldSaveData[]>([]);

  // Multiplayer
  const [playerName, setPlayerName] = useState('Steve');
  const [playerColor, setPlayerColor] = useState('#e74c3c');

  // Load player name/color from localStorage on mount
  useEffect(() => {
    setPlayerName(localStorage.getItem('litecraft_name') || 'Steve');
    setPlayerColor(localStorage.getItem('litecraft_color') || '#e74c3c');
  }, []);
  const [isMultiplayer, setIsMultiplayer] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [remotePlayers, setRemotePlayers] = useState<{ id: string; name: string; color: string }[]>([]);
  const [lanPort, setLanPort] = useState(3003);

  // Current world
  const [currentWorldId, setCurrentWorldId] = useState<string | null>(null);
  const [currentWorldName, setCurrentWorldName] = useState('New World');

  const refreshWorlds = useCallback(() => setSavedWorlds(getSavedWorlds()), []);

  useEffect(() => {
    if (resolutionScale && gameRef.current) gameRef.current.setResolutionScale(resolutionScale);
  }, [resolutionScale]);

  useEffect(() => {
    if (renderDistance && gameRef.current) gameRef.current.setRenderDistance(renderDistance);
  }, [renderDistance]);

  const togglePause = useCallback(() => {
    if (!gameRef.current) return;
    gameRef.current.togglePause();
    setPaused(p => !p);
  }, []);

  // ESC handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === 'Escape' && screen === 'playing' && ready) {
        e.preventDefault();
        togglePause();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [screen, ready, togglePause]);

  // Auto-save
  const startAutoSave = useCallback((worldId: string, worldName: string) => {
    if (autoSaveTimerRef.current) clearInterval(autoSaveTimerRef.current);
    const timer = setInterval(async () => {
      if (gameRef.current) {
        const data = gameRef.current.getSaveData();
        try {
          await saveWorld({
            id: worldId, name: worldName,
            settings: gameRef.current.settings,
            blocks: data.blocks,
            playerX: data.playerX, playerY: data.playerY, playerZ: data.playerZ,
            playerYaw: data.playerYaw,
          });
        } catch (e) {
          console.error('Auto-save failed:', e);
        }
      }
    }, 20000);
    autoSaveTimerRef.current = timer;
  }, []);

  // Manual save
  const manualSave = useCallback(async () => {
    if (!gameRef.current || !currentWorldId) return;
    const data = gameRef.current.getSaveData();
    try {
      await saveWorld({
        id: currentWorldId, name: currentWorldName,
        settings: gameRef.current.settings,
        blocks: data.blocks,
        playerX: data.playerX, playerY: data.playerY, playerZ: data.playerZ,
        playerYaw: data.playerYaw,
      });
    } catch (e) {
      console.error('Save failed:', e);
    }
  }, [currentWorldId, currentWorldName]);

  // Start game
  const startGame = useCallback(async (settings: WorldSettings, worldId?: string, worldName?: string, savedChunks?: Map<string, string>, savedPlayer?: { x: number; y: number; z: number; yaw: number }) => {
    if (gameRef.current) { gameRef.current.destroy(); gameRef.current = null; }
    setReady(false); setPaused(false); setShowHelp(true); setLoadingText('Generating world...');

    const id = worldId || generateId();
    const name = worldName || 'New World';
    setCurrentWorldId(id); setCurrentWorldName(name);
    setScreen('playing');

    // Wait for canvas to mount
    await new Promise(r => setTimeout(r, 50));
    if (!canvasRef.current) return;

    setLoadingText('Building terrain...');
    await new Promise(r => setTimeout(r, 10));

    const game = new Game(canvasRef.current, { resolutionScale, renderDistance });
    game.callbacks.onStatsUpdate = setStats;
    game.callbacks.onPause = () => setPaused(true);
    game.callbacks.onRemotePlayersUpdate = (players) => setRemotePlayers(players.map(p => ({ id: p.id, name: p.name, color: p.color })));
    game.callbacks.onSlotChange = setSelectedSlot;
    // Init with settings (generates terrain + builds meshes)
    game.init(settings, savedChunks, savedPlayer);
    gameRef.current = game;
    setLoadingText('');

    readyTimerRef.current = setTimeout(() => setReady(true), 100);
    startAutoSave(id, name);
  }, [resolutionScale, renderDistance, startAutoSave]);

  // Load saved world
  const loadAndStartWorld = useCallback(async (worldId: string) => {
    if (gameRef.current) { gameRef.current.destroy(); gameRef.current = null; }
    setReady(false); setPaused(false); setShowHelp(true);
    setLoadingText('Loading world...');

    const result = await loadWorld(worldId);
    if (!result) { setLoadingText(''); return; }

    const { meta, chunks } = result;
    setCurrentWorldId(worldId); setCurrentWorldName(meta.name);
    setScreen('playing');

    await new Promise(r => setTimeout(r, 50));
    if (!canvasRef.current) return;

    setLoadingText('Building chunks...');
    await new Promise(r => setTimeout(r, 10));

    const game = new Game(canvasRef.current, { resolutionScale, renderDistance });
    game.callbacks.onStatsUpdate = setStats;
    game.callbacks.onPause = () => setPaused(true);
    game.callbacks.onRemotePlayersUpdate = (players) => setRemotePlayers(players.map(p => ({ id: p.id, name: p.name, color: p.color })));
    game.callbacks.onSlotChange = setSelectedSlot;
    game.init(meta.settings, chunks, { x: meta.playerX, y: meta.playerY, z: meta.playerZ, yaw: meta.playerYaw });
    gameRef.current = game;
    setLoadingText('');

    readyTimerRef.current = setTimeout(() => setReady(true), 100);
    startAutoSave(worldId, meta.name);
  }, [resolutionScale, renderDistance, startAutoSave]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (gameRef.current) { gameRef.current.destroy(); gameRef.current = null; }
      if (autoSaveTimerRef.current) clearInterval(autoSaveTimerRef.current);
      if (readyTimerRef.current) clearTimeout(readyTimerRef.current);
    };
  }, []);

  // Quit to menu
  const quitToMenu = useCallback(async () => {
    await manualSave();
    if (gameRef.current) { gameRef.current.destroy(); gameRef.current = null; }
    if (autoSaveTimerRef.current) clearInterval(autoSaveTimerRef.current);
    if (readyTimerRef.current) clearTimeout(readyTimerRef.current);
    setReady(false); setPaused(false); setLoadingText('');
    setIsMultiplayer(false); setIsHost(false); setRemotePlayers([]);
    refreshWorlds();
    setScreen('menu');
  }, [manualSave, refreshWorlds]);

  // Host LAN game
  const hostGame = useCallback(() => {
    localStorage.setItem('litecraft_name', playerName);
    localStorage.setItem('litecraft_color', playerColor);
    if (!gameRef.current) return;
    const pid = generateId();
    gameRef.current.hostNetwork(pid, playerName, playerColor, lanPort);
    setIsMultiplayer(true); setIsHost(true);
  }, [playerName, playerColor, lanPort]);

  // Delete world
  const deleteSavedWorld = useCallback(async (id: string) => {
    await deleteWorld(id);
    refreshWorlds();
  }, [refreshWorlds]);

  const fpsColor = stats.fps >= 50 ? 'text-emerald-400' : stats.fps >= 30 ? 'text-yellow-400' : 'text-red-400';

  const blockColorMap: Record<number, string> = {
    [BlockType.Grass]: 'bg-green-600', [BlockType.Dirt]: 'bg-amber-700',
    [BlockType.Stone]: 'bg-gray-500', [BlockType.Wood]: 'bg-amber-900',
    [BlockType.Planks]: 'bg-amber-600', [BlockType.Cobblestone]: 'bg-gray-600',
    [BlockType.Sand]: 'bg-yellow-500', [BlockType.Leaves]: 'bg-green-800',
    [BlockType.Snow]: 'bg-gray-100',
  };

  const memMB = estimateMemoryMB(worldChunkSize, worldHeight);

  // ==================== SCREENS ====================

  // --- Main Menu ---
  if (screen === 'menu') return (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-950 text-gray-100 select-none">
      <div className="w-full max-w-sm space-y-6 p-6">
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2">
            <Triangle className="w-10 h-10 text-emerald-400" />
            <h1 className="text-4xl font-black tracking-tight">LiteCraft</h1>
          </div>
          <p className="text-gray-500 text-sm">Chunk-based voxel engine for weak PCs</p>
        </div>
        <div className="space-y-3">
          <Button onClick={() => { refreshWorlds(); setScreen('worlds'); }} className="w-full h-12 text-base bg-emerald-600 hover:bg-emerald-500 gap-2">
            <Play className="w-5 h-5" /> Singleplayer
          </Button>
          <Button onClick={() => setScreen('multiplayer')} variant="outline" className="w-full h-12 text-base border-gray-700 hover:border-emerald-500 hover:bg-emerald-950 gap-2">
            <Globe className="w-5 h-5" /> Multiplayer (LAN)
          </Button>
        </div>
        <Separator className="bg-gray-800" />
        <div className="space-y-2">
          <label className="text-xs text-gray-500">Your Name</label>
          <Input value={playerName} onChange={e => setPlayerName(e.target.value)} className="bg-gray-900 border-gray-700" maxLength={16} />
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">Color</label>
            <input type="color" value={playerColor} onChange={e => setPlayerColor(e.target.value)} className="w-8 h-8 rounded cursor-pointer border-0" />
          </div>
        </div>
        <p className="text-center text-[10px] text-gray-700">WebGL 2 Engine - Chunks: {CHUNK_SIZE}x{CHUNK_SIZE} - Up to 100x100 chunks</p>
      </div>
    </div>
  );

  // --- World List ---
  if (screen === 'worlds') return (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-950 text-gray-100 select-none">
      <div className="w-full max-w-md space-y-4 p-6">
        <div className="flex items-center gap-2 mb-4">
          <button onClick={() => setScreen('menu')} className="text-gray-500 hover:text-gray-300"><ArrowLeft className="w-5 h-5" /></button>
          <h2 className="text-xl font-bold flex-1">Select World</h2>
        </div>
        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
          {savedWorlds.length === 0 && <p className="text-gray-600 text-sm text-center py-8">No saved worlds yet. Create one!</p>}
          {savedWorlds.map(w => (
            <Card key={w.id} className="bg-gray-900 border-gray-700 p-3 flex items-center gap-3">
              <FolderOpen className="w-5 h-5 text-emerald-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{w.name}</p>
                <p className="text-[10px] text-gray-500">
                  {w.settings.chunkSize}x{w.settings.chunkSize} chunks ({w.settings.chunkSize * CHUNK_SIZE}x{w.settings.chunkSize * CHUNK_SIZE} blocks)
                  &middot; H{w.settings.worldHeight}
                  &middot; {TERRAIN_LABELS[w.settings.terrainType]}
                  &middot; {new Date(w.updatedAt).toLocaleDateString()}
                </p>
              </div>
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-500 shrink-0" onClick={() => loadAndStartWorld(w.id)}>
                <Play className="w-4 h-4" />
              </Button>
              <Button size="sm" variant="ghost" className="text-gray-500 hover:text-red-400 shrink-0" onClick={() => deleteSavedWorld(w.id)}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </Card>
          ))}
        </div>
        <Button onClick={() => setScreen('create')} variant="outline" className="w-full border-dashed border-gray-700 hover:border-emerald-500 gap-2">
          <Plus className="w-4 h-4" /> Create New World
        </Button>
      </div>
    </div>
  );

  // --- Create World ---
  if (screen === 'create') return (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-950 text-gray-100 select-none overflow-y-auto">
      <div className="w-full max-w-sm space-y-4 p-6">
        <div className="flex items-center gap-2 mb-2">
          <button onClick={() => setScreen('worlds')} className="text-gray-500 hover:text-gray-300"><ArrowLeft className="w-5 h-5" /></button>
          <h2 className="text-xl font-bold flex-1">Create World</h2>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">World Name</label>
            <Input value={newWorldName} onChange={e => setNewWorldName(e.target.value)} placeholder="My World" className="bg-gray-900 border-gray-700" maxLength={32} />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Seed (optional)</label>
            <Input value={newWorldSeed} onChange={e => setNewWorldSeed(e.target.value)} placeholder="Random" className="bg-gray-900 border-gray-700" />
          </div>

          <Separator className="bg-gray-800" />

          <div>
            <div className="flex justify-between mb-1">
              <label className="text-xs text-gray-500">World Size (chunks)</label>
              <span className="text-xs text-emerald-400 font-mono">{worldChunkSize}x{worldChunkSize}</span>
            </div>
            <Slider value={[worldChunkSize]} onValueChange={v => setWorldChunkSize(v[0])} min={2} max={100} step={1} className="w-full" />
            <div className="flex justify-between mt-1">
              <span className="text-[10px] text-gray-600">{worldChunkSize * CHUNK_SIZE}x{worldChunkSize * CHUNK_SIZE} blocks</span>
              <span className="text-[10px] text-gray-600">~{memMB} MB RAM</span>
            </div>
          </div>

          <div>
            <div className="flex justify-between mb-1">
              <label className="text-xs text-gray-500">World Height</label>
              <span className="text-xs text-emerald-400 font-mono">{worldHeight}</span>
            </div>
            <Slider value={[worldHeight]} onValueChange={v => setWorldHeight(v[0])} min={32} max={128} step={16} className="w-full" />
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-1 block">Terrain Type</label>
            <div className="grid grid-cols-2 gap-1.5">
              {(['normal', 'flat', 'mountains', 'islands'] as const).map(t => (
                <button key={t} onClick={() => setTerrainType(t)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-xs border transition-colors ${
                    terrainType === t ? 'border-emerald-500 bg-emerald-950 text-emerald-400' : 'border-gray-700 bg-gray-900 text-gray-400 hover:border-gray-600'
                  }`}>
                  {TERRAIN_ICONS[t]}
                  {TERRAIN_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex justify-between mb-1">
              <label className="text-xs text-gray-500 flex items-center gap-1"><Trees className="w-3 h-3" />Tree Density</label>
              <span className="text-xs text-emerald-400 font-mono">{treeDensity}%</span>
            </div>
            <Slider value={[treeDensity]} onValueChange={v => setTreeDensity(v[0])} min={0} max={100} step={5} className="w-full" />
          </div>
        </div>

        {memMB > 100 && (
          <div className="bg-yellow-950/50 border border-yellow-800/50 rounded-md p-2 text-[10px] text-yellow-500">
            Warning: Large world (~{memMB} MB). May be slow on weak PCs.
          </div>
        )}

        <Button onClick={() => {
          const name = newWorldName.trim() || 'New World';
          const seed = newWorldSeed.trim() ? parseInt(newWorldSeed) || Math.floor(Math.random() * 99999) : Math.floor(Math.random() * 99999);
          const settings: WorldSettings = {
            seed, chunkSize: worldChunkSize, worldHeight,
            terrainType, treeDensity,
          };
          startGame(settings, generateId(), name);
        }} className="w-full h-11 bg-emerald-600 hover:bg-emerald-500 gap-2">
          <Plus className="w-4 h-4" /> Create World
        </Button>
      </div>
    </div>
  );

  // --- Multiplayer Setup ---
  if (screen === 'multiplayer') return (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-950 text-gray-100 select-none">
      <div className="w-full max-w-sm space-y-4 p-6">
        <div className="flex items-center gap-2 mb-4">
          <button onClick={() => setScreen('menu')} className="text-gray-500 hover:text-gray-300"><ArrowLeft className="w-5 h-5" /></button>
          <h2 className="text-xl font-bold flex-1">Multiplayer (LAN)</h2>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Your Name</label>
            <Input value={playerName} onChange={e => setPlayerName(e.target.value)} className="bg-gray-900 border-gray-700" maxLength={16} />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">Color</label>
            <input type="color" value={playerColor} onChange={e => setPlayerColor(e.target.value)} className="w-8 h-8 rounded cursor-pointer border-0" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Server Port</label>
            <Input value={lanPort} onChange={e => setLanPort(parseInt(e.target.value) || 3003)} type="number" className="bg-gray-900 border-gray-700" />
          </div>
        </div>
        <div className="space-y-2">
          <Button onClick={() => { refreshWorlds(); setScreen('worlds'); }} variant="outline" className="w-full border-gray-700 gap-2">
            <Play className="w-4 h-4" /> Host Game
          </Button>
          <Separator className="bg-gray-800" />
          <Button onClick={() => {
            localStorage.setItem('litecraft_name', playerName);
            localStorage.setItem('litecraft_color', playerColor);
            const settings = defaultSettings();
            startGame(settings, generateId(), 'LAN World');
            setTimeout(() => {
              if (gameRef.current) {
                const pid = generateId();
                gameRef.current.startNetwork(pid, playerName, playerColor, lanPort);
                setIsMultiplayer(true); setIsHost(false);
              }
            }, 500);
          }} className="w-full bg-emerald-600 hover:bg-emerald-500 gap-2">
            <Globe className="w-4 h-4" /> Join LAN Game
          </Button>
        </div>
        <p className="text-[10px] text-gray-600 text-center">Other players on the same network can join</p>
      </div>
    </div>
  );

  // ==================== PLAYING ====================
  return (
    <div className="flex flex-col h-screen bg-gray-950 text-gray-100 overflow-hidden select-none">
      {/* Header */}
      <header className="flex items-center justify-between px-3 py-1.5 bg-gray-900/90 border-b border-gray-800 z-20">
        <div className="flex items-center gap-2">
          <Triangle className="w-4 h-4 text-emerald-400" />
          <h1 className="text-sm font-bold">{currentWorldName}</h1>
          {isMultiplayer && (
            <Badge variant="outline" className="text-[10px] border-emerald-700 text-emerald-400 gap-1">
              <Users className="w-3 h-3" /> {remotePlayers.length + 1}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="text-xs text-gray-500 hidden sm:block">
            FPS: <span className={`font-mono font-bold ${fpsColor}`}>{stats.fps}</span>
          </div>
          <Badge variant="outline" className="text-[10px] border-gray-700 text-gray-500 hidden md:inline-flex">
            {stats.chunksVisible}/{stats.chunksTotal} chunks
          </Badge>
        </div>
      </header>

      <main className="flex flex-1 overflow-hidden relative">
        <div className="flex-1 relative bg-black">
          <canvas ref={canvasRef} className="w-full h-full block" />

          {/* Loading overlay */}
          {loadingText && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-30">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
                <p className="text-sm text-gray-300">{loadingText}</p>
              </div>
            </div>
          )}

          {/* Crosshair */}
          {ready && !paused && !loadingText && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
              <div className="relative w-6 h-6">
                <div className="absolute top-1/2 left-0 right-0 h-[2px] -translate-y-1/2 bg-white/70" />
                <div className="absolute left-1/2 top-0 bottom-0 w-[2px] -translate-x-1/2 bg-white/70" />
              </div>
            </div>
          )}

          {/* Hotbar */}
          {ready && !paused && !loadingText && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10">
              <div className="flex gap-1 p-1.5 bg-black/60 rounded-lg backdrop-blur-sm border border-gray-700/50">
                {HOTBAR_BLOCKS.map((bt, i) => (
                  <div key={i} className={`w-11 h-11 rounded-md flex items-center justify-center relative transition-all ${i === selectedSlot ? 'ring-2 ring-white scale-110 bg-white/20' : 'bg-white/5'}`}>
                    <div className={`w-7 h-7 rounded-sm ${blockColorMap[bt] || 'bg-gray-500'}`} />
                    <span className="absolute bottom-0.5 right-1 text-[8px] text-gray-400 font-mono">{i + 1}</span>
                  </div>
                ))}
              </div>
              <div className="text-center mt-1 text-[10px] text-gray-400">{BLOCK_NAMES[HOTBAR_BLOCKS[selectedSlot]]}</div>
            </div>
          )}

          {/* Remote players */}
          {ready && !paused && remotePlayers.length > 0 && (
            <div className="absolute top-3 left-3 z-10">
              <Card className="bg-black/60 border-gray-700/50 p-2 backdrop-blur-sm">
                <div className="flex items-center gap-1.5 text-emerald-400 text-[10px] font-semibold mb-1">
                  <Users className="w-3 h-3" /> Online
                </div>
                {remotePlayers.map(p => (
                  <div key={p.id} className="flex items-center gap-1.5 text-[10px] text-gray-400">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
                    <span>{p.name}</span>
                  </div>
                ))}
              </Card>
            </div>
          )}

          {/* Stats Panel */}
          {ready && !loadingText && (
            <div className="absolute top-3 right-3 z-10">
              <Card className="bg-black/60 border-gray-700/50 p-2 backdrop-blur-sm min-w-[120px]">
                <div className="space-y-0.5 text-[11px]">
                  <div className="flex justify-between"><span className="text-gray-500 flex items-center gap-1"><Gauge className="w-3 h-3" />FPS</span><span className={`font-mono font-bold ${fpsColor}`}>{stats.fps}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500 flex items-center gap-1"><Triangle className="w-3 h-3" />Tris</span><span className="font-mono text-gray-300">{(stats.triangles / 1000).toFixed(0)}K</span></div>
                  <div className="flex justify-between"><span className="text-gray-500 flex items-center gap-1"><Eye className="w-3 h-3" />Chunks</span><span className="font-mono text-gray-300">{stats.chunksVisible}/{stats.chunksTotal}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500 flex items-center gap-1"><Monitor className="w-3 h-3" />Res</span><span className="font-mono text-gray-300">{stats.res}</span></div>
                </div>
              </Card>
            </div>
          )}

          {/* Help */}
          {showHelp && ready && !paused && !loadingText && (
            <div className="absolute bottom-20 left-4 z-10">
              <Card className="bg-black/60 border-gray-700/50 p-2.5 backdrop-blur-sm max-w-[190px]">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-emerald-400 text-xs font-semibold flex items-center gap-1"><Info className="w-3 h-3" />Controls</span>
                  <button onClick={() => setShowHelp(false)} className="text-gray-500 hover:text-gray-300 text-xs">x</button>
                </div>
                <div className="space-y-0.5 text-[10px] text-gray-400">
                  <p><kbd className="px-1 py-0.5 bg-gray-800 rounded text-gray-300 font-mono text-[9px]">WASD</kbd> Move</p>
                  <p><kbd className="px-1 py-0.5 bg-gray-800 rounded text-gray-300 font-mono text-[9px]">Mouse</kbd> Look (click)</p>
                  <p><kbd className="px-1 py-0.5 bg-gray-800 rounded text-gray-300 font-mono text-[9px]">Space</kbd> Jump</p>
                  <p><kbd className="px-1 py-0.5 bg-gray-800 rounded text-gray-300 font-mono text-[9px]">LMB/RMB</kbd> Break/Place</p>
                  <p><kbd className="px-1 py-0.5 bg-gray-800 rounded text-gray-300 font-mono text-[9px]">ESC</kbd> Pause</p>
                </div>
              </Card>
            </div>
          )}

          {/* Pause Menu */}
          {paused && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-30 backdrop-blur-sm">
              <Card className="bg-gray-900 border-gray-700 p-6 w-full max-w-xs mx-4 space-y-3">
                <div className="text-center mb-2">
                  <h2 className="text-lg font-bold">Game Paused</h2>
                  <p className="text-xs text-gray-500">{currentWorldName}</p>
                  {gameRef.current && (
                    <p className="text-[10px] text-gray-600 mt-1">
                      {gameRef.current.settings.chunkSize}x{gameRef.current.settings.chunkSize} chunks
                      &middot; H{gameRef.current.settings.worldHeight}
                      &middot; {TERRAIN_LABELS[gameRef.current.settings.terrainType]}
                    </p>
                  )}
                </div>
                <Button onClick={() => { gameRef.current?.togglePause(); setPaused(false); }} className="w-full bg-emerald-600 hover:bg-emerald-500 gap-2">
                  <Play className="w-4 h-4" /> Resume
                </Button>
                <Button onClick={() => manualSave()} variant="outline" className="w-full border-gray-700 gap-2">
                  <Save className="w-4 h-4" /> Save World
                </Button>

                {/* Render settings */}
                <div className="bg-gray-800/50 rounded-md p-2.5 space-y-2">
                  <p className="text-xs text-gray-400 font-semibold">Settings</p>
                  <div>
                    <div className="flex justify-between mb-0.5">
                      <label className="text-[10px] text-gray-500">Resolution Scale</label>
                      <span className="text-[10px] text-emerald-400 font-mono">{Math.round(resolutionScale * 100)}%</span>
                    </div>
                    <Slider value={[resolutionScale]} onValueChange={v => setResolutionScale(v[0])} min={0.25} max={1} step={0.05} className="w-full" />
                  </div>
                  <div>
                    <div className="flex justify-between mb-0.5">
                      <label className="text-[10px] text-gray-500">Render Distance</label>
                      <span className="text-[10px] text-emerald-400 font-mono">{renderDistance} chunks</span>
                    </div>
                    <Slider value={[renderDistance]} onValueChange={v => setRenderDistance(v[0])} min={2} max={24} step={1} className="w-full" />
                  </div>
                </div>

                {!isMultiplayer && (
                  <Button onClick={hostGame} variant="outline" className="w-full border-gray-700 gap-2">
                    <Globe className="w-4 h-4" /> Host LAN Game
                  </Button>
                )}
                {isMultiplayer && (
                  <Button variant="outline" className="w-full border-gray-700 gap-2 opacity-50 cursor-not-allowed" disabled>
                    <Globe className="w-4 h-4" /> {isHost ? 'Hosting...' : 'Connected'}
                  </Button>
                )}
                <Separator className="bg-gray-800" />
                <Button onClick={quitToMenu} variant="outline" className="w-full border-red-800 hover:border-red-500 hover:bg-red-950 hover:text-red-400 gap-2">
                  <LogOut className="w-4 h-4" /> Save & Quit to Menu
                </Button>
              </Card>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
