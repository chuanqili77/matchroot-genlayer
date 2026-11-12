// Byte-parity helper: fetch the deployed code from Studionet and compare
// it byte-for-byte with the repo source. Usage:
//   node scripts/byte_parity.mjs
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createClient} from 'genlayer-js';
import {studionet} from 'genlayer-js/chains';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const deployment = JSON.parse(fs.readFileSync(path.join(REPO, 'evidence', 'deployment.json'), 'utf8'));
const source = fs.readFileSync(path.join(REPO, 'contracts', 'matchroot.py'), 'utf8');
const client = createClient({chain: studionet});
const onChain = await client.getContractCode(deployment.contract_address);
const sha = (s) => createHash('sha256').update(s).digest('hex');
console.log('contract:', deployment.contract_address);
console.log('repo source sha256:   ', sha(source));
console.log('deployed code sha256:', sha(onChain));
console.log(onChain === source ? 'BYTE_PARITY_MATCH: TRUE' : 'BYTE_PARITY_MISMATCH');
process.exit(onChain === source ? 0 : 1);
