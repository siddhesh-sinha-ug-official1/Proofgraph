/**
 * build.mjs — compile main + preload TypeScript via esbuild.
 *
 * Usage:
 *   node scripts/build.mjs           Build once (production)
 *   node scripts/build.mjs --dev     Build + watch + launch Electron
 *
 * esbuild bundles each entry into a single CJS file with all local
 * imports inlined; `electron` and `node:*` stay external.
 */
import { build, context } from 'esbuild';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const isDev = process.argv.includes('--dev');

const shared = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  sourcemap: true,
  external: ['electron', 'electron-updater', 'electron-log',
             'electron-log/main'],
};

const entries = [
  { entryPoints: [path.join(root, 'src/main/index.ts')],
    outfile: path.join(root, 'dist/main/index.js') },
  { entryPoints: [path.join(root, 'src/preload/index.ts')],
    outfile: path.join(root, 'dist/preload/index.js') },
];

if (isDev) {
  // Watch mode: rebuild on change, then (re)start Electron.
  let electronProc = null;

  function startElectron() {
    if (electronProc) electronProc.kill();
    electronProc = spawn('npx', ['electron', '.'], {
      cwd: root,
      stdio: 'inherit',
      shell: true,
    });
    electronProc.on('exit', (code) => {
      if (code !== null) process.exit(code);
    });
  }

  const contexts = await Promise.all(
    entries.map((e) => context({ ...shared, ...e })),
  );

  // Initial build
  await Promise.all(contexts.map((c) => c.rebuild()));
  console.log('[build] initial build complete — launching Electron');
  startElectron();

  // Watch
  await Promise.all(contexts.map((c) => c.watch()));
  console.log('[build] watching for changes…');

} else {
  // One-shot production build
  await Promise.all(
    entries.map((e) => build({ ...shared, ...e, sourcemap: false })),
  );
  console.log('[build] production build complete');
}
