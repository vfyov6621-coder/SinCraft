// ==========================================
// World Save/Load Manager
// localStorage for metadata, IndexedDB for chunk data
// Supports large worlds (up to 100x100 chunks)
// ==========================================

import { WorldSettings, defaultSettings } from './world';

export interface WorldSaveData {
  id: string;
  name: string;
  settings: WorldSettings;
  playerX: number;
  playerY: number;
  playerZ: number;
  playerYaw: number;
  createdAt: number;
  updatedAt: number;
  chunkCount: number;  // number of saved chunks
}

const META_KEY = 'sincraft_saves';
const DB_NAME = 'sincraft_chunks';
const DB_VERSION = 1;
const STORE_NAME = 'chunks';

// ==========================================
// Metadata (localStorage - synchronous)
// ==========================================

export function getSavedWorlds(): WorldSaveData[] {
  try {
    const raw = localStorage.getItem(META_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveWorldMeta(data: WorldSaveData) {
  const saves = getSavedWorlds();
  const idx = saves.findIndex(s => s.id === data.id);
  data.updatedAt = Date.now();
  if (idx >= 0) {
    data.createdAt = saves[idx].createdAt; // preserve original creation date
    saves[idx] = data;
  } else {
    data.createdAt = data.updatedAt;
    saves.push(data);
  }
  localStorage.setItem(META_KEY, JSON.stringify(saves));
}

export function deleteWorldMeta(id: string) {
  const saves = getSavedWorlds().filter(s => s.id !== id);
  localStorage.setItem(META_KEY, JSON.stringify(saves));
}

// ==========================================
// Chunk Data (IndexedDB - async)
// ==========================================

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      console.error('Failed to open IndexedDB:', request.error);
      reject(request.error);
    };
  });
  return dbPromise;
}

function chunkKey(worldId: string, cx: number, cz: number): string {
  return `${worldId}:${cx},${cz}`;
}

// Save all chunks for a world
export async function saveWorldChunks(worldId: string, chunks: Map<string, string>): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    // Delete old chunks for this world
    const allKeys = await new Promise<IDBValidKey[]>((resolve, reject) => {
      const req = store.getAllKeys();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    for (const key of allKeys) {
      const keyStr = key as string;
      if (keyStr.startsWith(worldId + ':')) {
        store.delete(keyStr);
      }
    }

    // Save new chunks
    for (const [chunkCoord, data] of chunks) {
      store.put(data, `${worldId}:${chunkCoord}`);
    }

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.error('Failed to save chunks to IndexedDB:', e);
  }
}

// Load chunks for a world
export async function loadWorldChunks(worldId: string): Promise<Map<string, string>> {
  const chunks = new Map<string, string>();
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);

    const allKeys = await new Promise<IDBValidKey[]>((resolve, reject) => {
      const req = store.getAllKeys();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    const matchingKeys = (allKeys as string[]).filter(k => k.startsWith(worldId + ':'));

    if (matchingKeys.length === 0) return chunks;

    // Load in batches
    const BATCH = 200;
    for (let i = 0; i < matchingKeys.length; i += BATCH) {
      const batch = matchingKeys.slice(i, i + BATCH);
      await new Promise<void>((resolve, reject) => {
        const batchTx = db.transaction(STORE_NAME, 'readonly');
        const batchStore = batchTx.objectStore(STORE_NAME);
        let pending = batch.length;
        if (pending === 0) { resolve(); return; }
        for (const key of batch) {
          const req = batchStore.get(key);
          req.onsuccess = () => {
            if (req.result) {
              const coordPart = key.substring(worldId.length + 1);
              chunks.set(coordPart, req.result as string);
            }
            pending--;
            if (pending === 0) resolve();
          };
          req.onerror = () => { pending--; if (pending === 0) resolve(); };
        }
      });
    }
  } catch (e) {
    console.error('Failed to load chunks from IndexedDB:', e);
  }
  return chunks;
}

// Delete all chunks for a world
export async function deleteWorldChunks(worldId: string): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    const allKeys = await new Promise<IDBValidKey[]>((resolve, reject) => {
      const req = store.getAllKeys();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    for (const key of allKeys) {
      const keyStr = key as string;
      if (keyStr.startsWith(worldId + ':')) {
        store.delete(keyStr);
      }
    }

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.error('Failed to delete chunks:', e);
  }
}

// ==========================================
// Combined Save/Load
// ==========================================

export async function saveWorld(data: {
  id: string;
  name: string;
  settings: WorldSettings;
  blocks: Map<string, string>;
  playerX: number;
  playerY: number;
  playerZ: number;
  playerYaw: number;
}): Promise<void> {
  // Save metadata
  const meta: WorldSaveData = {
    id: data.id,
    name: data.name,
    settings: data.settings,
    playerX: data.playerX,
    playerY: data.playerY,
    playerZ: data.playerZ,
    playerYaw: data.playerYaw,
    createdAt: 0,
    updatedAt: Date.now(),
    chunkCount: data.blocks.size,
  };
  saveWorldMeta(meta);

  // Save chunks to IndexedDB
  await saveWorldChunks(data.id, data.blocks);
}

export async function loadWorld(id: string): Promise<{
  meta: WorldSaveData;
  chunks: Map<string, string>;
} | null> {
  // Load metadata
  const saves = getSavedWorlds();
  const meta = saves.find(s => s.id === id);
  if (!meta) return null;

  // Load chunks
  const chunks = await loadWorldChunks(id);

  return { meta, chunks };
}

export async function deleteWorld(id: string): Promise<void> {
  deleteWorldMeta(id);
  await deleteWorldChunks(id);
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

// Memory estimate helper
export function estimateMemoryMB(chunkSize: number, worldHeight: number): number {
  // Each chunk: CHUNK_SIZE * worldHeight * CHUNK_SIZE bytes
  const bytesPerChunk = 16 * worldHeight * 16;
  const totalBytes = chunkSize * chunkSize * bytesPerChunk;
  return Math.round(totalBytes / (1024 * 1024));
}
