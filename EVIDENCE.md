# MatchRoot — Evidence

All transactions below are on GenLayer Stable Studionet (chain 61999).
Every hash links to the Stable Studionet explorer. Re-verify live with
`node scripts/verify_evidence.mjs` (byte parity + every tx re-read +
final readback, exact BigInt comparisons).

- **Contract:** `0xeC1423fD916E4a0a8D568ae99509036a0De39c63` ([explorer](https://explorer-studio.genlayer.com/address/0xeC1423fD916E4a0a8D568ae99509036a0De39c63))
- **Deploy tx:** `0x9e61a35c1ad384b0cf98108f7169463cc3cd3d758762f9aad31a11df6d577db8` ([explorer](https://explorer-studio.genlayer.com/tx/0x9e61a35c1ad384b0cf98108f7169463cc3cd3d758762f9aad31a11df6d577db8))
- **Protocol:** `matchroot-1.1` · **Source SHA256:** `4af4487c5d4aa41810e141024a88cb8f0c5c150ec20f37393507eeee1229e16d` (30559 bytes, `contracts/matchroot.py`)
- **Evidence txs:** 42 + deploy = 43 total, all FINALIZED

## Ledger (exact, wei)

- Pool funded at creation: 100000000000000000000 wei (100 GEN)
- Donations: 60000000000000000000 wei (60 GEN)
- Total received: 160000000000000000000 wei (160 GEN)
- Total withdrawn: 160000000000000000000 wei (160 GEN)
- Contract balance: 0 wei
- Direct: curl 20000000000000000000, OpenSSL 20000000000000000000, yq 20000000000000000000 (60000000000000000000 total)
- Match: curl 19999999995740302400, OpenSSL 19999999995740302400, yq 0, CPython 0 (39999999991480604800 total)
- Unspent pool to creator: 60000000008519395200 wei
- Withdrawals: curl project 39999999995740302400, OpenSSL project 39999999995740302400, yq project 20000000000000000000, creator 60000000008519395200

## Transactions

| # | Label | Transaction | Result |
|---|---|---|---|
| 0 | deploy | [0x9e61a35c1ad384b0…](https://explorer-studio.genlayer.com/tx/0x9e61a35c1ad384b0cf98108f7169463cc3cd3d758762f9aad31a11df6d577db8) | FINALIZED, MAJORITY_AGREE, SUCCESS |
| 1 | round-create | [0x4922074465e93a7b…](https://explorer-studio.genlayer.com/tx/0x4922074465e93a7bc19b1c2bb30bbab6efb5b2ac594e17e1674a5d5af853a2f2) | FINALIZED, MAJORITY_AGREE, SUCCESS |
| 2 | app-curl | [0xfd83c23b3f2a607c…](https://explorer-studio.genlayer.com/tx/0xfd83c23b3f2a607cef5f71d0568ac6606c8d61e78084838361ec2b9e04489e2b) | FINALIZED, MAJORITY_AGREE, SUCCESS |
| 3 | app-openssl | [0x8c6299a24ebe7ae6…](https://explorer-studio.genlayer.com/tx/0x8c6299a24ebe7ae617909b7b78cfde05df08573504f7af05a284e1d07ea5b7e8) | FINALIZED, MAJORITY_AGREE, SUCCESS |
| 4 | app-yq | [0xd3830902aba1b0fb…](https://explorer-studio.genlayer.com/tx/0xd3830902aba1b0fb3eb7e4de5f01e38d67c13f340ffdd4b2bbd402944e2f726e) | FINALIZED, MAJORITY_AGREE, SUCCESS |
| 5 | app-fake | [0x3527a213818bac03…](https://explorer-studio.genlayer.com/tx/0x3527a213818bac03be2035a84a9c3dbfc7b3f10ae86d45f059f653960e45de98) | FINALIZED, MAJORITY_AGREE, SUCCESS |
| 6 | app-cpython | [0xebdf47bb512a09a0…](https://explorer-studio.genlayer.com/tx/0xebdf47bb512a09a0c72d6c8fccf9b205fc79fd198c28c9c46084cedac7a95d1e) | FINALIZED, MAJORITY_AGREE, SUCCESS |
| 7 | app-dup | [0x422b8fd5bb17e126…](https://explorer-studio.genlayer.com/tx/0x422b8fd5bb17e126b7c60ff3d907b1d18f4c8734452475eec53c3b19805cbb47) | FINALIZED, MAJORITY_AGREE, ERROR `DUPLICATE_PROJECT` |
| 8 | judge-curl | [0x649eb08f1169c63e…](https://explorer-studio.genlayer.com/tx/0x649eb08f1169c63e683cf1898708bdcf40a81273ddd0b43ca6afea2002e0b71b) | FINALIZED, MAJORITY_AGREE, SUCCESS |
| 9 | judge-openssl | [0x4a0650f2beb8bb49…](https://explorer-studio.genlayer.com/tx/0x4a0650f2beb8bb49af0ce527158ee42d9746404f00a7682097808cc951188547) | FINALIZED, MAJORITY_AGREE, SUCCESS |
| 10 | judge-yq | [0x17eff53c5762fca0…](https://explorer-studio.genlayer.com/tx/0x17eff53c5762fca0d36a0f09b6fa78ecd390575fef2bdf4576f5362ab9c7add2) | FINALIZED, MAJORITY_AGREE, SUCCESS |
| 11 | judge-fake | [0xd4cd207d08f80f8e…](https://explorer-studio.genlayer.com/tx/0xd4cd207d08f80f8ecd387aa828f27a18d8b36d45728295c02537a34c687d5d28) | FINALIZED, MAJORITY_AGREE, SUCCESS |
| 12 | judge-cpython | [0xedaa1a45cde15762…](https://explorer-studio.genlayer.com/tx/0xedaa1a45cde15762b479625868eb67013ea9c9efeeadfd59f63928cfff4c01dc) | FINALIZED, MAJORITY_AGREE, SUCCESS |
| 13 | rejudge-cpython | [0x4ef808c3c650184e…](https://explorer-studio.genlayer.com/tx/0x4ef808c3c650184ec277297e4993ac29f39845baaad0cf19a2f212ece3399590) | FINALIZED, MAJORITY_AGREE, SUCCESS |
| 14 | bind-d1 | [0xf1a3a65ca94bb709…](https://explorer-studio.genlayer.com/tx/0xf1a3a65ca94bb709ef29a5b7dc3529a45a41fcd2b493b37b710122bd022e9c94) | FINALIZED, MAJORITY_AGREE, SUCCESS |
| 15 | bind-d2 | [0xfb04abfa0bc2dfdb…](https://explorer-studio.genlayer.com/tx/0xfb04abfa0bc2dfdbcddfb53ab0167ea8f536d8d295244952c24bbe39190e0bc8) | FINALIZED, MAJORITY_AGREE, SUCCESS |
| 16 | bind-d3-zuotu | [0x997f83de36a74ddb…](https://explorer-studio.genlayer.com/tx/0x997f83de36a74ddb576847cb20fb109b44f1973bba9d6d9e721cc252cd21cfb0) | FINALIZED, MAJORITY_AGREE, ERROR `NOT_ESTABLISHED` |
| 17 | bind-wrong-challenge | [0xd736b6dd8a769380…](https://explorer-studio.genlayer.com/tx/0xd736b6dd8a7693802d1ea33943957c8e43cf763811e01390f3baaba3111cdee7) | FINALIZED, MAJORITY_AGREE, ERROR `CHALLENGE_MISMATCH` |
| 18 | bind-gist-404 | [0xdf8ba1dd83bd4513…](https://explorer-studio.genlayer.com/tx/0xdf8ba1dd83bd4513d1b7bb73cc0500cefd95f4f79290864892185440c7e51105) | FINALIZED, MAJORITY_AGREE, ERROR `GIST_NOT_FOUND` |
| 19 | bind-owner-mismatch | [0xd70a82c87665fbea…](https://explorer-studio.genlayer.com/tx/0xd70a82c87665fbeabfceea17ba811007c29a8d43d2f5ea8c44e78dd5be51a2df) | FINALIZED, MAJORITY_AGREE, ERROR `GIST_OWNER_MISMATCH` |
| 20 | bind-duplicate-login | [0xf7e1d3ce77c6a12a…](https://explorer-studio.genlayer.com/tx/0xf7e1d3ce77c6a12acda1c3970472e5a0ea8455f399460e6e4498c4293bddf249) | FINALIZED, MAJORITY_AGREE, ERROR `DUPLICATE_BINDING` |
| 21 | bind-already-bound | [0xa3b77f54e0b59e3f…](https://explorer-studio.genlayer.com/tx/0xa3b77f54e0b59e3f397ab3e4cf6f80d5066d895c0e6ee98af8362eabf2ac1a08) | FINALIZED, MAJORITY_AGREE, ERROR `ALREADY_BOUND` |
| 22 | open-funding | [0xeccd8a62d542663d…](https://explorer-studio.genlayer.com/tx/0xeccd8a62d542663d731f2644f5d7f769e517c3c55c89a47317e69a3e04c32fb9) | FINALIZED, MAJORITY_AGREE, SUCCESS |
| 23 | neg-contribute-unbound | [0x3f1d3137500497ea…](https://explorer-studio.genlayer.com/tx/0x3f1d3137500497ea399c204776466a51a47a869db4324b4490d10f9f3fc20ff6) | FINALIZED, MAJORITY_AGREE, ERROR `NOT_BOUND` |
| 24 | neg-contribute-ineligible | [0x404a6d2dc2f9dcc7…](https://explorer-studio.genlayer.com/tx/0x404a6d2dc2f9dcc74010a5aa21720b67253b81ad9f0d0562e141eddd84b4ccde) | FINALIZED, MAJORITY_AGREE, ERROR `PROJECT_NOT_ELIGIBLE` |
| 25 | neg-contribute-zero | [0xaf9a529e14f32064…](https://explorer-studio.genlayer.com/tx/0xaf9a529e14f32064f26cb94ff5e53a9fbf8a98e56885be31b39e4fbb43c36d40) | FINALIZED, MAJORITY_AGREE, ERROR `AMOUNT` |
| 26 | c1-d1-curl | [0x0f9830f1cd124f1c…](https://explorer-studio.genlayer.com/tx/0x0f9830f1cd124f1cda8e250c84ca8cea63a5004da8b0a38c3e3c2d440ba3cac1) | FINALIZED, MAJORITY_AGREE, SUCCESS |
| 27 | c2-d1-openssl | [0x9eb198c4f39fc2d6…](https://explorer-studio.genlayer.com/tx/0x9eb198c4f39fc2d628c6427162fb2b4bd98bb9808be3b8e55d275bccbe5df3cd) | FINALIZED, MAJORITY_AGREE, SUCCESS |
| 28 | c3-d1-yq | [0x5c844d52ac57158d…](https://explorer-studio.genlayer.com/tx/0x5c844d52ac57158d6ef4cb7af4d8da21094ed97087bb8d438e19b1ef6ef3dac3) | FINALIZED, MAJORITY_AGREE, SUCCESS |
| 29 | c4-d2-curl | [0x4b386a7a15f67354…](https://explorer-studio.genlayer.com/tx/0x4b386a7a15f67354e99ee0c0536357251b29586b1ccd1e7a9a81b558ae6ac19a) | FINALIZED, MAJORITY_AGREE, SUCCESS |
| 30 | c5-d2-openssl | [0x2e05e46cb7e0715a…](https://explorer-studio.genlayer.com/tx/0x2e05e46cb7e0715ab2cd348477428c3907d1238e1dc72b3c648cb6be68e69d5e) | FINALIZED, MAJORITY_AGREE, SUCCESS |
| 31 | neg-distribute-early | [0xbabe9bebbdd9a47a…](https://explorer-studio.genlayer.com/tx/0xbabe9bebbdd9a47a50dfe802a32f15dc0eeff6ffe9f2587cc6e8ea06f09bf080) | FINALIZED, MAJORITY_AGREE, ERROR `ROUND_NOT_CLOSED` |
| 32 | neg-close-stranger | [0x3c08ddc2370da614…](https://explorer-studio.genlayer.com/tx/0x3c08ddc2370da6144ce2cd2e6299df31dcf74b333ac37472e9cfad4cb15a428d) | FINALIZED, MAJORITY_AGREE, ERROR `NOT_CREATOR` |
| 33 | neg-withdraw-early | [0x95181129642177f2…](https://explorer-studio.genlayer.com/tx/0x95181129642177f265e3407f57facb508283e10a1dfc1e3b8bf7e6116aa30af2) | FINALIZED, MAJORITY_AGREE, ERROR `NO_CREDIT` |
| 34 | close-round | [0x69e1fb9d8793e6cf…](https://explorer-studio.genlayer.com/tx/0x69e1fb9d8793e6cf04271f44f38ac91c47f3d7e28a5be0004558058e6f1935b4) | FINALIZED, MAJORITY_AGREE, SUCCESS |
| 35 | neg-contribute-after-close | [0x7a5d88b1671559e5…](https://explorer-studio.genlayer.com/tx/0x7a5d88b1671559e5877c5dce61d78b2f661ade2bcc1570df754c696e5dc33b7e) | FINALIZED, MAJORITY_AGREE, ERROR `ROUND_NOT_FUNDING` |
| 36 | distribute | [0x69641ff6bb5a2942…](https://explorer-studio.genlayer.com/tx/0x69641ff6bb5a2942bb5186b67740f977d647c24ce2c042b2daf9bf4111c91b9b) | FINALIZED, MAJORITY_AGREE, SUCCESS |
| 37 | neg-distribute-twice | [0x750a90dd46a7997a…](https://explorer-studio.genlayer.com/tx/0x750a90dd46a7997ade0853609ec40e0723d96d8c2e10e425139e09b3716490df) | FINALIZED, MAJORITY_AGREE, ERROR `ALREADY_DISTRIBUTED` |
| 38 | w-curl | [0xa91e1b411a06880c…](https://explorer-studio.genlayer.com/tx/0xa91e1b411a06880ce70037c82f7e39d5e735038eeb5fc104453f98acf229dd7d) | FINALIZED, MAJORITY_AGREE, SUCCESS |
| 39 | w-openssl | [0x3e7b6192867d8c65…](https://explorer-studio.genlayer.com/tx/0x3e7b6192867d8c650e2d149471944cc5ca14009292b7666b4beb6e95974ff7aa) | FINALIZED, MAJORITY_AGREE, SUCCESS |
| 40 | w-yq | [0x16773fd9fd56f692…](https://explorer-studio.genlayer.com/tx/0x16773fd9fd56f69263ab409253154df822426e0d849f5069b4a919e3adbe72bf) | FINALIZED, MAJORITY_AGREE, SUCCESS |
| 41 | w-creator | [0x4b9dd85679ccd33c…](https://explorer-studio.genlayer.com/tx/0x4b9dd85679ccd33c6a140ba41418a38ac15302d15a18293f9a4dcef6dd08e0ca) | FINALIZED, MAJORITY_AGREE, SUCCESS |
| 42 | neg-double-withdraw | [0xb8fd8fe545142e72…](https://explorer-studio.genlayer.com/tx/0xb8fd8fe545142e72d6ef9d63b083015d425fc5f4c4f242f93b58a08f115a748d) | FINALIZED, MAJORITY_AGREE, ERROR `NO_CREDIT` |

## Final readback (latest-final, exact)

- Round: phase DISTRIBUTED, distributed true, total_direct_wei 60000000000000000000, total_match_wei 39999999991480604800, project_count 5, donor_count 2
- curl: ELIGIBLE, direct 20000000000000000000, match 19999999995740302400, distributed
- OpenSSL: ELIGIBLE, direct 20000000000000000000, match 19999999995740302400, distributed
- yq: ELIGIBLE, direct 20000000000000000000, match 0, distributed
- FakeRepo: INELIGIBLE, direct 0, match 0
- CPython: ELIGIBLE (via rejudge), direct 0, match 0, distributed
- Donors: halihalibt + gqzy1, both ESTABLISHED; zuotu295 NOT_ESTABLISHED on-chain
- All 12 temp-account credits are 0 after withdrawals; contract balance 0

## Notes

- No MAJORITY_DISAGREE retries were needed in this run: every consensus call agreed on the first attempt.
- Negative transactions send 0 GEN (a failed payable keeps its value in the contract on Studionet), so no value was stranded by any negative test.
- The v1.0 contract (`0x12Eb45B757119f832BEC89a032aB819A3AF25493`) was abandoned before submission: its `distribute()` checked the phase before the distributed flag, making `ALREADY_DISTRIBUTED` unreachable. v1.1 checks the distributed flag first. The v1.0 evidence (36 txs) is archived under `evidence/v1/`.
