// MatchRoot fetch probe runner: probe every anchor URL through the
// deployed probe contract and print each result.
// Usage: node scripts/run_probe.mjs
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createClient, createAccount} from 'genlayer-js';
import {studionet} from 'genlayer-js/chains';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHECKPOINT = path.resolve(REPO, '..', '.matchroot-probe-checkpoint.json');
const DEPLOY = JSON.parse(fs.readFileSync(path.resolve(REPO, '..', 'probe-deployment.json'), 'utf8'));
const ADDRESS = DEPLOY.contract_address;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function leaderExec(tx) {
  let r = tx.consensus_data?.leader_receipt;
  r = Array.isArray(r) ? r.find((x) => x.mode === 'leader') : r;
  return r?.execution_result;
}
function good(tx) {
  return [7, 'FINALIZED'].includes(tx.status)
    && [6, 'MAJORITY_AGREE'].includes(tx.result)
    && leaderExec(tx) === 'SUCCESS';
}

const cp = JSON.parse(fs.readFileSync(CHECKPOINT, 'utf8'));
const account = createAccount(cp.wallets.P1);
const client = createClient({chain: studionet, account});
const reader = createClient({chain: studionet});
console.log('probe contract:', ADDRESS, 'P1:', account.address);

// [label, url, needle]. Readme endpoints return base64 JSON, so the
// needle there is the encoding marker, not the plaintext claim —
// the claim itself is checked by the main contract after decoding.
const URLS = [
  ['api-curl-repo', 'https://api.github.com/repos/curl/curl', 'curl/curl'],
  ['api-ossl-repo', 'https://api.github.com/repos/openssl/openssl', 'openssl/openssl'],
  ['api-yq-repo', 'https://api.github.com/repos/mikefarah/yq', 'mikefarah/yq'],
  ['api-curl-readme', 'https://api.github.com/repos/curl/curl/readme', 'base64'],
  ['api-ossl-readme', 'https://api.github.com/repos/openssl/openssl/readme', 'base64'],
  ['api-yq-readme', 'https://api.github.com/repos/mikefarah/yq/readme', 'base64'],
  ['home-curl', 'https://curl.se/', 'command line tool and library'],
  ['home-ossl', 'https://openssl-library.org/', 'OpenSSL'],
  ['home-yq', 'https://mikefarah.gitbook.io/yq', 'yq'],
  ['user-halihalibt', 'https://api.github.com/users/halihalibt', 'halihalibt'],
  ['user-gqzy1', 'https://api.github.com/users/gqzy1', 'gqzy1'],
  ['user-zuotu295', 'https://api.github.com/users/zuotu295', 'zuotu295'],
];

const out = [];
for (const [label, url, needle] of URLS) {
  let done = false;
  for (let attempt = 1; attempt <= 3 && !done; attempt++) {
    await sleep(1000);
    const hash = await client.writeContract({address: ADDRESS, functionName: 'probe', args: [url, needle], value: 0n, leaderOnly: false});
    console.log(label, 'tx', hash, 'attempt', attempt);
    const tx = await client.waitForTransactionReceipt({hash, status: 'FINALIZED', interval: 5000, retries: 12, fullTransaction: true});
    console.log(label, 'status=', tx.status, 'result=', tx.result, 'leader=', leaderExec(tx));
    if ([5, 'MAJORITY_DISAGREE'].includes(tx.result)) {
      console.log(label, 'consensus disagreed, retrying');
      continue;
    }
    if (!good(tx)) throw new Error(label + ' probe tx not good: ' + JSON.stringify(tx).slice(0, 400));
    const all = JSON.parse(await reader.readContract({address: ADDRESS, functionName: 'get_all_results', args: [], transactionHashVariant: 'latest-final'}));
    const rec = all[all.length - 1];
    console.log(label, '=>', JSON.stringify(rec));
    out.push({label, url, needle, tx: hash, ...rec});
    done = true;
  }
  if (!done) throw new Error(label + ' consensus disagreed 3 times — aborting');
}
fs.writeFileSync(path.resolve(REPO, '..', 'probe-results.json'), JSON.stringify(out, null, 2));
console.log('probe done, wrote probe-results.json');
