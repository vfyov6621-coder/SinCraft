---
Task ID: 1
Agent: main
Task: Chunk-based voxel engine overhaul with world settings

Work Log:
- Created chunk.ts with 16x16 Chunk class, serialization, bounds checking
- Rewrote world.ts: chunk-based storage, 4 terrain types, configurable size (2-100 chunks), tree generation across chunk boundaries, dirty chunk tracking
- Added frustum culling to math.ts (extractFrustumPlanes, isAABBVisible)
- Rewrote renderer.ts: multi-mesh rendering, Uint32 indices, proper mesh deletion, fixed highlight wireframe double-draw bug, added stats tracking (drawCalls, totalTriangles)
- Rewrote engine.ts: chunk mesh management, render distance, frustum culling per frame, proper cleanup
- Updated physics.ts: dynamic world bounds, respawn on fall below world
- Rewrote save.ts: IndexedDB for chunk data, localStorage for metadata, combined async save/load
- Rewrote page.tsx: world creation settings (size/height/terrain/trees), loading states, chunk stats in HUD, render settings in pause menu

Bugs Fixed:
1. CRITICAL: getRight() returned LEFT direction → A/D controls inverted (physics.ts)
2. CRITICAL: Block placement position was x - nx instead of x + nx → placed on wrong side (raycast.ts)
3. readyTimerRef not declared → all in-game UI invisible (page.tsx)
4. Auto-save interval leak on game restart (page.tsx)
5. Hotbar not synced with engine state (added onSlotChange callback)
6. Chunk getBlock/setBlock missing Y upper bounds check (chunk.ts)
7. Canvas click/contextmenu listeners never cleaned up (engine.ts)
8. Highlight wireframe drawn twice - once at origin, once at correct position (renderer.ts)
9. saveWorldMeta overwrote createdAt on updates (save.ts)
10. localStorage called during SSR causing build failure (page.tsx)

Stage Summary:
- Full chunk-based voxel engine with 16x16 chunks, max 100x100 world
- 4 terrain types: Normal, Flat, Mountains, Islands
- Configurable world height (32-128), tree density (0-100%)
- Frustum culling and render distance for performance on weak PCs
- IndexedDB saves support large worlds
- All 10 bugs identified and fixed
- Build passes clean
