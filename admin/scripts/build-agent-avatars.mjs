// Regenerates the agent portraits served by the admin UI.
//
// SOURCE OF TRUTH is `assets/agents/*.png` — the 1024x1024 originals, kept
// OUTSIDE `src/client/public/` on purpose: Vite serves that directory
// verbatim, so a 1.9MB original left there ships to the browser to be drawn
// in a 40px circle. This script derives the small WebP the UI actually
// references (~6.5KB each, ~200x smaller than the source).
//
// 160px covers the largest badge (52px in ActiveStagePanel) at 2x with room
// to spare; the rail's badges are 40px.
//
// Run after adding or replacing an original:  node scripts/build-agent-avatars.mjs
import { readdirSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(root, 'assets/agents');
const OUT = path.join(root, 'src/client/public');
const SIZE = 160;

if (spawnSync('cwebp', ['-version'], { stdio: 'ignore' }).status !== 0) {
  console.error('cwebp not found. Install it with:  brew install webp');
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });

const originals = readdirSync(SRC).filter((f) => /\.(png|jpe?g)$/i.test(f));
if (originals.length === 0) {
  console.error(`No originals found in ${SRC}`);
  process.exit(1);
}

for (const file of originals) {
  const name = file.replace(/\.[^.]+$/, '');
  const out = path.join(OUT, `${name}.webp`);
  const r = spawnSync(
    'cwebp',
    ['-quiet', '-q', '82', '-alpha_q', '90', '-m', '6', '-resize', String(SIZE), String(SIZE), path.join(SRC, file), '-o', out],
    { stdio: 'inherit' },
  );
  if (r.status !== 0) {
    console.error(`cwebp failed on ${file}`);
    process.exit(1);
  }
  console.log(`${file} -> ${path.relative(root, out)}`);
}
