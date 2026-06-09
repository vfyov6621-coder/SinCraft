#!/usr/bin/env node
/**
 * SinCraft — Portable Build Script
 * Creates a portable Windows .exe package without NSIS/wine.
 * 
 * Usage: node build-portable.js
 * Output: dist-electron/SinCraft-Portable/
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname);
const DIST = path.join(ROOT, 'dist-electron');
const UNPACKED = path.join(DIST, 'win-unpacked');
const PORTABLE = path.join(DIST, 'SinCraft-Portable');
const APP_DIR = path.join(PORTABLE, 'resources', 'app');
const ELECTRON_DIR = path.join(APP_DIR, 'electron');

console.log('🟢 SinCraft Portable Builder');
console.log('==========================');

// Step 1: Clean
console.log('\n🧹 Cleaning old build...');
fs.rmSync(PORTABLE, { recursive: true, force: true });

// Step 2: Build Next.js static export
console.log('\n📦 Building Next.js static export...');
execSync('npm run build:electron', { stdio: 'inherit', cwd: ROOT });

// Step 3: Use electron-builder to create win-unpacked
console.log('\n⚙️  Running electron-builder (unpacked)...');
try {
  execSync('npx electron-builder --win --x64 --dir -c.npmRebuild=false -c.buildDependenciesFromSource=false', {
    stdio: 'inherit',
    cwd: ROOT,
  });
} catch (e) {
  // electron-builder may fail on signing, but win-unpacked should exist
  console.log('⚠️  electron-builder failed (expected on Linux), continuing...');
}

if (!fs.existsSync(path.join(UNPACKED, 'SinCraft.exe'))) {
  console.error('❌ SinCraft.exe not found! Build failed.');
  process.exit(1);
}

// Step 4: Create portable structure
console.log('\n📁 Creating portable structure...');

// Copy base electron files
const electronFiles = ['main.js', 'preload.js', 'tailscale.js', 'game-server-node.js'];
for (const f of electronFiles) {
  fs.mkdirSync(ELECTRON_DIR, { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'electron', f), path.join(ELECTRON_DIR, f));
}

// Copy everything from win-unpacked to portable
const entries = fs.readdirSync(UNPACKED, { withFileTypes: true });
for (const entry of entries) {
  const src = path.join(UNPACKED, entry.name);
  const dst = path.join(PORTABLE, entry.name);
  
  if (entry.name === 'resources') {
    // Merge resources
    fs.mkdirSync(dst, { recursive: true });
    
    // Copy electron binary files
    const resEntries = fs.readdirSync(src, { withFileTypes: true });
    for (const re of resEntries) {
      const rSrc = path.join(src, re.name);
      const rDst = path.join(dst, re.name);
      
      if (re.name === 'app.asar' || re.name === 'app.asar.unpacked') continue;
      
      if (re.name === 'app') {
        // app directory already has static export, add electron/ to it
        if (!fs.existsSync(rDst)) {
          fs.mkdirSync(rDst, { recursive: true });
          const appEntries = fs.readdirSync(rSrc, { withFileTypes: true });
          for (const ae of appEntries) {
            const aSrc = path.join(rSrc, ae.name);
            const aDst = path.join(rDst, ae.name);
            copyRecursive(aSrc, aDst);
          }
        }
      } else {
        copyRecursive(rSrc, rDst);
      }
    }
    
    // Also ensure electron/ is in resources/app/
    const targetElectron = path.join(dst, 'app', 'electron');
    fs.mkdirSync(targetElectron, { recursive: true });
    for (const f of electronFiles) {
      fs.copyFileSync(path.join(ROOT, 'electron', f), path.join(targetElectron, f));
    }
    
  } else {
    copyRecursive(src, dst);
  }
}

// Step 5: Remove asar to use raw app directory
console.log('\n🗑️  Removing asar...');
fs.rmSync(path.join(PORTABLE, 'resources', 'app.asar'), { force: true });
fs.rmSync(path.join(PORTABLE, 'resources', 'app.asar.unpacked'), { recursive: true, force: true });

// Step 6: Fix index.html for relative paths
console.log('\n🔧 Fixing HTML paths...');
const indexPath = path.join(PORTABLE, 'resources', 'app', 'index.html');
if (fs.existsSync(indexPath)) {
  let html = fs.readFileSync(indexPath, 'utf-8');
  if (!html.includes('<base href=')) {
    html = html.replace('<head>', '<head><base href="./">');
    fs.writeFileSync(indexPath, html);
  }
}

// Step 7: Copy node_modules/ws
console.log('\n📦 Copying ws module...');
const wsSrc = path.join(ROOT, 'node_modules', 'ws');
const wsDst = path.join(APP_DIR, 'node_modules', 'ws');
fs.mkdirSync(wsDst, { recursive: true });
copyRecursive(wsSrc, wsDst);

// Step 8: Copy icon
console.log('\n🎨 Copying icon...');
const iconSrc = path.join(ROOT, 'public', 'icon.ico');
if (fs.existsSync(iconSrc)) {
  fs.copyFileSync(iconSrc, path.join(APP_DIR, 'icon.ico'));
}

// Done
console.log('\n✅ Portable build complete!');
console.log(`📁 Location: ${PORTABLE}`);
console.log(`🚀 Run: ${path.join(PORTABLE, 'SinCraft.exe')}`);

function copyRecursive(src, dst) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dst, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      copyRecursive(path.join(src, entry.name), path.join(dst, entry.name));
    }
  } else {
    fs.copyFileSync(src, dst);
  }
}
