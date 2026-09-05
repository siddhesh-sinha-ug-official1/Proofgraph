#!/usr/bin/env node
/**
 * fix-wincodesign-cache.mjs — pre-populate electron-builder's winCodeSign
 * cache on Windows systems that lack symlink privileges (Developer Mode off).
 *
 * The winCodeSign-2.6.0.7z archive contains two macOS symlinks that 7-zip
 * can't create on standard Windows, causing exit code 2. electron-builder
 * treats this as failure and retries forever.
 *
 * This script extracts the archive ignoring the warning, then copies the
 * versioned .dylib files to the symlink names so the directory is complete.
 * Finally it creates the expected cache structure so electron-builder skips
 * the download entirely.
 *
 * Usage: node scripts/fix-wincodesign-cache.mjs
 */
import { execFileSync, execSync } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync, readdirSync, renameSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(__dirname, '..');

// electron-builder cache location
const cacheBase = path.join(process.env.LOCALAPPDATA || '', 'electron-builder', 'Cache', 'winCodeSign');
const targetDir = path.join(cacheBase, 'winCodeSign-2.6.0');

if (process.platform !== 'win32') {
  console.log('[fix-wincodesign] not Windows — skipping');
  process.exit(0);
}

// Check if already fixed
const marker = path.join(targetDir, 'rcedit-x64.exe');
if (existsSync(marker)) {
  console.log('[fix-wincodesign] cache already populated — skipping');
  process.exit(0);
}

console.log('[fix-wincodesign] fixing winCodeSign cache for non-admin Windows…');

// Clean any partial extractions
const sevenZip = path.join(desktopDir, 'node_modules', '7zip-bin', 'win', 'x64', '7za.exe');

// Download the archive
const url = 'https://github.com/electron-userland/electron-builder-binaries/releases/download/winCodeSign-2.6.0/winCodeSign-2.6.0.7z';
const archivePath = path.join(cacheBase, '_winCodeSign-2.6.0.7z');

mkdirSync(cacheBase, { recursive: true });

if (!existsSync(archivePath)) {
  console.log('  downloading winCodeSign-2.6.0.7z…');
  // Use PowerShell to download
  execSync(
    `powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '${url}' -OutFile '${archivePath}'"`,
    { stdio: 'inherit', timeout: 60_000 },
  );
}

// Clean and recreate target directory
if (existsSync(targetDir)) {
  execSync(`rmdir /s /q "${targetDir}"`, { stdio: 'ignore', shell: true });
}

// Extract — exit code 2 = warnings (macOS symlinks) — that's OK
console.log('  extracting (ignoring macOS symlink warnings)…');
try {
  execFileSync(sevenZip, ['x', '-bd', archivePath, `-o${targetDir}`, '-y'], {
    stdio: 'inherit',
    timeout: 30_000,
  });
} catch (err) {
  // Exit code 2 = warnings only, not errors
  if (err.status !== 2) {
    console.error('  extraction failed with unexpected error');
    process.exit(1);
  }
  console.log('  (macOS symlink warnings ignored — Windows files extracted OK)');
}

// Fix the two macOS symlinks by copying the versioned files
const darwinLib = path.join(targetDir, 'darwin', '10.12', 'lib');
const symlinks = [
  ['libcrypto.1.0.0.dylib', 'libcrypto.dylib'],
  ['libssl.1.0.0.dylib', 'libssl.dylib'],
];

for (const [src, dst] of symlinks) {
  const srcPath = path.join(darwinLib, src);
  const dstPath = path.join(darwinLib, dst);
  if (existsSync(srcPath) && !existsSync(dstPath)) {
    copyFileSync(srcPath, dstPath);
    console.log(`  fixed: ${dst} → ${src}`);
  }
}

// Clean up the archive
try { execSync(`del "${archivePath}"`, { stdio: 'ignore', shell: true }); } catch {}

// Verify
if (existsSync(marker)) {
  console.log('[fix-wincodesign] ✓ cache ready');
} else {
  console.error('[fix-wincodesign] ✗ rcedit-x64.exe not found — extraction may have failed');
  process.exit(1);
}
