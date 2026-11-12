// Stamp the built bundle hash into docs/index.html so a cold-start check can
// prove the browser loaded the current build (TenderCourt lesson:
// an unversioned bundle served stale code and produced false FAILs).
// Vite already content-hashes the bundle filename; the ?v= stamp is an
// extra explicit marker. Run automatically as the vite `postbuild` step.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(REPO, 'docs');
const indexPath = path.join(outDir, 'index.html');
if (!fs.existsSync(indexPath)) {
  console.log('write_version: no docs/index.html yet, skipping');
  process.exit(0);
}
const assets = fs.readdirSync(path.join(outDir, 'assets'));
const js = assets.find((f) => f.endsWith('.js') && f.startsWith('index-'));
if (!js) throw new Error('write_version: no JS bundle in docs/assets');
const bundle = fs.readFileSync(path.join(outDir, 'assets', js));
const hash = createHash('sha256').update(bundle).digest('hex').slice(0, 12);
let html = fs.readFileSync(indexPath, 'utf8');
if (!html.includes(js + '?v=')) {
  html = html.replace(js, js + '?v=' + hash);
  fs.writeFileSync(indexPath, html);
}
console.log('write_version: bundle', js, '-> ?v=' + hash);
