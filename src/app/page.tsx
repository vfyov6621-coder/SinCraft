'use client';

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { Game, GameStats } from '@/lib/engine/engine';
import { BlockType, HOTBAR_BLOCKS, BLOCK_COLORS, BLOCK_NAMES, ItemStack, CRAFTING_RECIPES, removeFromInventory, addToInventory, hasItems, createInventory } from '@/lib/engine/blocks';
import { WorldSettings, defaultSettings } from '@/lib/engine/world';
import { CHUNK_SIZE } from '@/lib/engine/chunk';
import {
  getSavedWorlds, saveWorld, deleteWorld, generateId,
  WorldSaveData, loadWorld, estimateMemoryMB,
} from '@/lib/engine/save';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
  Play, Plus, Trash2, Save, FolderOpen, Globe, Users,
  LogOut, ArrowLeft, Mountain, Waves, Box,
  Loader2, Bird, Heart, Drumstick, Monitor,
  Settings, Swords, Palette, Skull, Hammer,
  ChevronRight, RotateCcw, Wifi, X,
} from 'lucide-react';

type Screen = 'menu' | 'worlds' | 'create' | 'playing' | 'multiplayer' | 'settings';

const TERRAIN_LABELS: Record<string, string> = {
  normal: 'Обычный', flat: 'Равнина', mountains: 'Горы',
  islands: 'Острова', parkour: 'Паркур',
};

const TERRAIN_ICONS: Record<string, React.ReactNode> = {
  normal: <Mountain className="w-4 h-4" />, flat: <Box className="w-4 h-4" />,
  mountains: <Mountain className="w-4 h-4" />, islands: <Waves className="w-4 h-4" />,
  parkour: <Box className="w-4 h-4" />,
};

const TERRAIN_DESC: Record<string, string> = {
  normal: 'Холмы и леса', flat: 'Плоские равнины', mountains: 'Высокие пики',
  islands: 'Парящие острова', parkour: 'Платформы для прыжков',
};

const ALL_TERRAINS = ['normal', 'flat', 'mountains', 'islands', 'parkour'] as const;

const BLOCK_COLOR_MAP: Record<number, string> = {
  [BlockType.Grass]: 'bg-green-600', [BlockType.Dirt]: 'bg-amber-700',
  [BlockType.Stone]: 'bg-gray-500', [BlockType.OakLog]: 'bg-amber-900',
  [BlockType.OakPlanks]: 'bg-amber-600', [BlockType.Cobblestone]: 'bg-gray-600',
  [BlockType.Sand]: 'bg-yellow-500', [BlockType.OakLeaves]: 'bg-green-800',
  [BlockType.Snow]: 'bg-gray-100', [BlockType.Brick]: 'bg-red-700',
  [BlockType.Glass]: 'bg-blue-300', [BlockType.Torch]: 'bg-yellow-400',
  [BlockType.Glowstone]: 'bg-amber-300', [BlockType.IronOre]: 'bg-gray-400',
  [BlockType.GoldOre]: 'bg-yellow-600', [BlockType.DiamondOre]: 'bg-cyan-400',
  [BlockType.CoalOre]: 'bg-gray-800', [BlockType.BirchLog]: 'bg-orange-100',
  [BlockType.SpruceLog]: 'bg-amber-950', [BlockType.BirchPlanks]: 'bg-orange-200',
  [BlockType.SprucePlanks]: 'bg-amber-800', [BlockType.StoneBrick]: 'bg-gray-500',
  [BlockType.Water]: 'bg-blue-600', [BlockType.Lava]: 'bg-orange-500',
  [BlockType.Wheat]: 'bg-yellow-700', [BlockType.Farmland]: 'bg-amber-900',
  [BlockType.WoolWhite]: 'bg-white', [BlockType.WoolRed]: 'bg-red-500',
  [BlockType.WoolBlue]: 'bg-blue-500', [BlockType.WoolGreen]: 'bg-green-500',
  [BlockType.WoolYellow]: 'bg-yellow-400', [BlockType.WoolBlack]: 'bg-gray-900',
  [BlockType.IronBlock]: 'bg-gray-300', [BlockType.GoldBlock]: 'bg-yellow-500',
  [BlockType.DiamondBlock]: 'bg-cyan-300', [BlockType.CraftTable]: 'bg-amber-700',
  [BlockType.FurnaceBlock]: 'bg-gray-600', [BlockType.Bookshelf]: 'bg-amber-800',
  [BlockType.Ice]: 'bg-blue-200', [BlockType.Bedrock]: 'bg-gray-900',
};

// Crafting grid helper: check if 2x2 grid matches a recipe
function checkCraftingGrid(grid: (ItemStack | null)[]): ItemStack | null {
  // Collect non-empty slots
  const ingredients: { block: BlockType; count: number }[] = [];
  for (const slot of grid) {
    if (slot && slot.count > 0 && slot.block !== BlockType.Air) {
      const existing = ingredients.find(i => i.block === slot.block);
      if (existing) existing.count += slot.count;
      else ingredients.push({ block: slot.block, count: slot.count });
    }
  }
  if (ingredients.length === 0) return null;

  // Check each recipe
  for (const recipe of CRAFTING_RECIPES) {
    if (recipe.ingredients.length !== ingredients.length) continue;
    let match = true;
    for (const ing of recipe.ingredients) {
      const found = ingredients.find(i => i.block === ing.block && i.count >= ing.count);
      if (!found) { match = false; break; }
    }
    if (match) return { block: recipe.result, count: recipe.count };
  }
  return null;
}

