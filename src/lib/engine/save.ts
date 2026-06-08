// ==========================================
// World Save/Load Manager - localStorage
// ==========================================

export interface WorldSaveData {
  id: string;
  name: string;
  seed: number;
  blocks: string; // base64
  playerX: number;
  playerY: number;
  playerZ: number;
  playerYaw: number;
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = 'litecraft_saves';

export function getSavedWorlds(): WorldSaveData[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveWorld(data: WorldSaveData) {
  const saves = getSavedWorlds();
  const idx = saves.findIndex(s => s.id === data.id);
  data.updatedAt = Date.now();
  if (idx >= 0) saves[idx] = data;
  else {
    data.createdAt = data.updatedAt;
    saves.push(data);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(saves));
}

export function loadWorld(id: string): WorldSaveData | null {
  return getSavedWorlds().find(s => s.id === id) ?? null;
}

export function deleteWorld(id: string) {
  const saves = getSavedWorlds().filter(s => s.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(saves));
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}
