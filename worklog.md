---
Task ID: 1
Agent: main
Task: Fix optimization, parkour generation, flight mode, ESC pause menu, memory leaks

Work Log:
- Analyzed all 9 source files to understand full codebase state
- Identified multiple critical bugs in optimization (frustum culling AABB used worldHeight/2 for chunk Y center correctly but directional culling was redundant and potentially buggy)
- Removed broken directional rendering (angle-based culling), kept only proper frustum culling
- Fixed chunk AABB for frustum: center Y = worldHeight/2, half-extent Y = worldHeight/2 (correct)
- Increased maxChunkRebuildsPerFrame from 4 to 6
- Added dedup check in pendingDirtyChunks to avoid rebuild storms
- Fixed empty chunk cleanup (delete mesh entry when chunk becomes empty)
- Rewrote parkour generation: fixed bounds checking (platforms were going out of world), better path generation with direction changes, proper support pillars at corners, stepping stones between levels
- Added flight mode: double-tap space to toggle, WASD moves in look direction, space=up shift=down, fly speed 8
- Added onFlightToggle callback system from physics through engine to UI
- Added resumeGame() method that re-locks pointer on resume
- ESC key now toggles pause (pause/resume), pause menu has cursor:default, game has cursor:none
- Pause menu: Resume, Save, Flight toggle, Render settings (resolution, render distance, max FPS), Host LAN, Save & Quit
- Added "Flying" badge in header when flight is active
- Updated controls help to show "2x Space" for flight toggle
- Memory leak fix: proper cleanup in destroy(), clear pendingDirtyChunks, handle empty chunk meshes

Stage Summary:
- All 5 tasks completed: optimization fix, parkour generation, flight mode, ESC menu, memory leak
- Files modified: engine.ts, physics.ts, world.ts, page.tsx
- Build passes cleanly

---
Task ID: 2
Agent: main
Task: Massive SinCraft rewrite - rename, new blocks, survival, inventory, shadows, modern UI

Work Log:
- Renamed project from LiteCraft to SinCraft
- Created SVG logo (logo.svg) and favicon (favicon.svg) with voxel cube design
- Rewrote blocks.ts: 40+ block types (ores, wood variants, building blocks, lighting, decorative), BlockDef interface with emissive/solid/transparent/hardness/drops, crafting recipes, inventory system (36 slots)
- Rewrote renderer.ts: Added emissive vertex attribute, per-face ambient occlusion (shader-based: top=1.0, sides=0.75, bottom=0.5), emissive glow effect, shadowStrength uniform
- Rewrote physics.ts: Sprint (Ctrl key, 6.0 speed), fly via Shift toggle (creative only), swimming in water, fall damage tracking, survival health/hunger system, damage cooldown, hurt timer
- Rewrote world.ts: gameMode setting (survival/creative), ore generation (coal/iron/gold/diamond), cave generation (random walk carving), bedrock layer, multiple tree types (oak/birch/spruce), snow on mountain peaks, emissive data in mesh building
- Rewrote engine.ts: Inventory system integration, block drops on break, consume on place, survival hunger drain, death/respawn, removed directional rendering (frustum only)
- Rewrote page.tsx: Complete UI overhaul - dark modern theme (#0a0e17), SinCraft branding, game mode selection (survival/creative), health bar (10 hearts), hunger bar (10 drumsticks), hotbar with item counts, settings screen in main menu, no top bar during gameplay, clean pause menu with stats/settings
- Updated save.ts: Changed storage keys from litecraft_* to sincraft_*
- Updated layout.tsx: SinCraft metadata and favicon

Stage Summary:
- Full project rename LiteCraft -> SinCraft
- 40+ block types with proper definitions
- Survival mode: health, hunger, fall damage, swimming
- Creative mode: fly toggle, unlimited blocks
- Inventory system with 36 slots
- Per-face ambient occlusion shadows
- Emissive block glow (torch, lava, glowstone)
- Ore veins and cave generation
- Modern dark UI with no debug info during gameplay
