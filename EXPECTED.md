# EXPECTED.md — MatchRoot evidence (pre-registered BEFORE the run)

Contract: MatchRoot, protocol `matchroot-1.1`, Stable Studionet (61999).
One round, one matching pool of 100 GEN funded by the round creator
at creation. Quadratic funding: match_i = (sum of integer square
roots of each donor's total contribution)^2 − direct contributions,
floored at 0; scaled down proportionally if the raw matches exceed
the pool. Integer sqrt truncates a few wei per match — the mock
computes the exact integers, and this file pre-registers them.

## The demo story (breadth beats whales)

Three real public-good projects, all with real GitHub repos and
real homepages. Two established donors give the same 20 GEN direct
to each of curl and openssl (2 × 10 GEN) and to yq (1 × 20 GEN):

| Project | Direct | Donors | Match | Total paid out |
|---------|--------|--------|-------|----------------|
| curl (1) | 20 GEN | 2 × 10 | 19999999995740302400 wei | 39999999995740302400 wei |
| OpenSSL (2) | 20 GEN | 2 × 10 | 19999999995740302400 wei | 39999999995740302400 wei |
| yq (3) | 20 GEN | 1 × 20 | 0 | 20000000000000000000 wei |

Total match 39999999991480604800 wei (40 GEN minus 8519395200 wei
of integer-sqrt dust). Unspent pool 60000000008519395200 wei goes
back to the creator. Ledger: 160 GEN in (pool 100 + donations 60)
= 160 GEN out (projects 100 + creator 60), balance 0.

## Round

- Creator: CREATOR temp account. Pool: 100 GEN exactly, paid with
  `create_round` (VALUE_MUST_EQUAL_POOL otherwise).
- Phases: APPLICATION → FUNDING → CLOSED → DISTRIBUTED. `open_funding`
  and `close_round` are creator-only; `distribute` is open to anyone
  (pure deterministic recomputation from recorded state).

## Projects (all real, anchors verified 2026-11-12)

| ID | Project | Repo | Homepage | Purpose | readme_claim (verbatim from the README) | Expected verdict |
|----|---------|------|----------|---------|------------------------------------------|------------------|
| 1 | curl | https://github.com/curl/curl | https://curl.se/ | Command-line tool and library for transferring data with URLs | curl is a command-line tool for transferring data from or to a server using | ELIGIBLE |
| 2 | OpenSSL | https://github.com/openssl/openssl | https://openssl-library.org/ | General purpose TLS and crypto library | OpenSSL is a robust, commercial-grade, full-featured Open Source Toolkit | ELIGIBLE |
| 3 | yq | https://github.com/mikefarah/yq | https://mikefarah.gitbook.io/yq | Portable command-line YAML, JSON and XML processor | A lightweight and portable command-line YAML, JSON, INI and XML processor. | ELIGIBLE |
| 4 | FakeRepo | https://github.com/matchroot-demo-nonexistent/fake-repo-xyz | https://example.com | A demo project that does not exist | this claim cannot be found anywhere | INELIGIBLE (repo 404) |
| 5 | CPython | https://github.com/python/cpython | https://www.python.org | The Python programming language | a web browser for the modern internet (first claim, wrong) → rejudged with: See the end of this file for further copyright and license information. | INELIGIBLE, then ELIGIBLE on rejudge |

Eligibility rule (consensus, exact vector): repo_exists (API 200 +
full_name exact) + readme_match (raw README at the API-reported
default branch contains the claim verbatim) + homepage_ok (homepage
fetch 200 AND the API "homepage" field equals the application's
homepage after stripping one trailing slash from each side).
ELIGIBLE iff all three are true. A fetch failure is a False flag,
never a pass. Homepage URLs in the applications are the forms that
fetch 200 directly: curl.se/ and openssl-library.org/ (as GitHub
records them, trailing slash included) and mikefarah.gitbook.io/yq
WITHOUT a trailing slash — the trailing-slash form 302-redirects and
validators may not follow redirects (probe contract verified the
no-slash form returns 200). GitHub records yq's homepage WITH a
trailing slash; the contract strips one trailing slash from each
side before comparing, so the no-slash application still matches.

Second look (Gate 3): CPython is first judged INELIGIBLE on the
wrong claim, then its applicant rejudges with the corrected claim
taken verbatim from the real README — the verdict flips to
ELIGIBLE. The second round judges new input (the corrected claim),
not a re-run of the same check.

## Donors (GitHub identity anchor)

Established rule (deterministic code): created_at < "2025-11-12"
(deploy date minus 1 year; ISO strings compare lexicographically,
no clock on Studionet) AND public_repos >= 5.

| Donor address | GitHub login | Profile (checked 2026-11-12) | Expected |
|---------------|--------------|-------------------------------|----------|
| D1 | halihalibt | created 2021-12-16, 32 repos | ESTABLISHED, bind ok |
| D2 | gqzy1 | created 2023-12-29, 23 repos | ESTABLISHED, bind ok |
| D3 | zuotu295 | created 2026-10-21, 14 repos | NOT_ESTABLISHED (bind fails) |
| D4 | zuotu295 (wrong challenge) | gist holds `matchroot-bind:<OUT>` | CHALLENGE_MISMATCH (bind fails) |
| D5 | gqzy999 (gist 404) | gist id all zeros | GIST_NOT_FOUND (bind fails) |
| D5 | gqzy999 (G1, halihalibt's gist) | gist owner is halihalibt | GIST_OWNER_MISMATCH (bind fails) |
| D4 | halihalibt (dummy gist) | login already bound to D1 | DUPLICATE_BINDING (bind fails, no consensus) |
| D1 | gqzy1 (dummy gist) | address already bound | ALREADY_BOUND (bind fails, no consensus) |

Bind rule (consensus, exact vector): gist_ok + owner_match +
challenge_present + created_at + public_repos. The gist must be a
SECRET gist published by the claimed login, containing exactly
`matchroot-bind:<address>`. One login binds to one address only;
one address binds once only. The deterministic duplicate checks run
before consensus, so the duplicate cases need no valid gist.

## Evidence flow (42 txs + deploy)

### A. Round creation (1)
| Label | Call | Expected |
|-------|------|----------|
| round-create | CREATOR create_round() with 100 GEN | ok, phase APPLICATION, pool 100 GEN |

### B. Project applications (6: 5 ok + 1 error)
| Label | Call | Expected |
|-------|------|----------|
| app-curl | APPL apply_project(curl, …, payout PCURL) | ok, project 1, APPLIED |
| app-openssl | APPL apply_project(OpenSSL, …, payout POSSL) | ok, project 2, APPLIED |
| app-yq | APPL apply_project(yq, …, payout PYQ) | ok, project 3, APPLIED |
| app-fake | APPL apply_project(FakeRepo, …, payout PCPY) | ok, project 4, APPLIED |
| app-cpython | APPL apply_project(CPython, …, payout PCPY) | ok, project 5, APPLIED |
| app-dup | APPL apply_project(curl again) | DUPLICATE_PROJECT (0 GEN) |

### C. Eligibility judgments (5) + rejudge (1)
| Label | Call | Expected |
|-------|------|----------|
| judge-curl | OUT judge_eligibility(1) | ok, ELIGIBLE |
| judge-openssl | OUT judge_eligibility(2) | ok, ELIGIBLE |
| judge-yq | OUT judge_eligibility(3) | ok, ELIGIBLE |
| judge-fake | OUT judge_eligibility(4) | ok, INELIGIBLE |
| judge-cpython | OUT judge_eligibility(5) | ok, INELIGIBLE |
| rejudge-cpython | APPL rejudge_eligibility(5, corrected claim) | ok, ELIGIBLE (verdict flips) |

### D. Donor bindings (2 ok + 6 errors)
| Label | Call | Expected |
|-------|------|----------|
| bind-d1 | D1 bind_donor(D1, halihalibt, G1) | ok, ESTABLISHED |
| bind-d2 | D2 bind_donor(D2, gqzy1, G2) | ok, ESTABLISHED |
| bind-d3-zuotu | D3 bind_donor(D3, zuotu295, G3) | NOT_ESTABLISHED |
| bind-wrong-challenge | D4 bind_donor(D4, zuotu295, G6) | CHALLENGE_MISMATCH |
| bind-gist-404 | D5 bind_donor(D5, gqzy999, 000…0) | GIST_NOT_FOUND |
| bind-owner-mismatch | D5 bind_donor(D5, gqzy999, G1) | GIST_OWNER_MISMATCH |
| bind-duplicate-login | D4 bind_donor(D4, halihalibt, 000…0) | DUPLICATE_BINDING |
| bind-already-bound | D1 bind_donor(D1, gqzy1, 000…0) | ALREADY_BOUND |

### E. Open funding (1)
| Label | Call | Expected |
|-------|------|----------|
| open-funding | CREATOR open_funding() | ok, phase FUNDING |

### F. Contribute negatives (3, 0 GEN sent on each failed payable)
| Label | Call | Expected error |
|-------|------|----------------|
| neg-contribute-unbound | OUT contribute(1) with 0 GEN | NOT_BOUND |
| neg-contribute-ineligible | D1 contribute(4) with 0 GEN | PROJECT_NOT_ELIGIBLE |
| neg-contribute-zero | D1 contribute(1) with 0 GEN | AMOUNT |

### G. Contributions (5)
| Label | Call | Expected |
|-------|------|----------|
| c1-d1-curl | D1 contribute(1) with 10 GEN | ok, D1→curl total 10 GEN |
| c2-d1-openssl | D1 contribute(2) with 10 GEN | ok, D1→openssl total 10 GEN |
| c3-d1-yq | D1 contribute(3) with 20 GEN | ok, D1→yq total 20 GEN |
| c4-d2-curl | D2 contribute(1) with 10 GEN | ok, D2→curl total 10 GEN |
| c5-d2-openssl | D2 contribute(2) with 10 GEN | ok, D2→openssl total 10 GEN |

### H. Pre-close negatives (3)
| Label | Call | Expected error |
|-------|------|----------------|
| neg-distribute-early | OUT distribute() | ROUND_NOT_CLOSED |
| neg-close-stranger | OUT close_round() | NOT_CREATOR |
| neg-withdraw-early | PCURL withdraw() | NO_CREDIT |

### I. Close (1) + contribute-after-close negative (1)
| Label | Call | Expected |
|-------|------|----------|
| close-round | CREATOR close_round() | ok, phase CLOSED |
| neg-contribute-after-close | D1 contribute(1) with 0 GEN | ROUND_NOT_FUNDING |

### J. Distribution (1) + double-distribute negative (1)
| Label | Call | Expected |
|-------|------|----------|
| distribute | OUT distribute() | ok, matches curl 19999999995740302400, openssl 19999999995740302400, yq 0, cpython 0; unspent 60000000008519395200; phase DISTRIBUTED |
| neg-distribute-twice | OUT distribute() | ALREADY_DISTRIBUTED |

### K. Withdrawals (4) + double-withdraw negative (1)
| Label | Call | Expected |
|-------|------|----------|
| w-curl | PCURL withdraw() | ok, 39999999995740302400 wei |
| w-openssl | POSSL withdraw() | ok, 39999999995740302400 wei |
| w-yq | PYQ withdraw() | ok, 20000000000000000000 wei |
| w-creator | CREATOR withdraw() | ok, 60000000008519395200 wei (unspent pool) |
| neg-double-withdraw | CREATOR withdraw() again | NO_CREDIT |

## Final readback (exact)

- Round: phase DISTRIBUTED, distributed true, total_match_wei
  39999999991480604800, total_direct_wei 60000000000000000000,
  project_count 5, donor_count 2.
- Project 1 curl: ELIGIBLE, direct 20000000000000000000,
  match 19999999995740302400, distributed true.
- Project 2 OpenSSL: ELIGIBLE, direct 20000000000000000000,
  match 19999999995740302400, distributed true.
- Project 3 yq: ELIGIBLE, direct 20000000000000000000, match 0,
  distributed true.
- Project 4 FakeRepo: INELIGIBLE, direct 0, match 0.
- Project 5 CPython: ELIGIBLE (via rejudge), direct 0, match 0,
  distributed true.
- Donors: D1 halihalibt ESTABLISHED, D2 gqzy1 ESTABLISHED. No other
  bindings exist (all other bind attempts failed).
- Contributions: D1→curl 10 GEN, D1→openssl 10 GEN, D1→yq 20 GEN,
  D2→curl 10 GEN, D2→openssl 10 GEN. Nothing else.
- Credits after all withdrawals: every temp account 0.
- Counts: phase DISTRIBUTED, project_count 5, donor_count 2,
  total_received_wei 160 GEN, total_withdrawn_wei 160 GEN,
  contract_balance_wei 0, pool_wei 100 GEN, total_direct_wei
  60 GEN, total_match_wei 39999999991480604800 wei.
- Ledger: 160 GEN in (pool 100 + donations 60) = 160 GEN out
  (projects 40 + 40 + 20 + creator 60), balance 0, zero stranded
  value — every failed-payable negative sent 0 GEN by design.

## Honest note on failed payables

A failed payable call keeps its value in the contract (platform
behavior on Studionet). Every failed-payable negative in this run
(neg-contribute-unbound, neg-contribute-ineligible,
neg-contribute-zero, neg-contribute-after-close) sends 0 GEN, so
no value can be stranded. The verify script re-reads the full
state before and after each negative and fails the run if
anything changed.

## Not covered by on-chain evidence

- Match scaling (raw matches > pool): the branch is implemented
  in the contract and covered by mock tests — but this round's raw
  matches (40 GEN) fit inside the pool (100 GEN), so scaling never
  triggers on-chain. Documented as a known gap, not hidden.
- PROFILE_NOT_FOUND (GitHub user API down): defensive branch,
  fail-closed; unreachable in this run because every gist-owning
  login has a live profile. Not triggered on-chain.
- Gist deleted after binding: binding is recorded on-chain at
  bind time; a later deletion does not unbind. Not tested
  on-chain (deleting a demo gist would destroy the anchor for
  re-verification).
- The established rule is sybil friction, not proof of personhood:
  one human can own several old GitHub accounts. It raises the
  cost of a sybil attack; it does not eliminate it.
- A project judged INELIGIBLE can only return through the
  one-time rejudge with a corrected claim; there is no appeal
  after that. The round is single-shot by design.
- The payout addresses in this demo round are evidence-run temp
  accounts, not the real projects' treasuries: the round
  demonstrates the mechanism on real public data; it does not
  actually fund curl, OpenSSL or yq. The README says so.
