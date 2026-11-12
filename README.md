# MatchRoot — Quadratic funding for public goods

MatchRoot is one quadratic-funding (QF) round on GenLayer Studionet. A round
creator funds a 100 GEN matching pool at creation. Real public-good projects
apply; independent validators check each project's existence on GitHub;
donors bind a GitHub identity with a secret gist; established donors give
GEN; and a deterministic integer square-root rule splits the pool. Broad
support beats whale money.

**Live site:** https://chuanqili77.github.io/matchroot-genlayer/
**Contract:** `0xeC1423fD916E4a0a8D568ae99509036a0De39c63` ([Studionet explorer](https://explorer-studio.genlayer.com/address/0xeC1423fD916E4a0a8D568ae99509036a0De39c63))
**Protocol:** `matchroot-1.1` · **Network:** GenLayer Stable Studionet (chain 61999) · **Test GEN only — no cash value.**

## How it works

1. **Apply.** A project applies with a name, GitHub repo URL, homepage URL,
   purpose statement, a verbatim README line, and a payout address.
2. **Judge.** `judge_eligibility` is a consensus method: validators fetch the
   GitHub API repo page and the homepage and must agree exactly on
   `(repo_exists, readme_match, homepage_ok)`. All three true → ELIGIBLE.
   An applicant judged INELIGIBLE gets one rejudge with a corrected claim —
   the verdict can flip.
3. **Bind.** `bind_donor` is a consensus method: validators fetch the donor's
   SECRET gist (it must contain `matchroot-bind:<address>`, owned by the
   same GitHub login) and the GitHub profile, agreeing exactly on
   `(gist_ok, owner_match, challenge_present, created_at, public_repos)`.
   Deterministic code then marks the donor ESTABLISHED only if the account
   is at least 1 year old AND has at least 5 public repos. One login binds
   to one address; one address binds once. The established rule is a sybil
   friction, not proof of personhood.
4. **Donate.** During FUNDING, established donors give GEN to ELIGIBLE
   projects. Contributions accumulate per (donor, project), so splitting a
   donation into many small gifts cannot inflate the match.
5. **Distribute.** After the creator closes the round, anyone can call
   `distribute` (permissionless). Deterministic integer-sqrt QF in wei:

   `match_i = (Σ √each donor's total)² − Σ totals`, floored at 0.

   If total raw matches exceed the pool, all matches scale down
   proportionally. Projects receive direct + match as pull-payment credits;
   the creator receives the unspent pool as credit. `withdraw` pays out.

Phases change only by explicit calls — `create_round → apply/judge →
open_funding → contribute → close_round → distribute → withdraw`.
There is no clock on Studionet.

## The demo round (real projects, real GitHub data)

| Project | Repo | Direct | Match | Total |
|---|---|---|---|---|
| curl | github.com/curl/curl | 20 GEN | 20 GEN | 40 GEN |
| OpenSSL | github.com/openssl/openssl | 20 GEN | 20 GEN | 40 GEN |
| yq | github.com/mikefarah/yq | 20 GEN | 0 GEN | 20 GEN |
| CPython | github.com/python/cpython | 0 GEN | 0 GEN | 0 GEN |

Two established donors (halihalibt, gqzy1) gave 10 GEN each to curl and
OpenSSL; halihalibt gave 20 GEN to yq alone. Two donors of 10 GEN each
produce a ~20 GEN match; one donor of 20 GEN produces a 0 match — breadth
beats whales, on-chain. Exact matches: curl and OpenSSL
19999999995740302400 wei each (40 GEN minus 8519395200 wei integer-sqrt
dust in total); yq 0. CPython was first judged INELIGIBLE on a wrong
README claim, then rejudged ELIGIBLE on the corrected claim (the Gate 3
second look). Total match 39999999991480604800 wei ≤ pool 100 GEN, so no
scaling; the creator withdrew the unspent 60000000008519395200 wei.
Ledger: **160 GEN in (pool 100 + donations 60) = 160 GEN out (projects
40 + 40 + 20 + creator 60), balance 0 — exact to the wei.**

A third donor (zuotu295, account created October 2026) binds on-chain and
is rejected NOT_ESTABLISHED — a real negative, not a mock. Further
negatives on-chain: wrong gist challenge (CHALLENGE_MISMATCH), gist owner
mismatch, nonexistent login, unbound donor contributing, contributing to an
ineligible project, contributing after close, distributing before close,
distributing twice, closing by a non-creator, withdrawing before
distribution, a fake-repo application (INELIGIBLE), and a duplicate repo
application (DUPLICATE_PROJECT). Failed payable calls send 0 GEN — a failed
payable keeps its value in the contract on Studionet, so no value is ever
stranded by a negative test.

## Verify it yourself

```bash
npm test                          # QF math incl. split-donation invariance, scaling, thresholds
node scripts/byte_parity.mjs      # deployed code == repo source, byte for byte
node scripts/verify_evidence.mjs  # re-reads every evidence tx live + final readback
```

See [REVIEWER.md](REVIEWER.md) for the full reviewer checklist and
[EVIDENCE.md](EVIDENCE.md) for the evidence table with explorer links.
[EXPECTED.md](EXPECTED.md) pre-registers every expected value before the
evidence run.

## Website

Vite + React, served from `docs/` via GitHub Pages. English by default
(never auto-switches from browser language); Chinese is an opt-in toggle;
on-chain values are always English. Any injected EVM wallet connects and
reads; writes fall back to a clearly labelled in-browser temporary test
account, with a key-backup step before any payable write. All displayed
values come from a latest-final readback — before the first FINALIZED
readback the page shows dashes and UNCONFIRMED, and export is disabled.
The bundle is versioned (`?v=<sha>`) so a stale bundle cannot be served.

## Known limits

- One round per contract, one 100 GEN pool fixed at creation. A second
  round needs a new deployment.
- The established rule raises the cost of a sybil attack; it does not
  eliminate it — one human can own several old GitHub accounts.
- A project judged INELIGIBLE can only return through its one rejudge.
- Payout addresses are the evidence run's temporary accounts, not the real
  projects' treasuries: this round demonstrates the mechanism on real
  public data; it does not actually fund curl, OpenSSL, or yq.
- The match is computed from per-donor totals in wei with integer square
  roots, so sub-wei dust (a few billion wei on a 40 GEN match) stays in
  the unspent pool and returns to the creator.
