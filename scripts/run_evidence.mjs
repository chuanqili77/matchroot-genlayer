// MatchRoot: full evidence run on Stable Studionet (61999).
// Pre-registered expectations: EXPECTED.md (written before this run).
// 1 round create + 6 applications (5 ok + 1 duplicate error) +
// 5 eligibility judgments + 1 rejudge + 8 donor binds (2 ok + 6
// errors) + 1 open funding + 5 contributions + 3 contribute
// negatives + 1 early-distribute negative + 1 stranger-close
// negative + 1 early-withdraw negative + 1 close + 1
// contribute-after-close negative + 1 distribute + 1 double-
// distribute negative + 4 withdrawals + 1 double-withdraw
// negative = 42 txs + deploy.
// Gist IDs come from the checkpoint (cp.gists), created by hand
// BEFORE this run with `gh gist create --secret` under the right
// account (see EXPECTED.md): G1 halihalibt->D1, G2 gqzy1->D2,
// G3 zuotu295->D3, G6 zuotu295 (wrong challenge, for D4).
// Resumable via the checkpoint file. Temp accounts live ONLY in the
// checkpoint file (workspace, NOT in the repo, mode 0600).
// Negative checks compare the exact leader-receipt error payload
// (result.payload), never a substring of the whole receipt, and
// verify the full on-chain state is unchanged before/after.
// Consensus calls retry on MAJORITY_DISAGREE: a disagreement
// changes nothing and the call can be retried.
// Usage: node scripts/run_evidence.mjs [--checkpoint <path>]
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createClient, createAccount} from 'genlayer-js';
import {studionet} from 'genlayer-js/chains';

const RPC_URL = 'https://studio.genlayer.com/api';
const CHAIN_ID = 61999;
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const CHECKPOINT = opt('--checkpoint', path.resolve(REPO, '..', '.matchroot-checkpoint.json'));
const TX_PATH = path.join(REPO, 'evidence', 'transactions.json');
const GEN = 1000000000000000000n;

// Exact match values from tests/test_matchroot_mock.py (same integer
// sqrt, same formula). Never hand-edit these: rerun the mock.
const MATCH_CURL = 19999999995740302400;
const MATCH_OSSL = 19999999995740302400;
const MATCH_YQ = 0;
const TOTAL_MATCH = 39999999991480604800;
const UNSPENT_POOL = 60000000008519395200;
const W_CURL = 39999999995740302400;
const W_OSSL = 39999999995740302400;
const W_YQ = 20000000000000000000;
const W_CREATOR = 60000000008519395200;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// RPC rate limit is 30 requests/minute on the standard bucket. The
// first run died on it: snapshotState does ~16 reads back-to-back and
// two snapshots per negative tx blew the bucket. Every read and every
// send now goes through this gate (>= 2.5 s apart = at most 24 ops/min
// from this script), and a rate-limit error sleeps out the server's
// retry window and retries instead of crashing the run.
let lastRpc = 0;
async function rpcGate() {
  const now = Date.now();
  const wait = 2500 - (now - lastRpc);
  if (wait > 0) await sleep(wait);
  lastRpc = Date.now();
}
function isRateLimit(e) {
  const m = String(e?.cause?.message || e?.message || '');
  return m.includes('Rate limit') || e?.cause?.code === -32029;
}
async function withRateLimitRetry(fn, what) {
  for (let i = 0; i < 4; i++) {
    try { return await fn(); }
    catch (e) {
      if (isRateLimit(e) && i < 3) {
        const after = e?.cause?.data?.retry_after_seconds || 30;
        console.log('rate-limited on', what, '- sleeping', after + 5, 's');
        await sleep((after + 5) * 1000);
        continue;
      }
      throw e;
    }
  }
}
async function sendTx(client, params) {
  await rpcGate();
  return withRateLimitRetry(() => client.writeContract(params), 'writeContract ' + params.functionName);
}
async function readView(fn, args) {
  await rpcGate();
  return withRateLimitRetry(() => reader.readContract({address: ADDRESS, functionName: fn, args, transactionHashVariant: 'latest-final'}), 'read ' + fn);
}
function loadCheckpoint() {
  return JSON.parse(fs.readFileSync(CHECKPOINT, 'utf8'));
}
function saveCheckpoint(cp) {
  fs.writeFileSync(CHECKPOINT, JSON.stringify(cp, null, 2), {mode: 0o600});
  fs.chmodSync(CHECKPOINT, 0o600);
}
function leaderReceipt(tx) {
  let r = tx?.consensus_data?.leader_receipt;
  if (Array.isArray(r)) r = r.find((x) => x.mode === 'leader');
  return r || null;
}
function leaderExec(tx) { return leaderReceipt(tx)?.execution_result; }
function leaderError(tx) { return leaderReceipt(tx)?.result?.payload || ''; }
function good(tx) {
  return [7, 'FINALIZED'].includes(tx.status)
    && [6, 'MAJORITY_AGREE'].includes(tx.result)
    && leaderExec(tx) === 'SUCCESS';
}
function errorObserved(tx, code) {
  return [7, 'FINALIZED'].includes(tx.status)
    && [6, 'MAJORITY_AGREE'].includes(tx.result)
    && leaderExec(tx) === 'ERROR'
    && leaderError(tx) === code;
}
async function collect(client, hash, label) {
  console.log(label, hash);
  for (let i = 0; i < 3; i++) {
    try {
      const tx = await client.waitForTransactionReceipt({hash, status: 'FINALIZED', interval: 10000, retries: 18, fullTransaction: true});
      console.log(label, 'status=', tx.status, 'result=', tx.result, 'leader=', leaderExec(tx), 'leader_error=', leaderError(tx));
      return tx;
    } catch (e) {
      console.log('tracking', label, 'attempt', i, e.shortMessage || e.message);
      await sleep(5000);
    }
  }
  throw new Error('Timeout waiting for FINALIZED: ' + label + ' ' + hash);
}

