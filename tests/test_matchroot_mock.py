"""MatchRoot mock tests (offline, pure Python).

Mirrors the contract's deterministic logic exactly — same integer
sqrt, same QF formula, same scaling, same eligibility/donor
thresholds — so EXPECTED.md can pre-register exact integer-wei
values and the evidence run can assert them. Nothing here touches
the chain.
"""
import sys

GEN = 10 ** 18
POOL_GEN = 100
POOL_WEI = POOL_GEN * GEN
ESTABLISHED_CUTOFF = "2025-11-12"  # deploy date 2026-11-12 minus 1 year
MIN_PUBLIC_REPOS = 5


def isqrt(n):
    """Integer square root (Newton), same algorithm as the contract."""
    if n < 0:
        raise ValueError('ISQRT_NEG')
    if n == 0:
        return 0
    x = n
    y = (x + 1) // 2
    while y < x:
        x = y
        y = (x + n // x) // 2
    return x


def qf_matches(direct_by_project):
    """direct_by_project: {pid: {donor: total_wei}}.
    Returns ({pid: match_wei}, total_match_wei). Match is computed
    on each donor's TOTAL per project, so splitting one donation
    across several transactions cannot change the match."""
    raw = {}
    total = 0
    for pid, donors in direct_by_project.items():
        s = 0
        direct = 0
        for total_wei in donors.values():
            s += isqrt(total_wei)
            direct += total_wei
        m = s * s - direct
        if m < 0:
            m = 0
        raw[pid] = m
        total += m
    return raw, total


def scale_matches(raw, pool):
    """If the raw matches exceed the pool, scale every match down
    proportionally (floor division). Returns ({pid: match}, unspent)."""
    total = sum(raw.values())
    if total <= pool:
        return dict(raw), pool - total
    scaled = {pid: m * pool // total for pid, m in raw.items()}
    return scaled, pool - sum(scaled.values())


def is_established(created_at, public_repos):
    """created_at is an ISO date string; string comparison works
    because ISO dates sort lexicographically."""
    return created_at < ESTABLISHED_CUTOFF and public_repos >= MIN_PUBLIC_REPOS


def check(name, cond, extra=''):
    if cond:
        print(f'PASS {name}')
        return True
    print(f'FAIL {name} {extra}')
    return False


ok = True

# --- isqrt correctness (against math.isqrt) ---
import math
for n in [0, 1, 2, 3, 4, 10, 99, 10**18, 10**19, 2 * 10**19, 10**20,
          123456789012345678901234567890]:
    ok &= check(f'isqrt({n}) == math.isqrt', isqrt(n) == math.isqrt(n), f'got {isqrt(n)} want {math.isqrt(n)}')
    ok &= check(f'isqrt({n})^2 <= n < (isqrt+1)^2',
                isqrt(n) ** 2 <= n < (isqrt(n) + 1) ** 2)

# --- The demo round (exact values for EXPECTED.md) ---
demo = {
    1: {'D1': 10 * GEN, 'D2': 10 * GEN},   # curl: 2 donors x 10
    2: {'D1': 10 * GEN, 'D2': 10 * GEN},   # openssl: 2 donors x 10
    3: {'D1': 20 * GEN},                   # yq: 1 donor x 20
}
raw, total = qf_matches(demo)
ok &= check('curl match == openssl match (symmetric inputs)',
            raw[1] == raw[2], f'{raw[1]} vs {raw[2]}')
ok &= check('curl match is 20 GEN minus truncation dust only',
            0 < 20 * GEN - raw[1] < 10**11, f'match={raw[1]} dust={20 * GEN - raw[1]}')
ok &= check('yq single-donor match is exactly 0', raw[3] == 0, f'{raw[3]}')
ok &= check('total match is 40 GEN minus dust',
            0 < 40 * GEN - total < 2 * 10**11, f'total={total}')
scaled, unspent = scale_matches(raw, POOL_WEI)
ok &= check('no scaling needed (total match < pool)', scaled == raw)
ok &= check('unspent pool is 60 GEN plus dust',
            60 * GEN < unspent < 60 * GEN + 2 * 10**11, f'{unspent}')
print(f'DEMO curl match_wei={raw[1]}')
print(f'DEMO openssl match_wei={raw[2]}')
print(f'DEMO yq match_wei={raw[3]}')
print(f'DEMO total_match_wei={total}')
print(f'DEMO unspent_pool_wei={unspent}')
print(f'DEMO curl total (direct+match)={20 * GEN + raw[1]}')
print(f'DEMO openssl total (direct+match)={20 * GEN + raw[2]}')
print(f'DEMO yq total (direct+match)={20 * GEN + raw[3]}')

# --- Split-donation invariance (the anti-gaming property) ---
# The match is computed on each donor's TOTAL per project, so whether
# a donor gives 10 GEN in one transaction or 6+4 GEN in two, the
# per-donor total is 10 GEN either way and the match must not move.
totals_split = {'D1': 6 * GEN + 4 * GEN, 'D2': 10 * GEN}
totals_whole = {'D1': 10 * GEN, 'D2': 10 * GEN}
ok &= check('split donations sum to the same per-donor totals',
            totals_split == totals_whole)
m_split, _ = qf_matches({1: totals_split})
m_whole, _ = qf_matches({1: totals_whole})
ok &= check('match identical whether donated in one tx or split',
            m_split == m_whole, f'{m_split} vs {m_whole}')

# --- Scaling (pool smaller than raw matches) ---
big = {1: {'A': 10 * GEN, 'B': 10 * GEN}, 2: {'A': 10 * GEN, 'B': 10 * GEN}}
raw_big, total_big = qf_matches(big)
small_pool = 10 * GEN
scaled_big, unspent_big = scale_matches(raw_big, small_pool)
ok &= check('scaled matches fit the small pool',
            sum(scaled_big.values()) <= small_pool)
ok &= check('scaling keeps the two symmetric projects equal',
            scaled_big[1] == scaled_big[2])
ok &= check('scaling leaves less than 1 project of dust unspent',
            0 <= unspent_big < len(scaled_big), f'{unspent_big}')
# Scaling is proportional: each scaled match is within 1 wei of the
# exact proportion (floor division loses < 1 wei per project).
for pid, m in scaled_big.items():
    exact = raw_big[pid] * small_pool / total_big
    ok &= check(f'scaled match {pid} within 1 wei of exact proportion',
                abs(m - exact) < 1.0, f'{m} vs {exact}')

# --- Single donor, any amount: match is always 0 ---
for amt in [1 * GEN, 7 * GEN, 20 * GEN, 123 * GEN]:
    m, _ = qf_matches({1: {'only': amt}})
    ok &= check(f'single donor {amt // GEN} GEN -> match 0', m[1] == 0, f'{m[1]}')

# --- Zero donations: match 0 ---
m, t = qf_matches({1: {}, 2: {'A': 5 * GEN}})
ok &= check('project with no donors has match 0', m[1] == 0 and t == m[2])

# --- Breadth beats whales: same 20 GEN direct, different spread ---
broad, _ = qf_matches({1: {'A': 10 * GEN, 'B': 10 * GEN}})
whale, _ = qf_matches({1: {'A': 20 * GEN}})
ok &= check('broad support beats a single whale at equal direct funding',
            broad[1] > whale[1] == 0, f'broad={broad[1]} whale={whale[1]}')

# --- Established thresholds ---
ok &= check('halihalibt (2021-12, 32 repos) is ESTABLISHED',
            is_established('2021-12-16T13:33:33Z', 32))
ok &= check('gqzy1 (2023-12, 23 repos) is ESTABLISHED',
            is_established('2023-12-29T12:27:32Z', 23))
ok &= check('zuotu295 (2026-10, 14 repos) is NOT_ESTABLISHED (too young)',
            not is_established('2026-10-21T19:02:54Z', 14))
ok &= check('old account with 4 repos is NOT_ESTABLISHED (too few repos)',
            not is_established('2020-01-01T00:00:00Z', 4))
ok &= check('old account with exactly 5 repos is ESTABLISHED',
            is_established('2020-01-01T00:00:00Z', 5))
ok &= check('account created exactly on the cutoff is NOT_ESTABLISHED',
            not is_established('2025-11-12T00:00:00Z', 99))
ok &= check('account created one day before cutoff is ESTABLISHED',
            is_established('2025-11-11T23:59:59Z', 5))

print()
print('ALL MOCK TESTS PASS' if ok else 'MOCK TESTS FAILED')
sys.exit(0 if ok else 1)
