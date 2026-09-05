#!/usr/bin/env node
/**
 * predist.mjs — full pre-distribution build pipeline.
 *
 * Steps:
 *   1. Generate app icons (if icon.png is missing)
 *   2. Install app/ dependencies (if node_modules missing)
 *   3. Build renderer (vite build → app/dist)
 *   4. Build main + preload TypeScript (esbuild → desktop/dist)
 *   5. Bundle AI server (esbuild → resources/ai-server.cjs)
 *   6. Check for frozen hub (warn if missing)
 *
 * Usage:
 *   node scripts/predist.mjs             Full build
 *   node scripts/predist.mjs --skip-hub  Skip hub freeze check
 *
 * Run `python desktop/scripts/freeze-hub.py` separately to freeze the
 * Python hub (requires PyInstaller). The installer works without it
 * but the app will need Python on the target machine.
 */
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(desktopDir, '..');
const appDir = path.join(repoRoot, 'app');
const skipHub = process.argv.includes('--skip-hub');

function run(cmd, cwd) {
  console.log(`\n  ▸ ${cmd}`);
  execSync(cmd, { cwd, stdio: 'inherit', shell: true });
}

function step(n, label) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  Step ${n}: ${label}`);
  console.log('─'.repeat(60));
}

let ok = true;

try {
  // ── Step 1: Icons ──────────────────────────────────────────────────
  step(1, 'Generate app icons');
  const iconPath = path.join(desktopDir, 'resources', 'icon.png');
  if (existsSync(iconPath)) {
    console.log('  ✓ icon.png already exists — skipping');
  } else {
    run('node scripts/generate-icons.mjs', desktopDir);
  }

  // ── Step 2: Install all JS dependencies ─────────────────────────────
  step(2, 'Install JS dependencies');
  // Packages used by the app via Vite aliases (not a workspace — each
  // package keeps its own node_modules for its own deps).
  const pkgDirs = [
    appDir,
    path.join(repoRoot, 'packages', 'editor-shell'),
    path.join(repoRoot, 'packages', 'graph-view'),
    path.join(repoRoot, 'packages', 'schema'),
  ];
  for (const dir of pkgDirs) {
    const nm = path.join(dir, 'node_modules');
    const label = path.relative(repoRoot, dir).replace(/\\/g, '/');
    if (existsSync(nm)) {
      console.log(`  ✓ ${label}/node_modules exists — skipping`);
    } else {
      console.log(`  installing ${label}/…`);
      run('npm install', dir);
    }
  }

  // ── Step 3: Renderer (Vite) ────────────────────────────────────────
  step(3, 'Build renderer (app → app/dist)');
  run('npm run build', appDir);

  // ── Step 4: Main + preload TypeScript ──────────────────────────────
  step(4, 'Build Electron main + preload');
  run('node scripts/build.mjs', desktopDir);

  // ── Step 5: AI server bundle ───────────────────────────────────────
  step(5, 'Bundle AI server → resources/ai-server.cjs');
  run('node scripts/bundle-ai.mjs', desktopDir);

  // ── Step 6: Hub freeze check ───────────────────────────────────────
  step(6, 'Check frozen hub');
  const hubDir = path.join(desktopDir, 'resources', 'hub');
  const hubBin = process.platform === 'win32'
    ? path.join(hubDir, 'serve_app', 'serve_app.exe')
    : path.join(hubDir, 'serve_app', 'serve_app');

  if (existsSync(hubBin)) {
    console.log(`  ✓ frozen hub found: ${hubBin}`);
  } else if (skipHub) {
    console.log('  ⚠ hub not frozen (--skip-hub) — installer will not include the hub.');
    console.log('    The app will require Python on the target machine.');
    console.log('    To freeze: python desktop/scripts/freeze-hub.py');
  } else {
    console.log('  ⚠ frozen hub not found.');
    console.log('    Run:  python desktop/scripts/freeze-hub.py');
    console.log('    Or:   node scripts/predist.mjs --skip-hub  to build without it.');
    console.log('');
    console.log('    Building without hub — the installer will not be fully self-contained.');
    // Create placeholder so electron-builder doesn't crash on missing dir.
    const placeholder = path.join(hubDir, 'NOT_FROZEN.txt');
    mkdirSync(hubDir, { recursive: true });
    writeFileSync(placeholder,
      'Hub was not frozen via PyInstaller.\n' +
      'The app will look for Python on the system PATH.\n' +
      'Run: python desktop/scripts/freeze-hub.py\n');
    console.log('    Created placeholder directory for electron-builder.');
  }

  // ── Step 7: Fix winCodeSign cache on Windows ────────────────────────
  if (process.platform === 'win32') {
    step(7, 'Fix winCodeSign cache (Windows symlink workaround)');
    run('node scripts/fix-wincodesign-cache.mjs', desktopDir);
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log('  ✅  Pre-distribution build complete!');
  console.log('  Run:  npx electron-builder --win   (or --mac / --linux)');
  console.log('═'.repeat(60) + '\n');

} catch (err) {
  console.error('\n  ❌  Build failed:', err.message);
  process.exit(1);
}