// Slot component for inventory
function InvSlot({ item, active, onClick, small }: { item: ItemStack | null; active?: boolean; onClick?: () => void; small?: boolean }) {
  const s = small ? 'w-10 h-10' : 'w-12 h-12';
  const colorClass = item && item.count > 0 && item.block !== BlockType.Air ? (BLOCK_COLOR_MAP[item.block] || 'bg-gray-500') : '';
  return (
    <div onClick={onClick} className={`${s} rounded flex items-center justify-center relative transition-all cursor-pointer border
      ${active ? 'ring-2 ring-white/80 scale-110 bg-white/20 border-white/50' : 'bg-black/60 border-gray-600/60 hover:bg-white/10 hover:border-gray-500/60'}`}>
      {item && item.count > 0 && item.block !== BlockType.Air && (
        <>
          <div className={`w-7 h-7 rounded-sm ${small ? 'w-6 h-6' : ''} ${colorClass}`} />
          {item.count > 1 && <span className="absolute bottom-0.5 right-0.5 text-[9px] text-white font-mono font-bold drop-shadow-lg">{item.count}</span>}
        </>
      )}
    </div>
  );
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const readyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [screen, setScreen] = useState<Screen>('menu');
  const [stats, setStats] = useState<GameStats>({ fps: 0, flying: false, health: 20, hunger: 20, position: { x: 0, y: 0, z: 0 } });
  const [ready, setReady] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(0);
  const [paused, setPaused] = useState(false);
  const [isFlying, setIsFlying] = useState(false);
  const [resolutionScale, setResolutionScale] = useState(0.75);
  const [renderDistance, setRenderDistance] = useState(10);
  const [maxFps, setMaxFps] = useState(0);
  const [loadingText, setLoadingText] = useState('');
  const [inventory, setInventory] = useState<ItemStack[]>([]);

  // New states
  const [showInventory, setShowInventory] = useState(false);
  const [isDead, setIsDead] = useState(false);
  const [breakingInfo, setBreakingInfo] = useState({ progress: 0, max: 1 });
  const [blockLookName, setBlockLookName] = useState('');
  const [heldItem, setHeldItem] = useState<ItemStack | null>(null);
  const [craftGrid, setCraftGrid] = useState<(ItemStack | null)[]>([null, null, null, null]);

  // World creation
  const [newWorldName, setNewWorldName] = useState('');
  const [newWorldSeed, setNewWorldSeed] = useState('');
  const [worldChunkSize, setWorldChunkSize] = useState(16);
  const [worldHeight, setWorldHeight] = useState(80);
  const [terrainType, setTerrainType] = useState<WorldSettings['terrainType']>('normal');
  const [treeDensity, setTreeDensity] = useState(40);
  const [gameMode, setGameMode] = useState<'survival' | 'creative'>('survival');

  // World list
  const [savedWorlds, setSavedWorlds] = useState<WorldSaveData[]>([]);

  // Multiplayer
  const [playerName, setPlayerName] = useState('Steve');
  const [playerColor, setPlayerColor] = useState('#e74c3c');
  useEffect(() => {
    setPlayerName(localStorage.getItem('sincraft_name') || 'Steve');
    setPlayerColor(localStorage.getItem('sincraft_color') || '#e74c3c');
  }, []);
  const [isMultiplayer, setIsMultiplayer] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [remotePlayers, setRemotePlayers] = useState<{ id: string; name: string; color: string }[]>([]);
  const [lanPort, setLanPort] = useState(3003);

  // Current world
  const [currentWorldId, setCurrentWorldId] = useState<string | null>(null);
  const [currentWorldName, setCurrentWorldName] = useState('Новый мир');

  const refreshWorlds = useCallback(() => setSavedWorlds(getSavedWorlds()), []);

  useEffect(() => { if (resolutionScale && gameRef.current) gameRef.current.setResolutionScale(resolutionScale); }, [resolutionScale]);
  useEffect(() => { if (renderDistance && gameRef.current) gameRef.current.setRenderDistance(renderDistance); }, [renderDistance]);
  useEffect(() => { if (gameRef.current) gameRef.current.setMaxFps(maxFps); }, [maxFps]);

  const togglePause = useCallback(() => {
    if (!gameRef.current) return;
    gameRef.current.togglePause();
    setPaused(p => !p);
  }, []);

  const resumeGame = useCallback(() => {
    if (!gameRef.current) return;
    gameRef.current.resumeGame();
    setPaused(false);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === 'Escape' && screen === 'playing' && ready) {
        e.preventDefault();
        if (showInventory) {
          setShowInventory(false);
          if (gameRef.current) {
            gameRef.current.isInventoryOpen = false;
            gameRef.current.resumeGame();
          }
          return;
        }
        if (isDead) return;
        if (paused) resumeGame(); else togglePause();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [screen, ready, togglePause, resumeGame, paused, showInventory, isDead]);

  const startAutoSave = useCallback((worldId: string, worldName: string) => {
    if (autoSaveTimerRef.current) clearInterval(autoSaveTimerRef.current);
    const timer = setInterval(async () => {
      if (gameRef.current) {
        const data = gameRef.current.getSaveData();
        try {
          await saveWorld({ id: worldId, name: worldName, settings: gameRef.current.settings, blocks: data.blocks, playerX: data.playerX, playerY: data.playerY, playerZ: data.playerZ, playerYaw: data.playerYaw });
        } catch (e) { console.error('Auto-save failed:', e); }
      }
    }, 30000);
    autoSaveTimerRef.current = timer;
  }, []);

  const manualSave = useCallback(async () => {
    if (!gameRef.current || !currentWorldId) return;
    const data = gameRef.current.getSaveData();
    try { await saveWorld({ id: currentWorldId, name: currentWorldName, settings: gameRef.current.settings, blocks: data.blocks, playerX: data.playerX, playerY: data.playerY, playerZ: data.playerZ, playerYaw: data.playerYaw }); } catch (e) { console.error('Save failed:', e); }
  }, [currentWorldId, currentWorldName]);

  const initGameCallbacks = useCallback((game: Game) => {
    game.callbacks.onStatsUpdate = setStats;
    game.callbacks.onPause = () => setPaused(true);
    game.callbacks.onRemotePlayersUpdate = (players) => setRemotePlayers(players.map(p => ({ id: p.id, name: p.name, color: p.color })));
    game.callbacks.onSlotChange = setSelectedSlot;
    game.callbacks.onFlightToggle = (flying) => setIsFlying(flying);
    game.callbacks.onHealthUpdate = (health, hunger) => setStats(s => ({ ...s, health, hunger }));
    game.callbacks.onInventoryUpdate = (inv) => setInventory([...inv]);
    game.callbacks.onBreakingProgress = (progress, max) => setBreakingInfo({ progress, max });
    game.callbacks.onInventoryToggle = (open) => setShowInventory(open);
    game.callbacks.onBlockLookAt = (name) => setBlockLookName(name);
    game.callbacks.onDeath = () => setIsDead(true);
  }, []);

  const startGame = useCallback(async (settings: WorldSettings, worldId?: string, worldName?: string, savedChunks?: Map<string, string>, savedPlayer?: { x: number; y: number; z: number; yaw: number }) => {
    if (gameRef.current) { gameRef.current.destroy(); gameRef.current = null; }
    setReady(false); setPaused(false); setIsDead(false); setShowInventory(false); setLoadingText('Генерация мира...');
    const id = worldId || generateId();
    const name = worldName || 'Новый мир';
    setCurrentWorldId(id); setCurrentWorldName(name);
    setScreen('playing');
    await new Promise(r => setTimeout(r, 50));
    if (!canvasRef.current) return;
    setLoadingText('Построение ландшафта...');
    await new Promise(r => setTimeout(r, 10));

    const game = new Game(canvasRef.current, { resolutionScale, renderDistance, maxFps });
    initGameCallbacks(game);
    game.init(settings, savedChunks, savedPlayer);
    gameRef.current = game;
    setInventory([...game.inventory]);
    setLoadingText('');
    readyTimerRef.current = setTimeout(() => setReady(true), 100);
    startAutoSave(id, name);
  }, [resolutionScale, renderDistance, maxFps, startAutoSave, initGameCallbacks]);

  const loadAndStartWorld = useCallback(async (worldId: string) => {
    if (gameRef.current) { gameRef.current.destroy(); gameRef.current = null; }
    setReady(false); setPaused(false); setIsDead(false); setShowInventory(false); setLoadingText('Загрузка мира...');
    const result = await loadWorld(worldId);
    if (!result) { setLoadingText(''); return; }
    const { meta, chunks } = result;
    setCurrentWorldId(worldId); setCurrentWorldName(meta.name);
    setScreen('playing');
    await new Promise(r => setTimeout(r, 50));
    if (!canvasRef.current) return;
    setLoadingText('Загрузка чанков...');
    await new Promise(r => setTimeout(r, 10));
    const game = new Game(canvasRef.current, { resolutionScale, renderDistance, maxFps });
    initGameCallbacks(game);
    game.init(meta.settings, chunks, { x: meta.playerX, y: meta.playerY, z: meta.playerZ, yaw: meta.playerYaw });
    gameRef.current = game;
    setInventory([...game.inventory]);
    setLoadingText('');
    readyTimerRef.current = setTimeout(() => setReady(true), 100);
    startAutoSave(worldId, meta.name);
  }, [resolutionScale, renderDistance, maxFps, startAutoSave, initGameCallbacks]);

  useEffect(() => {
    return () => {
      if (gameRef.current) { gameRef.current.destroy(); gameRef.current = null; }
      if (autoSaveTimerRef.current) clearInterval(autoSaveTimerRef.current);
      if (readyTimerRef.current) clearTimeout(readyTimerRef.current);
    };
  }, []);

  const quitToMenu = useCallback(async () => {
    await manualSave();
    if (gameRef.current) { gameRef.current.destroy(); gameRef.current = null; }
    if (autoSaveTimerRef.current) clearInterval(autoSaveTimerRef.current);
    if (readyTimerRef.current) clearTimeout(readyTimerRef.current);
    setReady(false); setPaused(false); setLoadingText(''); setIsFlying(false); setInventory([]);
    setIsMultiplayer(false); setIsHost(false); setRemotePlayers([]); setIsDead(false); setShowInventory(false);
    refreshWorlds(); setScreen('menu');
  }, [manualSave, refreshWorlds]);

  const hostGame = useCallback(() => {
    localStorage.setItem('sincraft_name', playerName);
    localStorage.setItem('sincraft_color', playerColor);
    if (!gameRef.current) return;
    gameRef.current.hostNetwork(generateId(), playerName, playerColor, lanPort);
    setIsMultiplayer(true); setIsHost(true);
  }, [playerName, playerColor, lanPort]);

  const deleteSavedWorld = useCallback(async (id: string) => { await deleteWorld(id); refreshWorlds(); }, [refreshWorlds]);

  const memMB = estimateMemoryMB(worldChunkSize, worldHeight);
  const maxFpsLabel = maxFps === 0 ? 'VSync' : `${maxFps}`;

  // Inventory click handler
  const handleInvSlotClick = useCallback((idx: number) => {
    if (!gameRef.current) return;
    const inv = [...gameRef.current.inventory];
    const slot = inv[idx];

    if (heldItem) {
      if (!slot || slot.count === 0 || slot.block === BlockType.Air) {
        inv[idx] = { ...heldItem };
        setHeldItem(null);
      } else if (slot.block === heldItem.block) {
        const space = 64 - slot.count;
        if (space >= heldItem.count) {
          slot.count += heldItem.count;
          setHeldItem(null);
        } else {
          heldItem.count -= space;
          slot.count = 64;
          setHeldItem({ ...heldItem });
        }
      } else {
        // Swap
        inv[idx] = { ...heldItem };
        setHeldItem({ ...slot });
      }
    } else {
      if (slot && slot.count > 0 && slot.block !== BlockType.Air) {
        inv[idx] = { block: BlockType.Air, count: 0 };
        setHeldItem({ ...slot });
      }
    }
    gameRef.current.inventory = inv;
    setInventory([...inv]);
  }, [heldItem]);

  // Craft grid click handler
  const handleCraftSlotClick = useCallback((idx: number) => {
    const grid = [...craftGrid];
    const slot = grid[idx];

    if (heldItem) {
      if (!slot || slot.count === 0 || slot.block === BlockType.Air) {
        grid[idx] = { ...heldItem };
        setHeldItem(null);
      } else if (slot.block === heldItem.block) {
        const space = 64 - slot.count;
        if (space >= heldItem.count) {
          slot.count += heldItem.count;
          setHeldItem(null);
        } else {
          heldItem.count -= space;
          slot.count = 64;
          setHeldItem({ ...heldItem });
        }
      } else {
        grid[idx] = { ...heldItem };
        setHeldItem({ ...slot });
      }
    } else {
      if (slot && slot.count > 0 && slot.block !== BlockType.Air) {
        grid[idx] = null;
        setHeldItem({ ...slot });
      }
    }
    setCraftGrid(grid);
  }, [heldItem, craftGrid]);

  // Craft result handler
  const handleCraftResult = useCallback(() => {
    const result = checkCraftingGrid(craftGrid);
    if (!result || !gameRef.current) return;

    // Consume ingredients from craft grid
    const grid = [...craftGrid];
    const needed: Record<number, number> = {};
    for (const ing of (checkCraftingGrid(craftGrid)?.ingredients || [])) {
      needed[ing.block] = (needed[ing.block] || 0) + ing.count;
    }
    for (const [blockStr, count] of Object.entries(needed)) {
      const block = Number(blockStr) as BlockType;
      let remaining = count;
      for (let i = 0; i < grid.length && remaining > 0; i++) {
        if (grid[i] && grid[i].block === block) {
          const take = Math.min(remaining, grid[i].count);
          grid[i].count -= take;
          remaining -= take;
          if (grid[i].count <= 0) grid[i] = null;
        }
      }
    }
    setCraftGrid(grid);

    // Add result to inventory or held item
    if (heldItem && heldItem.block === result.block && heldItem.count + result.count <= 64) {
      setHeldItem({ ...heldItem, count: heldItem.count + result.count });
    } else if (heldItem) {
      addToInventory(gameRef.current.inventory, result.block, result.count);
      gameRef.current.callbacks.onInventoryUpdate([...gameRef.current.inventory]);
    } else {
      addToInventory(gameRef.current.inventory, result.block, result.count);
      gameRef.current.callbacks.onInventoryUpdate([...gameRef.current.inventory]);
    }
  }, [craftGrid, heldItem]);

  const craftResult = useMemo(() => checkCraftingGrid(craftGrid), [craftGrid]);

  const hotbar = inventory.length >= 9 ? inventory.slice(0, 9) : HOTBAR_BLOCKS.map(b => ({ block: b, count: gameRef.current?.settings.gameMode === 'creative' ? 64 : 0 }));

  // ==================== MAIN MENU ====================
  if (screen === 'menu') return (
    <div className="flex flex-col items-center justify-center h-screen bg-[#0a0e17] text-gray-100 select-none relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-emerald-950/30 via-transparent to-transparent" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(16,185,129,0.08),transparent_70%)]" />
      <div className="w-full max-w-xs space-y-5 p-6 relative z-10">
        <div className="text-center space-y-2">
          <img src="/logo.svg" alt="SinCraft" className="h-16 mx-auto drop-shadow-lg" />
          <p className="text-gray-500 text-[10px] tracking-[0.3em] uppercase font-light">Voxel Engine v2.0</p>
        </div>
        <div className="space-y-2">
          <Button onClick={() => { refreshWorlds(); setScreen('worlds'); }} className="w-full h-12 text-base bg-emerald-600 hover:bg-emerald-500 gap-2 rounded-xl font-semibold shadow-lg shadow-emerald-900/30 transition-all">
            <Play className="w-5 h-5" /> Одиночная игра
          </Button>
          <Button onClick={() => setScreen('multiplayer')} variant="outline" className="w-full h-12 text-base border-gray-700/60 hover:border-emerald-500/60 hover:bg-emerald-950/40 gap-2 rounded-xl">
            <Wifi className="w-5 h-5" /> Сетевая игра
          </Button>
        </div>
        <Separator className="bg-gray-800/50" />
        <Button onClick={() => setScreen('settings')} variant="ghost" className="w-full gap-2 text-gray-400 hover:text-gray-200 rounded-xl">
          <Monitor className="w-4 h-4" /> Настройки
        </Button>
        <div className="space-y-2 pt-1">
          <Input value={playerName} onChange={e => setPlayerName(e.target.value)} className="bg-gray-900/60 border-gray-700/50 rounded-lg text-center h-10" maxLength={16} placeholder="Имя игрока" />
          <div className="flex items-center justify-center gap-2">
            <label className="text-xs text-gray-500">Цвет</label>
            <input type="color" value={playerColor} onChange={e => setPlayerColor(e.target.value)} className="w-7 h-7 rounded cursor-pointer border-0 bg-transparent" />
          </div>
        </div>
      </div>
    </div>
  );

  // ==================== SETTINGS ====================
  if (screen === 'settings') return (
    <div className="flex flex-col items-center justify-center h-screen bg-[#0a0e17] text-gray-100 select-none">
      <div className="w-full max-w-sm space-y-4 p-6">
        <div className="flex items-center gap-2 mb-4">
          <button onClick={() => setScreen('menu')} className="text-gray-500 hover:text-gray-300 transition-colors"><ArrowLeft className="w-5 h-5" /></button>
          <h2 className="text-xl font-bold flex-1">Настройки</h2>
        </div>
        <div className="bg-gray-900/50 rounded-xl p-4 space-y-4 border border-gray-800/50">
          <p className="text-xs text-gray-400 font-semibold tracking-wide uppercase">Графика</p>
          <div>
            <div className="flex justify-between mb-1"><label className="text-xs text-gray-500">Масштаб разрешения</label><span className="text-xs text-emerald-400 font-mono">{Math.round(resolutionScale * 100)}%</span></div>
            <Slider value={[resolutionScale]} onValueChange={v => setResolutionScale(v[0])} min={0.25} max={1} step={0.05} className="w-full" />
          </div>
          <div>
            <div className="flex justify-between mb-1"><label className="text-xs text-gray-500">Дальность прорисовки</label><span className="text-xs text-emerald-400 font-mono">{renderDistance} чанков</span></div>
            <Slider value={[renderDistance]} onValueChange={v => setRenderDistance(v[0])} min={2} max={50} step={1} className="w-full" />
          </div>
          <div>
            <div className="flex justify-between mb-1"><label className="text-xs text-gray-500">Макс. FPS</label><span className="text-xs text-emerald-400 font-mono">{maxFpsLabel}</span></div>
            <Slider value={[maxFps]} onValueChange={v => setMaxFps(v[0])} min={0} max={240} step={15} className="w-full" />
            <div className="flex justify-between mt-0.5"><span className="text-[9px] text-gray-600">0 = VSync</span><span className="text-[9px] text-gray-600">240 макс</span></div>
          </div>
        </div>
        <div className="bg-gray-900/50 rounded-xl p-4 border border-gray-800/50">
          <p className="text-xs text-gray-400 font-semibold tracking-wide uppercase mb-2">Управление</p>
          <div className="grid grid-cols-2 gap-1 text-[10px] text-gray-500">
            <span>WASD — Движение</span><span>Мышь — Обзор</span>
            <span>Пробел — Прыжок</span><span>Shift — Подкрадиться</span>
            <span>Ctrl — Бег</span><span>ЛКМ — Добыча</span>
            <span>ПКМ — Установка</span><span>E — Инвентарь</span>
            <span>1-9 — Хотбар</span><span>ESC — Пауза</span>
            <span>Колёсико — Выбор</span><span>Shift(Креатив) — Полёт</span>
          </div>
        </div>
        <Button onClick={() => setScreen('menu')} className="w-full bg-emerald-600 hover:bg-emerald-500 rounded-xl">Готово</Button>
      </div>
    </div>
  );

  // ==================== WORLD LIST ====================
  if (screen === 'worlds') return (
    <div className="flex flex-col items-center justify-center h-screen bg-[#0a0e17] text-gray-100 select-none">
      <div className="w-full max-w-md space-y-4 p-6">
        <div className="flex items-center gap-2 mb-4">
          <button onClick={() => setScreen('menu')} className="text-gray-500 hover:text-gray-300 transition-colors"><ArrowLeft className="w-5 h-5" /></button>
          <h2 className="text-xl font-bold flex-1">Выбор мира</h2>
        </div>
        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
          {savedWorlds.length === 0 && <p className="text-gray-600 text-sm text-center py-8">Миров пока нет</p>}
          {savedWorlds.map(w => (
            <Card key={w.id} className="bg-gray-900/50 border-gray-800/50 p-3 flex items-center gap-3 hover:border-gray-600 transition-all cursor-pointer group">
              <FolderOpen className="w-5 h-5 text-emerald-400 shrink-0" />
              <div className="flex-1 min-w-0" onClick={() => loadAndStartWorld(w.id)}>
                <p className="font-semibold text-sm truncate group-hover:text-emerald-400 transition-colors">{w.name}</p>
                <p className="text-[10px] text-gray-500">{w.settings.chunkSize * CHUNK_SIZE}x{w.settings.chunkSize * CHUNK_SIZE} · H{w.settings.worldHeight} · {TERRAIN_LABELS[w.settings.terrainType]} · {w.settings.gameMode === 'survival' ? 'Выживание' : 'Креатив'}</p>
              </div>
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-500 shrink-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => loadAndStartWorld(w.id)}><Play className="w-4 h-4" /></Button>
              <Button size="sm" variant="ghost" className="text-gray-500 hover:text-red-400 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => deleteSavedWorld(w.id)}><Trash2 className="w-4 h-4" /></Button>
            </Card>
          ))}
        </div>
        <Button onClick={() => setScreen('create')} variant="outline" className="w-full border-dashed border-gray-700/60 hover:border-emerald-500/60 gap-2 rounded-xl h-11">
          <Plus className="w-4 h-4" /> Создать мир
        </Button>
      </div>
    </div>
  );

  // ==================== CREATE WORLD ====================
  if (screen === 'create') return (
    <div className="flex flex-col items-center justify-center h-screen bg-[#0a0e17] text-gray-100 select-none overflow-y-auto">
      <div className="w-full max-w-sm space-y-4 p-6">
        <div className="flex items-center gap-2 mb-2">
          <button onClick={() => setScreen('worlds')} className="text-gray-500 hover:text-gray-300 transition-colors"><ArrowLeft className="w-5 h-5" /></button>
          <h2 className="text-xl font-bold flex-1">Создать мир</h2>
        </div>
        <div className="space-y-3">
          <Input value={newWorldName} onChange={e => setNewWorldName(e.target.value)} placeholder="Название мира" className="bg-gray-900/60 border-gray-700/50 rounded-lg h-10" maxLength={32} />
          <Input value={newWorldSeed} onChange={e => setNewWorldSeed(e.target.value)} placeholder="Сид (пусто = случайный)" className="bg-gray-900/60 border-gray-700/50 rounded-lg h-10" />
          <Separator className="bg-gray-800/50" />

          <div>
            <label className="text-xs text-gray-500 mb-1.5 block">Режим игры</label>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setGameMode('survival')} className={`flex flex-col items-center gap-1 p-3 rounded-xl border transition-all ${gameMode === 'survival' ? 'border-emerald-500 bg-emerald-950/50 text-emerald-400 shadow-lg shadow-emerald-900/20' : 'border-gray-700/60 bg-gray-900/50 text-gray-400 hover:border-gray-600'}`}>
                <Swords className="w-5 h-5" /><span className="font-semibold text-xs">Выживание</span>
              </button>
              <button onClick={() => setGameMode('creative')} className={`flex flex-col items-center gap-1 p-3 rounded-xl border transition-all ${gameMode === 'creative' ? 'border-emerald-500 bg-emerald-950/50 text-emerald-400 shadow-lg shadow-emerald-900/20' : 'border-gray-700/60 bg-gray-900/50 text-gray-400 hover:border-gray-600'}`}>
                <Palette className="w-5 h-5" /><span className="font-semibold text-xs">Креатив</span>
              </button>
            </div>
          </div>

          <div>
            <div className="flex justify-between mb-1"><label className="text-xs text-gray-500">Размер мира</label><span className="text-xs text-emerald-400 font-mono">{worldChunkSize}x{worldChunkSize}</span></div>
            <Slider value={[worldChunkSize]} onValueChange={v => setWorldChunkSize(v[0])} min={4} max={100} step={1} className="w-full" />
            <div className="flex justify-between mt-0.5"><span className="text-[10px] text-gray-600">{worldChunkSize * CHUNK_SIZE}x{worldChunkSize * CHUNK_SIZE} блоков</span><span className="text-[10px] text-gray-600">~{memMB} MB</span></div>
          </div>

          <div>
            <div className="flex justify-between mb-1"><label className="text-xs text-gray-500">Высота мира</label><span className="text-xs text-emerald-400 font-mono">{worldHeight}</span></div>
            <Slider value={[worldHeight]} onValueChange={v => setWorldHeight(v[0])} min={32} max={256} step={16} className="w-full" />
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-1.5 block">Тип ландшафта</label>
            <div className="grid grid-cols-3 gap-1.5">
              {ALL_TERRAINS.map(t => (
                <button key={t} onClick={() => setTerrainType(t)} className={`flex flex-col items-center gap-0.5 px-2 py-2 rounded-lg text-xs border transition-all ${terrainType === t ? 'border-emerald-500 bg-emerald-950/50 text-emerald-400' : 'border-gray-700/60 bg-gray-900/50 text-gray-400 hover:border-gray-600'}`}>
                  {TERRAIN_ICONS[t]}<span className="text-[10px]">{TERRAIN_LABELS[t]}</span>
                </button>
              ))}
            </div>
            <p className="text-[10px] text-gray-600 mt-1">{TERRAIN_DESC[terrainType]}</p>
          </div>

          {terrainType !== 'parkour' && gameMode !== 'creative' && (
            <div>
              <div className="flex justify-between mb-1"><label className="text-xs text-gray-500">Плотность деревьев</label><span className="text-xs text-emerald-400 font-mono">{treeDensity}%</span></div>
              <Slider value={[treeDensity]} onValueChange={v => setTreeDensity(v[0])} min={0} max={100} step={5} className="w-full" />
            </div>
          )}
        </div>

        {memMB > 100 && (
          <div className="bg-yellow-950/30 border border-yellow-800/30 rounded-lg p-2 text-[10px] text-yellow-500">Большой мир (~{memMB} MB). Может быть медленно на слабых ПК.</div>
        )}

        <Button onClick={() => {
          const name = newWorldName.trim() || 'Новый мир';
          const seed = newWorldSeed.trim() ? parseInt(newWorldSeed) || Math.floor(Math.random() * 99999) : Math.floor(Math.random() * 99999);
          startGame({ seed, chunkSize: worldChunkSize, worldHeight, terrainType, treeDensity: terrainType === 'parkour' ? 0 : treeDensity, gameMode }, generateId(), name);
        }} className="w-full h-11 bg-emerald-600 hover:bg-emerald-500 gap-2 rounded-xl font-semibold shadow-lg shadow-emerald-900/30">
          <Plus className="w-4 h-4" /> Создать
        </Button>
      </div>
    </div>
  );

  // ==================== MULTIPLAYER ====================
  if (screen === 'multiplayer') return (
    <div className="flex flex-col items-center justify-center h-screen bg-[#0a0e17] text-gray-100 select-none">
      <div className="w-full max-w-sm space-y-4 p-6">
        <div className="flex items-center gap-2 mb-4">
          <button onClick={() => setScreen('menu')} className="text-gray-500 hover:text-gray-300 transition-colors"><ArrowLeft className="w-5 h-5" /></button>
          <h2 className="text-xl font-bold flex-1">Сетевая игра</h2>
        </div>
        <div className="bg-gray-900/50 rounded-xl p-4 border border-gray-800/50 space-y-3">
          <p className="text-xs text-gray-400">Для игры по сети используйте <span className="text-emerald-400 font-semibold">Tailscale</span> чтобы создать общую локальную сеть между игроками.</p>
          <div className="bg-emerald-950/30 rounded-lg p-2 text-[10px] text-emerald-400/70 space-y-1">
            <p>1. Установите Tailscale на tailscale.com</p>
            <p>2. Авторизуйтесь и создайте хвост-сеть</p>
            <p>3. Создайте мир — один игрок хостит</p>
            <p>4. Другой подключается по Tailscale IP</p>
          </div>
        </div>
        <div className="space-y-3">
          <Input value={playerName} onChange={e => setPlayerName(e.target.value)} className="bg-gray-900/60 border-gray-700/50 rounded-lg h-10" maxLength={16} placeholder="Имя" />
          <div className="flex items-center justify-center gap-2">
            <input type="color" value={playerColor} onChange={e => setPlayerColor(e.target.value)} className="w-7 h-7 rounded cursor-pointer border-0 bg-transparent" />
          </div>
        </div>
        <Button onClick={() => { refreshWorlds(); setScreen('worlds'); }} className="w-full bg-emerald-600 hover:bg-emerald-500 gap-2 rounded-xl shadow-lg shadow-emerald-900/30">
          <Globe className="w-4 h-4" /> Создать комнату
        </Button>
        <Separator className="bg-gray-800/50" />
        <Button onClick={() => {
          localStorage.setItem('sincraft_name', playerName);
          localStorage.setItem('sincraft_color', playerColor);
          const settings = defaultSettings();
          startGame(settings, generateId(), 'Сетевой мир');
          setTimeout(() => {
            if (gameRef.current) {
              gameRef.current.startNetwork(generateId(), playerName, playerColor, lanPort);
              setIsMultiplayer(true); setIsHost(false);
            }
          }, 500);
        }} className="w-full bg-blue-600 hover:bg-blue-500 gap-2 rounded-xl">
          <Wifi className="w-4 h-4" /> Подключиться
        </Button>
      </div>
    </div>
  );

  // ==================== PLAYING ====================
  const isPlayingUI = ready && !loadingText;
  const showHud = isPlayingUI && !showInventory;

  return (
    <div className="flex flex-col h-screen bg-[#0a0e17] text-gray-100 overflow-hidden select-none" style={{ cursor: paused || showInventory ? 'default' : 'none' }}>

      <main className="flex flex-1 overflow-hidden relative">
        <div className="flex-1 relative bg-black">
          <canvas ref={canvasRef} className="w-full h-full block" />

          {/* Loading overlay */}
          {loadingText && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/90 z-30">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-10 h-10 text-emerald-400 animate-spin" />
                <p className="text-sm text-gray-300">{loadingText}</p>
              </div>
            </div>
          )}

          {/* Crosshair */}
          {showHud && !paused && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
              <div className="relative w-5 h-5">
                <div className="absolute top-1/2 left-0 right-0 h-[1.5px] -translate-y-1/2 bg-white/60 rounded-full" />
                <div className="absolute left-1/2 top-0 bottom-0 w-[1.5px] -translate-x-1/2 bg-white/60 rounded-full" />
              </div>
            </div>
          )}

          {/* Breaking progress indicator */}
          {showHud && !paused && breakingInfo.progress > 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
              <div className="absolute w-8 h-8 border-2 border-white/30 rounded">
                <div className="absolute inset-0 border-2 border-white/70 rounded" style={{
                  clipPath: `polygon(0% 0%, ${Math.min(100, (breakingInfo.progress / breakingInfo.max) * 100)}% 0%, ${Math.min(100, (breakingInfo.progress / breakingInfo.max) * 100)}% 100%, 0% 100%)`
                }} />
              </div>
            </div>
          )}

          {/* Block name tooltip */}
          {showHud && !paused && blockLookName && (
            <div className="absolute bottom-28 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
              <p className="text-xs text-white/70 font-medium bg-black/40 px-2 py-0.5 rounded backdrop-blur-sm">{blockLookName}</p>
            </div>
          )}

          {/* Health & Hunger bars */}
          {showHud && !paused && (
            <div className="absolute bottom-16 left-3 z-10 flex items-end gap-2">
              <div className="flex gap-0.5">
                {Array.from({ length: 10 }, (_, i) => {
                  const hp = stats.health || 20;
                  const full = Math.floor(hp / 2);
                  const half = hp % 2;
                  const val = i * 2;
                  let fill = 0;
                  if (val < full * 2) fill = 2;
                  else if (val === full * 2 && half) fill = 1;
                  return (
                    <div key={i} className="relative w-4 h-4">
                      <Heart className={`w-4 h-4 ${fill === 0 ? 'text-gray-700' : fill === 1 ? 'text-yellow-500' : 'text-red-500'}`} fill={fill > 0 ? 'currentColor' : 'none'} />
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-0.5">
                {Array.from({ length: 10 }, (_, i) => {
                  const hunger = stats.hunger || 20;
                  const full = Math.floor(hunger / 2);
                  const half = hunger % 2;
                  const val = i * 2;
                  let fill = 0;
                  if (val < full * 2) fill = 2;
                  else if (val === full * 2 && half) fill = 1;
                  return (
                    <div key={i} className="w-4 h-4">
                      <Drumstick className={`w-4 h-4 ${fill === 0 ? 'text-gray-700' : fill === 1 ? 'text-yellow-500' : 'text-amber-600'}`} fill={fill > 0 ? 'currentColor' : 'none'} />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Hotbar */}
          {showHud && !paused && (
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10">
              <div className="flex gap-0.5 p-1 bg-black/75 rounded-xl border border-gray-700/40 backdrop-blur-sm">
                {hotbar.map((item, i) => {
                  const bd = item.block !== BlockType.Air ? BLOCK_COLORS[item.block] : null;
                  const isActive = i === selectedSlot;
                  return (
                    <div key={i} className={`w-11 h-11 rounded-lg flex items-center justify-center relative transition-all ${isActive ? 'ring-2 ring-white/80 scale-110 bg-white/15' : 'bg-white/5 hover:bg-white/10'}`}>
                      {(item.count > 0 || gameRef.current?.settings.gameMode === 'creative') && bd ? (
                        <>
                          <div className={`w-7 h-7 rounded-sm ${BLOCK_COLOR_MAP[item.block] || 'bg-gray-500'}`} />
                          {item.count > 1 && <span className="absolute bottom-0.5 right-0.5 text-[8px] text-white font-mono font-bold drop-shadow-lg">{item.count}</span>}
                        </>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Flying indicator */}
          {showHud && !paused && isFlying && (
            <div className="absolute top-3 left-3 z-10 pointer-events-none">
              <div className="flex items-center gap-1.5 bg-sky-900/40 backdrop-blur-sm rounded-lg px-2 py-1 border border-sky-700/30">
                <Bird className="w-3 h-3 text-sky-400" />
                <span className="text-[10px] text-sky-400 font-medium">Полёт</span>
              </div>
            </div>
          )}

          {/* ==================== INVENTORY OVERLAY ==================== */}
          {showInventory && ready && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-30 backdrop-blur-sm" onClick={(e) => {
              if (e.target === e.currentTarget) {
                setShowInventory(false);
                if (gameRef.current) {
                  gameRef.current.isInventoryOpen = false;
                  gameRef.current.resumeGame();
                }
              }
            }}>
              <Card className="bg-[#1a1a2e]/95 border-gray-700/50 p-4 w-full max-w-md mx-4 shadow-2xl">
                <div className="text-center mb-3">
                  <h3 className="text-sm font-bold tracking-wide uppercase text-gray-300">Инвентарь</h3>
                </div>

                {/* Crafting area */}
                <div className="bg-black/40 rounded-lg p-3 mb-3 border border-gray-700/30">
                  <div className="flex items-center gap-3">
                    <div className="grid grid-cols-2 gap-1">
                      {craftGrid.map((item, i) => (
                        <InvSlot key={`craft-${i}`} item={item} onClick={() => handleCraftSlotClick(i)} />
                      ))}
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-500" />
                    <InvSlot item={craftResult} onClick={craftResult ? handleCraftResult : undefined} active={!!craftResult} />
                  </div>
                  <p className="text-[9px] text-gray-600 mt-1">Крафт 2x2</p>
                </div>

                {/* Main inventory (27 slots, rows 1-3) */}
                <div className="bg-black/40 rounded-lg p-3 border border-gray-700/30">
                  <p className="text-[9px] text-gray-600 mb-1">Инвентарь</p>
                  <div className="grid grid-cols-9 gap-1 mb-2">
                    {inventory.slice(9, 36).map((item, i) => (
                      <InvSlot key={`inv-${i}`} item={item} onClick={() => handleInvSlotClick(i + 9)} />
                    ))}
                  </div>
                  <Separator className="bg-gray-700/30 my-2" />
                  <p className="text-[9px] text-gray-600 mb-1">Хотбар</p>
                  <div className="grid grid-cols-9 gap-1">
                    {inventory.slice(0, 9).map((item, i) => (
                      <InvSlot key={`hot-${i}`} item={item} active={i === selectedSlot} onClick={() => handleInvSlotClick(i)} small />
                    ))}
                  </div>
                </div>

                {/* Held item */}
                {heldItem && heldItem.count > 0 && (
                  <div className="mt-2 text-center">
                    <span className="text-[10px] text-emerald-400">
                      В руке: {BLOCK_NAMES[heldItem.block] || 'Неизвестно'} x{heldItem.count}
                    </span>
                  </div>
                )}

                <p className="text-[9px] text-gray-600 text-center mt-2">ESC — закрыть</p>
              </Card>
            </div>
          )}

          {/* ==================== DEATH SCREEN ==================== */}
          {isDead && ready && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-950/70 z-40 backdrop-blur-sm">
              <Skull className="w-16 h-16 text-red-400 mb-4 animate-pulse" />
              <h2 className="text-3xl font-bold text-red-300 mb-2">Вы погибли!</h2>
              <p className="text-sm text-gray-400 mb-6">
                {stats.position && `Координаты: ${Math.floor(stats.position.x)}, ${Math.floor(stats.position.y)}, ${Math.floor(stats.position.z)}`}
              </p>
              <Button onClick={() => {
                setIsDead(false);
                if (gameRef.current) {
                  const spawn = gameRef.current.world.findSpawnPoint();
                  gameRef.current.player.x = spawn.x;
                  gameRef.current.player.y = spawn.y;
                  gameRef.current.player.z = spawn.z;
                  gameRef.current.player.health = 20;
                  gameRef.current.player.hunger = 20;
                  gameRef.current.player.vy = 0;
                  gameRef.current.paused = false;
                  gameRef.current.resumeGame();
                }
                setPaused(false);
              }} className="bg-red-700 hover:bg-red-600 gap-2 rounded-xl px-8 h-11 font-semibold">
                <RotateCcw className="w-4 h-4" /> Возродиться
              </Button>
            </div>
          )}

          {/* ==================== PAUSE MENU ==================== */}
          {paused && !isDead && !showInventory && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-30 backdrop-blur-sm">
              <Card className="bg-[#111827]/95 border-gray-700/50 p-5 w-full max-w-xs mx-4 space-y-2.5 shadow-2xl">
                <div className="text-center mb-1">
                  <img src="/logo.svg" alt="" className="h-8 mx-auto mb-1 opacity-80" />
                  <p className="text-sm font-semibold">{currentWorldName}</p>
                  {gameRef.current && (
                    <p className="text-[10px] text-gray-500 mt-0.5">
                      {gameRef.current.settings.chunkSize * CHUNK_SIZE}x{gameRef.current.settings.chunkSize * CHUNK_SIZE} · H{gameRef.current.settings.worldHeight} · {TERRAIN_LABELS[gameRef.current.settings.terrainType]} · {gameRef.current.settings.gameMode === 'survival' ? 'Выживание' : 'Креатив'}
                    </p>
                  )}
                </div>

                <Button onClick={resumeGame} className="w-full bg-emerald-600 hover:bg-emerald-500 gap-2 h-10 rounded-xl"><Play className="w-4 h-4" /> Продолжить</Button>
                <Button onClick={manualSave} variant="outline" className="w-full border-gray-700/60 gap-2 h-10 rounded-xl"><Save className="w-4 h-4" /> Сохранить</Button>

                {gameRef.current?.settings.gameMode === 'creative' && (
                  <Button onClick={() => {
                    if (gameRef.current) {
                      gameRef.current.player.flying = !gameRef.current.player.flying;
                      setIsFlying(gameRef.current.player.flying);
                    }
                  }} variant="outline" className={`w-full gap-2 h-10 rounded-xl ${isFlying ? 'border-sky-600 text-sky-400' : 'border-gray-700/60'}`}>
                    <Bird className="w-4 h-4" /> {isFlying ? 'Выкл. полёт' : 'Вкл. полёт'}
                  </Button>
                )}

                <Separator className="bg-gray-800/50" />

                {/* Stats in pause */}
                <div className="bg-gray-800/30 rounded-lg p-2.5 text-[10px] text-gray-500 space-y-0.5 border border-gray-700/20">
                  <div className="flex justify-between"><span>FPS</span><span className="text-emerald-400 font-mono">{stats.fps}</span></div>
                  {stats.position && <div className="flex justify-between"><span>Координаты</span><span className="text-emerald-400 font-mono">{Math.floor(stats.position.x)}, {Math.floor(stats.position.y)}, {Math.floor(stats.position.z)}</span></div>}
                  {isFlying && <div className="flex justify-between"><span>Режим</span><span className="text-sky-400">Полёт</span></div>}
                </div>

                {/* Render settings in pause */}
                <div className="bg-gray-800/30 rounded-lg p-2.5 space-y-2 border border-gray-700/20">
                  <p className="text-[10px] text-gray-500 font-semibold tracking-wide">Графика</p>
                  <div>
                    <div className="flex justify-between mb-0.5"><span className="text-[10px] text-gray-500">Разрешение</span><span className="text-[10px] text-emerald-400">{Math.round(resolutionScale * 100)}%</span></div>
                    <Slider value={[resolutionScale]} onValueChange={v => setResolutionScale(v[0])} min={0.25} max={1} step={0.05} className="w-full" />
                  </div>
                  <div>
                    <div className="flex justify-between mb-0.5"><span className="text-[10px] text-gray-500">Дальность</span><span className="text-[10px] text-emerald-400">{renderDistance}</span></div>
                    <Slider value={[renderDistance]} onValueChange={v => setRenderDistance(v[0])} min={2} max={50} step={1} className="w-full" />
                  </div>
                  <div>
                    <div className="flex justify-between mb-0.5"><span className="text-[10px] text-gray-500">FPS лимит</span><span className="text-[10px] text-emerald-400">{maxFpsLabel}</span></div>
                    <Slider value={[maxFps]} onValueChange={v => setMaxFps(v[0])} min={0} max={240} step={15} className="w-full" />
                  </div>
                </div>

                {/* Controls reference */}
                <div className="bg-gray-800/30 rounded-lg p-2.5 border border-gray-700/20">
                  <p className="text-[10px] text-gray-500 font-semibold tracking-wide mb-1">Управление</p>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[9px] text-gray-500">
                    <span>WASD — Движение</span><span>ЛКМ (зажать) — Добыча</span>
                    <span>ПКМ — Установка / Еда</span><span>E — Инвентарь</span>
                    <span>Ctrl — Бег</span><span>Колёсико — Выбор</span>
                  </div>
                </div>

                {!isMultiplayer && (
                  <Button onClick={hostGame} variant="outline" className="w-full border-gray-700/60 gap-2 h-10 rounded-xl"><Wifi className="w-4 h-4" /> Открыть сервер</Button>
                )}

                <Separator className="bg-gray-800/50" />
                <Button onClick={quitToMenu} variant="outline" className="w-full border-red-800/40 hover:border-red-500 hover:bg-red-950/30 hover:text-red-400 gap-2 h-10 rounded-xl">
                  <LogOut className="w-4 h-4" /> Сохранить и выйти
                </Button>
              </Card>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
