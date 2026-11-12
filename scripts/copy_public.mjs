// Copy the served deployment + evidence files into public/ before build.
// deployment.json is required; transactions.json is copied when present
// (after the evidence run) so the site can render the evidence table.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
fs.mkdirSync(path.join(REPO, 'public'), {recursive: true});
for (const f of ['deployment.json', 'transactions.json']) {
  const src = path.join(REPO, 'evidence', f);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(REPO, 'public', f));
    console.log('copy_public:', f);
  } else {
    console.log('copy_public: skip missing', f);
  }
}
