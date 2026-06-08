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