const cp = loadCheckpoint();
const ADDRESS = cp.contract_address;
if (!ADDRESS) throw new Error('no contract_address in checkpoint; deploy first');
if (!cp.gists || !cp.gists.G1 || !cp.gists.G2 || !cp.gists.G3 || !cp.gists.G6) {
  throw new Error('checkpoint has no gists {G1,G2,G3,G6}; create the SECRET gists first (see EXPECTED.md) and add their IDs to the checkpoint');
}
const G = cp.gists;
const wallets = cp.wallets;
const accounts = {};
for (const k of Object.keys(wallets)) accounts[k] = createAccount(wallets[k]);
const clients = {};
for (const k of Object.keys(accounts)) clients[k] = createClient({chain: studionet, account: accounts[k]});
const reader = createClient({chain: studionet});
console.log('contract:', ADDRESS);
for (const k of Object.keys(accounts)) console.log(k, ':', accounts[k].address);

const ev = cp.evidence || (cp.evidence = {done: {}, projects: {}});
const done = ev.done;
const records = [];
const NEG_ERRORS = {
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
const LABEL_ORDER = ['round-create',
  'app-curl', 'app-openssl', 'app-yq', 'app-fake', 'app-cpython', 'app-dup',
  'judge-curl', 'judge-openssl', 'judge-yq', 'judge-fake', 'judge-cpython',
  'rejudge-cpython',
  'bind-d1', 'bind-d2', 'bind-d3-zuotu', 'bind-wrong-challenge',
  'bind-gist-404', 'bind-owner-mismatch', 'bind-duplicate-login',
  'bind-already-bound',
  'open-funding',
  'neg-contribute-unbound', 'neg-contribute-ineligible', 'neg-contribute-zero',
  'c1-d1-curl', 'c2-d1-openssl', 'c3-d1-yq', 'c4-d2-curl', 'c5-d2-openssl',
  'neg-distribute-early', 'neg-close-stranger', 'neg-withdraw-early',
  'close-round', 'neg-contribute-after-close',
  'distribute', 'neg-distribute-twice',
  'w-curl', 'w-openssl', 'w-yq', 'w-creator', 'neg-double-withdraw'];
for (const label of LABEL_ORDER) {
  const hash = done[label];
  if (!hash) continue;
  if (NEG_ERRORS[label]) records.push({label, hash, result: 'error-observed', expected_error: NEG_ERRORS[label]});
  else if (/-attempt-\d+$/.test(label)) records.push({label, hash, result: 'disagreed-retry'});
  else records.push({label, hash, result: 'ok'});
}
for (const label of Object.keys(done).sort()) {
  if (LABEL_ORDER.includes(label)) continue;
  const hash = done[label];
  if (NEG_ERRORS[label]) records.push({label, hash, result: 'error-observed', expected_error: NEG_ERRORS[label]});
  else if (/-attempt-\d+$/.test(label)) records.push({label, hash, result: 'disagreed-retry'});
  else records.push({label, hash, result: 'ok'});
}
if (records.length > 0) console.log('resumed:', records.length, 'txs already recorded from the checkpoint');
function record(label, hash, result, extra = {}) {
  records.push({label, hash, result, ...extra});
  fs.writeFileSync(TX_PATH, JSON.stringify({network: 'Stable Studionet', chain_id: CHAIN_ID, contract_address: ADDRESS, deploy_tx: cp.deploy_tx, complete: false, transactions: records}, null, 2));
  done[label] = hash;
  saveCheckpoint(cp);
}

async function readRound() {
  return JSON.parse(await readView('get_round', []));
}
async function readProject(id) {
  return JSON.parse(await readView('get_project', [id]));
}
async function readDonor(addr) {
  const raw = await readView('get_donor', [addr]);
  return raw ? JSON.parse(raw) : null;
}
async function readCredit(addr) {
  return JSON.parse(await readView('get_credit', [addr]));
}
async function readCounts() {
  return JSON.parse(await readView('get_counts', []));
}
async function snapshotState() {
  const round = await readView('get_round', []);
  const projects = await readView('get_all_projects', []);
  const donors = await readView('get_all_donors', []);
  const counts = await readCounts();
  const credits = {};
  for (const k of Object.keys(accounts)) credits[k] = (await readCredit(accounts[k].address)).credit_wei;
  return JSON.stringify({round, projects, donors, counts, credits});
}
async function resolvePending() {
  if (!cp.pending) return;
  const {label, hash} = cp.pending;
  console.log('resolving pending tx:', label, hash);
  const tx = await reader.waitForTransactionReceipt({hash, status: 'FINALIZED', interval: 10000, retries: 18, fullTransaction: true});
  if (NEG_ERRORS[label]) {
    const code = NEG_ERRORS[label];
    if (!errorObserved(tx, code)) throw new Error('pending ' + label + ' did not show expected error ' + code);
    record(label, hash, 'error-observed', {expected_error: code, unchanged_state: true});
  } else if (/-attempt-\d+$/.test(label)) {
    record(label, hash, 'disagreed-retry');
  } else {
    if (!good(tx)) throw new Error('pending ' + label + ' did not reach FINALIZED+AGREE+SUCCESS: ' + JSON.stringify(tx).slice(0, 300));
    record(label, hash, 'ok');
  }
  delete cp.pending; saveCheckpoint(cp);
  console.log('pending resolved:', label, hash);
}
async function writeOk(label, who, fn, args, value = 0n) {
  if (done[label]) { console.log(label, 'already done:', done[label]); return done[label]; }
  await sleep(1000);
  await resolvePending();
  if (done[label]) { console.log(label, 'resolved as done:', done[label]); return done[label]; }
  const hash = await sendTx(clients[who], {address: ADDRESS, functionName: fn, args, value, leaderOnly: false});
  cp.pending = {label, hash}; saveCheckpoint(cp);
  const tx = await collect(clients[who], hash, label);
  delete cp.pending; saveCheckpoint(cp);
  if (!good(tx)) throw new Error(label + ' did not reach FINALIZED+AGREE+SUCCESS: ' + JSON.stringify(tx).slice(0, 400));
  record(label, hash, 'ok');
  return hash;
}
async function writeErr(label, who, fn, args, code, value = 0n) {
  if (done[label]) { console.log(label, 'already done:', done[label]); return done[label]; }
  await sleep(1000);
  await resolvePending();
  if (done[label]) { console.log(label, 'resolved as done:', done[label]); return done[label]; }
  const before = await snapshotState();
  const hash = await sendTx(clients[who], {address: ADDRESS, functionName: fn, args, value, leaderOnly: false});
  cp.pending = {label, hash}; saveCheckpoint(cp);
  const tx = await collect(clients[who], hash, label);
  delete cp.pending; saveCheckpoint(cp);
  if (!errorObserved(tx, code)) throw new Error(label + ' did not show expected error ' + code + ' (leader payload: ' + leaderError(tx) + '): ' + JSON.stringify(tx).slice(0, 400));
  const after = await snapshotState();
  if (before !== after) throw new Error(label + ' changed state');
  record(label, hash, 'error-observed', {expected_error: code, unchanged_state: true});
  return hash;
}
// Consensus call with retry on MAJORITY_DISAGREE. `check` verifies the
// resulting on-chain state after a successful tx.
async function consensusFlow(label, who, fn, args, check, value = 0n) {
  if (done[label]) { console.log(label, 'already done:', done[label]); return done[label]; }
  await resolvePending();
  if (done[label]) { console.log(label, 'resolved as done:', done[label]); return done[label]; }
  for (let attempt = 1; attempt <= 3; attempt++) {
    await sleep(1000);
    const hash = await sendTx(clients[who], {address: ADDRESS, functionName: fn, args, value, leaderOnly: false});
    cp.pending = {label, hash}; saveCheckpoint(cp);
    const tx = await collect(clients[who], hash, `${label} attempt ${attempt} (caller ${who})`);
    delete cp.pending; saveCheckpoint(cp);
    if ([5, 'MAJORITY_DISAGREE'].includes(tx.result)) {
      console.log(label, 'consensus disagreed (attempt', attempt + '), retrying — nothing changed');
      record(`${label}-attempt-${attempt}`, hash, 'disagreed-retry');
      continue;
    }
    if (!good(tx)) throw new Error(label + ' tx not good: ' + JSON.stringify(tx).slice(0, 400));
    if (check) await check();
    record(label, hash, 'ok');
    return hash;
  }
  throw new Error(label + ' consensus disagreed 3 times — aborting');
}
async function consensusErrFlow(label, who, fn, args, code, value = 0n) {
  if (done[label]) { console.log(label, 'already done:', done[label]); return done[label]; }
  await resolvePending();
  if (done[label]) { console.log(label, 'resolved as done:', done[label]); return done[label]; }
  for (let attempt = 1; attempt <= 3; attempt++) {
    await sleep(1000);
    const before = await snapshotState();
    const hash = await sendTx(clients[who], {address: ADDRESS, functionName: fn, args, value, leaderOnly: false});
    cp.pending = {label, hash}; saveCheckpoint(cp);
    const tx = await collect(clients[who], hash, `${label} attempt ${attempt} (caller ${who})`);
    delete cp.pending; saveCheckpoint(cp);
    if ([5, 'MAJORITY_DISAGREE'].includes(tx.result)) {
      console.log(label, 'consensus disagreed (attempt', attempt + '), retrying — nothing changed');
      record(`${label}-attempt-${attempt}`, hash, 'disagreed-retry');
      continue;
    }
    if (!errorObserved(tx, code)) throw new Error(label + ' did not show expected error ' + code + ' (leader payload: ' + leaderError(tx) + '): ' + JSON.stringify(tx).slice(0, 400));
    const after = await snapshotState();
    if (before !== after) throw new Error(label + ' changed state');
    record(label, hash, 'error-observed', {expected_error: code, unchanged_state: true});
    return hash;
  }
  throw new Error(label + ' consensus disagreed 3 times — aborting');
}
async function withdrawFlow(label, who, expectedWei) {
  if (done[label]) { console.log(label, 'already done:', done[label]); return done[label]; }
  await sleep(1000);
  await resolvePending();
  if (done[label]) { console.log(label, 'resolved as done:', done[label]); return done[label]; }
  const before = (await readCredit(accounts[who].address)).credit_wei;
  if (before !== expectedWei) throw new Error(label + ' credit before withdraw is ' + before + ', expected ' + expectedWei);
  const hash = await sendTx(clients[who], {address: ADDRESS, functionName: 'withdraw', args: [], value: 0n, leaderOnly: false});
  cp.pending = {label, hash}; saveCheckpoint(cp);
  const tx = await collect(clients[who], hash, label);
  delete cp.pending; saveCheckpoint(cp);
  if (!good(tx)) throw new Error(label + ' withdraw tx not good: ' + JSON.stringify(tx).slice(0, 400));
  const after = (await readCredit(accounts[who].address)).credit_wei;
  if (after !== 0) throw new Error(label + ' credit after withdraw is ' + after + ', expected 0');
  record(label, hash, 'ok', {withdrawn_wei: expectedWei});
  return hash;
}
async function applyFlow(label, who, appArgs) {
  if (ev.projects[label]) { console.log(label, 'already created as id', ev.projects[label]); return ev.projects[label]; }
  await writeOk(label, who, 'apply_project', appArgs);
  const id = (await readCounts()).project_count;
  ev.projects[label] = id;
  saveCheckpoint(cp);
  console.log(label, 'is project id', id);
  return id;
}

const creator = accounts.CREATOR.address.toLowerCase();
const appl = accounts.APPL.address;
const d1 = accounts.D1.address.toLowerCase();
const d2 = accounts.D2.address.toLowerCase();
const d3 = accounts.D3.address.toLowerCase();
const d4 = accounts.D4.address.toLowerCase();
const d5 = accounts.D5.address.toLowerCase();
const out = accounts.OUT.address.toLowerCase();

// A. Round creation: creator funds the 100 GEN matching pool.
await writeOk('round-create', 'CREATOR', 'create_round', [], 100n * GEN);

// B. Project applications (all by APPL; payout addresses are the
// per-project temp accounts). Homepage URLs are the forms that fetch
// 200 directly (yq without a trailing slash — the trailing-slash form
// 302-redirects); the contract compares them after stripping one
// trailing slash.
const pCurl = await applyFlow('app-curl', 'APPL', ['curl', 'https://github.com/curl/curl', 'https://curl.se/', 'Command-line tool and library for transferring data with URLs', 'curl is a command-line tool for transferring data from or to a server using', accounts.PCURL.address]);
const pOssl = await applyFlow('app-openssl', 'APPL', ['OpenSSL', 'https://github.com/openssl/openssl', 'https://openssl-library.org/', 'General purpose TLS and crypto library', 'OpenSSL is a robust, commercial-grade, full-featured Open Source Toolkit', accounts.POSSL.address]);
const pYq = await applyFlow('app-yq', 'APPL', ['yq', 'https://github.com/mikefarah/yq', 'https://mikefarah.gitbook.io/yq', 'Portable command-line YAML, JSON and XML processor', 'A lightweight and portable command-line YAML, JSON, INI and XML processor.', accounts.PYQ.address]);
const pFake = await applyFlow('app-fake', 'APPL', ['FakeRepo', 'https://github.com/matchroot-demo-nonexistent/fake-repo-xyz', 'https://example.com', 'A demo project that does not exist', 'this claim cannot be found anywhere', accounts.PCPY.address]);
const pCpy = await applyFlow('app-cpython', 'APPL', ['CPython', 'https://github.com/python/cpython', 'https://www.python.org', 'The Python programming language', 'a web browser for the modern internet', accounts.PCPY.address]);
// Duplicate repo application: same repo as curl.
await writeErr('app-dup', 'APPL', 'apply_project', ['curl again', 'https://github.com/curl/curl', 'https://curl.se/', 'Duplicate application', 'curl is a command-line tool for transferring data from or to a server using', accounts.PCURL.address], 'DUPLICATE_PROJECT');

// C. Eligibility judgments (consensus; retry on disagreement).
const judgeCheck = (id, status) => async () => {
  const p = await readProject(id);
  if (p.status !== status) throw new Error(`project ${id} status is ${p.status}, expected ${status}`);
};
await consensusFlow('judge-curl', 'OUT', 'judge_eligibility', [pCurl], judgeCheck(pCurl, 'ELIGIBLE'));
await consensusFlow('judge-openssl', 'OUT', 'judge_eligibility', [pOssl], judgeCheck(pOssl, 'ELIGIBLE'));
await consensusFlow('judge-yq', 'OUT', 'judge_eligibility', [pYq], judgeCheck(pYq, 'ELIGIBLE'));
await consensusFlow('judge-fake', 'OUT', 'judge_eligibility', [pFake], judgeCheck(pFake, 'INELIGIBLE'));
await consensusFlow('judge-cpython', 'OUT', 'judge_eligibility', [pCpy], judgeCheck(pCpy, 'INELIGIBLE'));
// Second look (Gate 3): the applicant rejudges CPython with a
// CORRECTED claim taken verbatim from its README — the verdict flips.
await consensusFlow('rejudge-cpython', 'APPL', 'rejudge_eligibility', [pCpy, 'See the end of this file for further copyright and license information.'], judgeCheck(pCpy, 'ELIGIBLE'));

// D. Donor bindings (consensus; retry on disagreement).
const bindCheck = (addr, login) => async () => {
  const dn = await readDonor(addr);
  if (!dn || dn.github_login !== login || dn.established !== true) throw new Error(`donor ${addr} not bound+established: ${JSON.stringify(dn)}`);
};
await consensusFlow('bind-d1', 'D1', 'bind_donor', [d1, 'halihalibt', G.G1], bindCheck(d1, 'halihalibt'));
await consensusFlow('bind-d2', 'D2', 'bind_donor', [d2, 'gqzy1', G.G2], bindCheck(d2, 'gqzy1'));
await consensusErrFlow('bind-d3-zuotu', 'D3', 'bind_donor', [d3, 'zuotu295', G.G3], 'NOT_ESTABLISHED');
await consensusErrFlow('bind-wrong-challenge', 'D4', 'bind_donor', [d4, 'zuotu295', G.G6], 'CHALLENGE_MISMATCH');
await consensusErrFlow('bind-gist-404', 'D5', 'bind_donor', [d5, 'gqzy999', '00000000000000000000000000000000'], 'GIST_NOT_FOUND');
await consensusErrFlow('bind-owner-mismatch', 'D5', 'bind_donor', [d5, 'gqzy999', G.G1], 'GIST_OWNER_MISMATCH');
await writeErr('bind-duplicate-login', 'D4', 'bind_donor', [d4, 'halihalibt', '00000000000000000000000000000000'], 'DUPLICATE_BINDING');
await writeErr('bind-already-bound', 'D1', 'bind_donor', [d1, 'gqzy1', '00000000000000000000000000000000'], 'ALREADY_BOUND');

// E. Open funding.
await writeOk('open-funding', 'CREATOR', 'open_funding', []);

// F. Contribute negatives (0 GEN sent on every failed payable).
await writeErr('neg-contribute-unbound', 'OUT', 'contribute', [pCurl], 'NOT_BOUND', 0n);
await writeErr('neg-contribute-ineligible', 'D1', 'contribute', [pFake], 'PROJECT_NOT_ELIGIBLE', 0n);
await writeErr('neg-contribute-zero', 'D1', 'contribute', [pCurl], 'AMOUNT', 0n);

// G. Contributions: the QF demo story. D1: 10 curl + 10 openssl +
// 20 yq; D2: 10 curl + 10 openssl. Same 20 GEN direct each, but
// curl/openssl (broad) earn a 20 GEN match and yq (single donor)
// earns 0.
await writeOk('c1-d1-curl', 'D1', 'contribute', [pCurl], 10n * GEN);
await writeOk('c2-d1-openssl', 'D1', 'contribute', [pOssl], 10n * GEN);
await writeOk('c3-d1-yq', 'D1', 'contribute', [pYq], 20n * GEN);
await writeOk('c4-d2-curl', 'D2', 'contribute', [pCurl], 10n * GEN);
await writeOk('c5-d2-openssl', 'D2', 'contribute', [pOssl], 10n * GEN);

// H. Pre-close negatives.
await writeErr('neg-distribute-early', 'OUT', 'distribute', [], 'ROUND_NOT_CLOSED');
await writeErr('neg-close-stranger', 'OUT', 'close_round', [], 'NOT_CREATOR');
await writeErr('neg-withdraw-early', 'PCURL', 'withdraw', [], 'NO_CREDIT');

// I. Close, then a contribute-after-close negative.
await writeOk('close-round', 'CREATOR', 'close_round', []);
await writeErr('neg-contribute-after-close', 'D1', 'contribute', [pCurl], 'ROUND_NOT_FUNDING', 0n);

// J. Distribution (permissionless, deterministic).
await writeOk('distribute', 'OUT', 'distribute', []);
await writeErr('neg-distribute-twice', 'OUT', 'distribute', [], 'ALREADY_DISTRIBUTED');

// K. Withdrawals (exact credits from the mock).
await withdrawFlow('w-curl', 'PCURL', W_CURL);
await withdrawFlow('w-openssl', 'POSSL', W_OSSL);
await withdrawFlow('w-yq', 'PYQ', W_YQ);
await withdrawFlow('w-creator', 'CREATOR', W_CREATOR);
await writeErr('neg-double-withdraw', 'CREATOR', 'withdraw', [], 'NO_CREDIT');

// Final readback vs EXPECTED.md. EXACT: wei values are compared as
// BigInt parsed from the raw packed string. A plain JSON.parse rounds
// wei to doubles (spacing 4096 at 2e19), which would PASS even if the
// chain value differed by thousands of wei — the v1.1 run's printed
// values looked "off by 600" for exactly that reason; the raw strings
// proved them exact. (withdrawFlow's pre-checks still compare doubles;
// the exact final state is established here and by verify_evidence.mjs.)
function parseExact(raw) {
  const quoted = raw.replace(/:(-?\d{16,})/g, ':"$1n"');
  return JSON.parse(quoted, (k, v) => typeof v === 'string' && /^-?\d+n$/.test(v) ? BigInt(v.slice(0, -1)) : v);
}
const showBig = (v) => JSON.stringify(v, (k, x) => typeof x === 'bigint' ? x.toString() : x);
const readRoundX = async () => parseExact(await readView('get_round', []));
const readProjectX = async (id) => parseExact(await readView('get_project', [id]));
const readCreditX = async (addr) => parseExact(await readView('get_credit', [addr]));
const readCountsX = async () => parseExact(await readView('get_counts', []));
const MATCH_CURL_X = 19999999995740302400n;
const MATCH_OSSL_X = 19999999995740302400n;
const MATCH_YQ_X = 0; // Number: a zero on-chain value parses as Number 0, and 0n !== 0
const TOTAL_MATCH_X = 39999999991480604800n;
const round = await readRoundX();
console.log('round:', showBig(round));
if (round.phase !== 'DISTRIBUTED' || round.distributed !== true || round.total_match_wei !== TOTAL_MATCH_X || round.total_direct_wei !== 60000000000000000000n || round.project_count !== 5 || round.donor_count !== 2) throw new Error('round does not match EXPECTED.md');
const pc = await readProjectX(pCurl);
const po = await readProjectX(pOssl);
const py = await readProjectX(pYq);
const pf = await readProjectX(pFake);
const pp = await readProjectX(pCpy);
console.log('projects:', showBig([pc, po, py, pf, pp]));
if (pc.status !== 'ELIGIBLE' || pc.direct_wei !== 20000000000000000000n || pc.match_wei !== MATCH_CURL_X || pc.distributed !== true) throw new Error('curl does not match EXPECTED.md');
if (po.status !== 'ELIGIBLE' || po.direct_wei !== 20000000000000000000n || po.match_wei !== MATCH_OSSL_X || po.distributed !== true) throw new Error('openssl does not match EXPECTED.md');
if (py.status !== 'ELIGIBLE' || py.direct_wei !== 20000000000000000000n || py.match_wei !== MATCH_YQ_X || py.distributed !== true) throw new Error('yq does not match EXPECTED.md');
if (pf.status !== 'INELIGIBLE' || pf.direct_wei !== 0 || pf.match_wei !== 0) throw new Error('fake project does not match EXPECTED.md');
if (pp.status !== 'ELIGIBLE' || pp.direct_wei !== 0 || pp.match_wei !== 0 || pp.distributed !== true) throw new Error('cpython does not match EXPECTED.md');
for (const k of Object.keys(accounts)) {
  const c = await readCreditX(accounts[k].address);
  if (c.credit_wei !== 0) throw new Error(k + ' credit is not 0 after withdrawals: ' + c.credit_wei);
}
const counts = await readCountsX();
console.log('counts:', showBig(counts));
if (counts.phase !== 'DISTRIBUTED' || counts.project_count !== 5 || counts.donor_count !== 2
  || counts.total_received_wei !== 160000000000000000000n
  || counts.total_withdrawn_wei !== 160000000000000000000n
  || counts.contract_balance_wei !== 0 || counts.pool_wei !== 100000000000000000000n
  || counts.total_direct_wei !== 60000000000000000000n
  || counts.total_match_wei !== TOTAL_MATCH_X) {
  throw new Error('LEDGER MISMATCH: expected 160 GEN in = 160 out, balance 0, direct 60, match ' + TOTAL_MATCH_X);
}

fs.mkdirSync(path.dirname(TX_PATH), {recursive: true});
fs.writeFileSync(TX_PATH, JSON.stringify({network: 'Stable Studionet', chain_id: CHAIN_ID, contract_address: ADDRESS, deploy_tx: cp.deploy_tx, complete: true, transactions: records}, null, 2));
console.log('evidence complete:', records.length, 'txs recorded in', TX_PATH);
console.log('ALL EXPECTED OUTCOMES MATCH. 160 GEN in = 160 out, balance 0. curl/openssl match 19999999995740302400 wei each, yq 0.');
