// MatchRoot: independent verification. Re-reads EVERY transaction in
// evidence/transactions.json live from Studionet and re-checks the
// final readback against EXPECTED.md. Exact comparisons only: no
// substring matching, and a MAJORITY_DISAGREE is never counted as PASS.
// Usage: node scripts/verify_evidence.mjs
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createClient} from 'genlayer-js';
import {studionet} from 'genlayer-js/chains';

const RPC_URL = 'https://studio.genlayer.com/api';
const CHAIN_ID = 61999;
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reader = createClient({chain: studionet});
const deployment = JSON.parse(fs.readFileSync(path.join(REPO, 'evidence', 'deployment.json'), 'utf8'));
const txs = JSON.parse(fs.readFileSync(path.join(REPO, 'evidence', 'transactions.json'), 'utf8'));
const ADDRESS = deployment.contract_address;
const sha = (s) => createHash('sha256').update(s).digest('hex');

// Exact match values from tests/test_matchroot_mock.py.
// BigInt literals: JS doubles cannot represent wei exactly above 2^53
// (spacing 4096 at 2e19), so a Number comparison would PASS even if
// the chain value differed by thousands of wei. All wei values below
// are compared as BigInt parsed from the raw packed string.
const MATCH_CURL = 19999999995740302400n;
const MATCH_OSSL = 19999999995740302400n;
const MATCH_YQ = 0; // Number: a zero on-chain value parses as Number 0, and 0n !== 0
const TOTAL_MATCH = 39999999991480604800n;
const UNSPENT_POOL = 60000000008519395200n;

// Parse a packed readback string with exact integers: quote every
// integer with 16+ digits and revive it as BigInt. Small ints
// (project_count, project_id) stay Numbers.
function show(v) {
  return JSON.stringify(v, (k, x) => typeof x === 'bigint' ? x.toString() + 'n' : x);
}
function parseExact(raw) {
  const quoted = raw.replace(/:(-?\d{16,})/g, ':"$1n"');
  return JSON.parse(quoted, (k, v) => typeof v === 'string' && /^-?\d+n$/.test(v) ? BigInt(v.slice(0, -1)) : v);
}

