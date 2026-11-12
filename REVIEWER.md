# MatchRoot — Reviewer guide

Everything below can be checked without trusting this document. The
contract is on GenLayer Stable Studionet (chain 61999) and the evidence
transactions are public.

## At a glance

- **Contract:** `0xeC1423fD916E4a0a8D568ae99509036a0De39c63`
  ([explorer](https://explorer-studio.genlayer.com/address/0xeC1423fD916E4a0a8D568ae99509036a0De39c63))
- **Deploy tx:** `0x9e61a35c1ad384b0cf98108f7169463cc3cd3d758762f9aad31a11df6d577db8`
- **Protocol:** `matchroot-1.1` · **Source SHA256:**
  `4af4487c5d4aa41810e141024a88cb8f0c5c150ec20f37393507eeee1229e16d`
  (30,559 bytes, `contracts/matchroot.py`)
- **Live site:** https://chuanqili77.github.io/matchroot-genlayer/
- **Evidence:** [EVIDENCE.md](EVIDENCE.md) — every tx with an explorer link.

## 1. Byte parity (the deployed code is the repo source)

```bash
node scripts/byte_parity.mjs
```

Fetches the deployed code from Studionet and compares it byte for byte
with `contracts/matchroot.py`. Expect `BYTE_PARITY_MATCH: TRUE` and the
SHA256 above. If the code differs, stop — nothing else in this pack can
be trusted.

## 2. Re-read every evidence transaction live

```bash
node scripts/verify_evidence.mjs
```

Re-reads every evidence tx from the chain (status, result, leader
execution, and the returned payload for consensus calls), re-reads the
final round/project/donor/credit state, and checks the ledger exactly.
Expect all checks to PASS. The script fails loudly on the first
mismatch; it never prints a summary PASS for a partial run.

## 3. Recompute the match yourself (no chain needed)

```bash
npm test   # python3 tests/test_matchroot_mock.py
```

The mock implements the same integer square-root rule as the contract
and asserts the exact demo values:

- curl / OpenSSL: direct 20000000000000000000 wei each, match
  19999999995740302400 wei each
- yq: direct 20000000000000000000 wei, match 0
- total match 39999999991480604800 wei; unspent pool
  60000000008519395200 wei; ledger 160 GEN in = 160 GEN out, balance 0

It also proves split-donation invariance (splitting one donor's gift
across many small contributions changes nothing), the scaling rule
(matches scale down proportionally when they exceed the pool),
single-donor-zero-match, and the established thresholds (account age
≥ 1 year, public repos ≥ 5).

## 4. Check the anchors independently

The eligibility and binding verdicts rest on live public data, not on
the contract's word:

- **Projects:** `curl/curl` (https://curl.se/),
  `openssl/openssl` (https://openssl-library.org/),
  `mikefarah/yq` (https://mikefarah.gitbook.io/yq — no trailing slash;
  the trailing-slash form 302-redirects and validators may not follow
  redirects), `python/cpython` (https://www.python.org). Each README
  claim in EXPECTED.md is a verbatim line from the repo's README at its
  default branch; the CPython wrong claim ("a web browser for the modern
  internet") is genuinely absent, which is why its first judgment is
  INELIGIBLE.
- **Donors:** the binding gists are SECRET (unlisted) but their IDs are
  in the checkpoint record and the gist API returns owner + content:
  halihalibt `be302dac9ecf9239e9c274750e519719`,
  gqzy1 `ab80533a45922f1e0688025bee7ba767`,
  zuotu295 `738df908a3eaedd6a34ff7a1519c5804` (too young — real on-chain
  NOT_ESTABLISHED), zuotu295 `75ab7611a00ac987993561e761f86df9` (challenge
  for a different address — real on-chain CHALLENGE_MISMATCH).
- **Probe:** before the main deployment, a probe contract fetched all
  12 anchor URLs on-chain (3 API repos, 3 API readmes, 3 homepages,
  3 user profiles) and all returned 200 with the expected content.
  Results: `probe-results.json` in the workdir; probe contract
  `0x6504524DB5C0B27a294985A630dD27B50e29E19A`.

## 5. Read the final state yourself

Any GenLayer client can read the contract (all views are free):

- `get_round` → phase DISTRIBUTED, total_direct_wei
  60000000000000000000, total_match_wei 39999999991480604800
- `get_all_projects` → curl/OpenSSL direct 20 GEN + match
  19999999995740302400 wei, yq direct 20 GEN + match 0, CPython 0/0
- `get_all_donors` → halihalibt + gqzy1, both established
- `get_counts` → total_received_wei 160000000000000000000,
  total_withdrawn_wei 160000000000000000000, contract_balance_wei 0

## 6. The website (Gate 11)

Open the live site with a cold cache. Before the first FINALIZED
readback completes, every value is a dash and the page says
UNCONFIRMED; the JSON export button is disabled. After readback, values
appear with a FINALIZED marker and the readback time. The site defaults
to English and never reads the browser language; Chinese is a toggle.
Connect any injected wallet (OKX, MetaMask) to read; writes fall back
to a labelled in-browser temporary test account, and a payable write
with that account requires saving the key first. The bundle is
versioned (`?v=<sha>`).

## What is NOT claimed

- The established rule is a sybil friction, not proof of personhood.
- Payout addresses are the evidence run's temporary accounts, not the
  real projects' treasuries — this round demonstrates the mechanism on
  real public data; it does not actually fund curl, OpenSSL, or yq.
- Real-OKX-wallet signing and real-phone 375px rendering were not
  verified in this build; they are the submitter's own checks.
- Scaling (matches exceeding the pool) is proven by the mock only; the
  demo round's total match (40 GEN) is below the pool, so no scaling
  happened on-chain.
- Gist deletion after binding, and a profile that disappears after
  binding, are not covered on-chain.