let pass = 0;
let fail = 0;
const failures = [];
function ok(name, cond, extra = '') {
  if (cond) { pass++; console.log('PASS', name); }
  else { fail++; failures.push(name); console.log('FAIL', name, extra); }
}
function leaderReceipt(tx) {
  let r = tx?.consensus_data?.leader_receipt;
  if (Array.isArray(r)) r = r.find((x) => x.mode === 'leader');
  return r || null;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1. Byte parity: deployed code == repo source, byte for byte.
const source = fs.readFileSync(path.join(REPO, 'contracts', 'matchroot.py'), 'utf8');
const onChain = await reader.getContractCode(ADDRESS);
ok('byte parity (deployed code == repo source)', onChain === source);
ok('source sha matches deployment.json', sha(source) === deployment.source_sha256);
ok('deploy tx recorded', typeof txs.deploy_tx === 'string' && txs.deploy_tx.startsWith('0x'));

// 2. Every recorded transaction, re-read live.
const EXPECTED_ERROR = {
  'app-dup': 'DUPLICATE_PROJECT',
  'bind-d3-zuotu': 'NOT_ESTABLISHED',
  'bind-wrong-challenge': 'CHALLENGE_MISMATCH',
  'bind-gist-404': 'GIST_NOT_FOUND',
  'bind-owner-mismatch': 'GIST_OWNER_MISMATCH',
  'bind-duplicate-login': 'DUPLICATE_BINDING',
  'bind-already-bound': 'ALREADY_BOUND',
  'neg-contribute-unbound': 'NOT_BOUND',
  'neg-contribute-ineligible': 'PROJECT_NOT_ELIGIBLE',
  'neg-contribute-zero': 'AMOUNT',
  'neg-distribute-early': 'ROUND_NOT_CLOSED',
  'neg-close-stranger': 'NOT_CREATOR',
  'neg-withdraw-early': 'NO_CREDIT',
  'neg-contribute-after-close': 'ROUND_NOT_FUNDING',
  'neg-distribute-twice': 'ALREADY_DISTRIBUTED',
  'neg-double-withdraw': 'NO_CREDIT',
};
for (const rec of txs.transactions) {
  await sleep(1000);
  let tx;
  try {
    tx = await reader.waitForTransactionReceipt({hash: rec.hash, status: 'FINALIZED', interval: 5000, retries: 6, fullTransaction: true});
  } catch (e) {
    ok(`tx ${rec.label} re-read FINALIZED`, false, String(e?.message || e));
    continue;
  }
  const finalized = [7, 'FINALIZED'].includes(tx.status);
  const agreed = [6, 'MAJORITY_AGREE'].includes(tx.result);
  const leader = leaderReceipt(tx);
  if (rec.result === 'ok') {
    ok(`tx ${rec.label} FINALIZED+AGREE+SUCCESS`, finalized && agreed && leader?.execution_result === 'SUCCESS',
      `status=${tx.status} result=${tx.result} leader=${leader?.execution_result}`);
  } else if (rec.result === 'error-observed') {
    const payload = leader?.result?.payload || '';
    ok(`tx ${rec.label} FINALIZED+AGREE+ERROR with exact payload ${EXPECTED_ERROR[rec.label]}`,
      finalized && agreed && leader?.execution_result === 'ERROR' && payload === EXPECTED_ERROR[rec.label],
      `status=${tx.status} result=${tx.result} leader=${leader?.execution_result} payload=${payload}`);
  } else if (rec.result === 'disagreed-retry') {
    ok(`tx ${rec.label} is a recorded MAJORITY_DISAGREE retry (fail-closed, not a pass)`,
      [5, 'MAJORITY_DISAGREE'].includes(tx.result));
  } else {
    ok(`tx ${rec.label} has a known result kind`, false, rec.result);
  }
}

// 3. Final readback vs EXPECTED.md (latest-final reads, paced at
// >= 2.5 s apart so the 30 req/min RPC bucket is never hit).
const read = async (fn, args) => {
  await sleep(2500);
  return parseExact(await reader.readContract({address: ADDRESS, functionName: fn, args, transactionHashVariant: 'latest-final'}));
};
const round = await read('get_round', []);
ok('round: DISTRIBUTED, distributed true, total match, direct 60, 5 projects, 2 donors',
  round.phase === 'DISTRIBUTED' && round.distributed === true
  && round.total_match_wei === TOTAL_MATCH && round.total_direct_wei === 60000000000000000000n
  && round.project_count === 5 && round.donor_count === 2, show(round));
const p1 = await read('get_project', [1]);
const p2 = await read('get_project', [2]);
const p3 = await read('get_project', [3]);
const p4 = await read('get_project', [4]);
const p5 = await read('get_project', [5]);
ok('project 1 curl: ELIGIBLE, direct 20, match exact, distributed',
  p1.status === 'ELIGIBLE' && p1.direct_wei === 20000000000000000000n && p1.match_wei === MATCH_CURL && p1.distributed === true, show(p1));
ok('project 2 openssl: ELIGIBLE, direct 20, match exact, distributed',
  p2.status === 'ELIGIBLE' && p2.direct_wei === 20000000000000000000n && p2.match_wei === MATCH_OSSL && p2.distributed === true, show(p2));
ok('project 3 yq: ELIGIBLE, direct 20, match 0 (single donor), distributed',
  p3.status === 'ELIGIBLE' && p3.direct_wei === 20000000000000000000n && p3.match_wei === MATCH_YQ && p3.distributed === true, show(p3));
ok('project 4 fake: INELIGIBLE, direct 0, match 0',
  p4.status === 'INELIGIBLE' && p4.direct_wei === 0 && p4.match_wei === 0, show(p4));
ok('project 5 cpython: ELIGIBLE via rejudge, direct 0, match 0, distributed',
  p5.status === 'ELIGIBLE' && p5.direct_wei === 0 && p5.match_wei === 0 && p5.distributed === true, show(p5));
ok('project anchors are the real GitHub repos + homepages',
  p1.repo_url === 'https://github.com/curl/curl' && p1.homepage_url === 'https://curl.se/'
  && p2.repo_url === 'https://github.com/openssl/openssl' && p2.homepage_url === 'https://openssl-library.org/'
  && p3.repo_url === 'https://github.com/mikefarah/yq' && p3.homepage_url === 'https://mikefarah.gitbook.io/yq'
  && p5.repo_url === 'https://github.com/python/cpython' && p5.homepage_url === 'https://www.python.org', show([p1, p2, p3, p5]));
const wallets = deployment.wallets;
const d1 = await read('get_donor', [wallets.D1]);
const d2 = await read('get_donor', [wallets.D2]);
ok('donor D1 halihalibt ESTABLISHED', d1.github_login === 'halihalibt' && d1.established === true, show(d1));
ok('donor D2 gqzy1 ESTABLISHED', d2.github_login === 'gqzy1' && d2.established === true, show(d2));
const c11 = await read('get_contribution', [1, wallets.D1]);
const c12 = await read('get_contribution', [2, wallets.D1]);
const c13 = await read('get_contribution', [3, wallets.D1]);
const c21 = await read('get_contribution', [1, wallets.D2]);
const c22 = await read('get_contribution', [2, wallets.D2]);
ok('contributions: D1 10/10/20, D2 10/10, nothing else',
  c11.total_wei === 10000000000000000000n && c12.total_wei === 10000000000000000000n
  && c13.total_wei === 20000000000000000000n && c21.total_wei === 10000000000000000000n
  && c22.total_wei === 10000000000000000000n, show([c11, c12, c13, c21, c22]));
for (const k of Object.keys(wallets)) {
  const c = await read('get_credit', [wallets[k]]);
  ok(`credit ${k} is 0 after withdrawals`, c.credit_wei === 0, show(c));
}
const counts = await read('get_counts', []);
ok('counts: DISTRIBUTED, 5 projects, 2 donors',
  counts.phase === 'DISTRIBUTED' && counts.project_count === 5 && counts.donor_count === 2, show(counts));
ok('ledger: 160 GEN in = 160 out, balance 0, direct 60, match exact',
  counts.total_received_wei === 160000000000000000000n
  && counts.total_withdrawn_wei === 160000000000000000000n
  && counts.contract_balance_wei === 0 && counts.pool_wei === 100000000000000000000n
  && counts.total_direct_wei === 60000000000000000000n
  && counts.total_match_wei === TOTAL_MATCH, show(counts));
ok('protocol is matchroot-1.1', (await reader.readContract({address: ADDRESS, functionName: 'get_protocol', args: [], transactionHashVariant: 'latest-final'})) === 'matchroot-1.1');

console.log(`\nverify: ${pass} PASS, ${fail} FAIL, ${txs.transactions.length} txs checked`);
if (fail > 0) { console.log('failures:', failures.join(', ')); process.exit(1); }
console.log('INDEPENDENT VERIFICATION PASS');
