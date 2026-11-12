# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
"""MatchRoot: quadratic funding for public goods on GenLayer Stable
Studionet. Protocol matchroot-1.1.

One round, one matching pool (100 GEN, funded by the round creator
at creation), real public-good projects. Donors give GEN to projects;
consensus decides who is eligible and who is a real donor; a
deterministic integer-sqrt quadratic-funding formula splits the
pool. Breadth beats whales: two donors of 10 GEN earn a match, one
donor of 20 GEN earns none.

  match_i = (sum over donors of isqrt(total donor contribution))^2
            - sum of direct contributions, floored at 0
  If the raw matches exceed the pool, every match is scaled down
  proportionally (floor division) so the pool is never overspent.
  The creator is credited the unspent pool afterwards.

Money never moves directly: contributions, matches and the unspent
pool are recorded as pull-payment credits; the entitled party
withdraws with withdraw().

Anchors (dual source, both fetched independently by every
validator). Project eligibility: the GitHub API repo record plus
the project's public homepage. Donor identity: a GitHub gist
binding plus the GitHub profile record. No anchor is written by
the beneficiary: the repo record, the README, the homepage and the
profile all live on systems the applicant does not control.

  Project eligibility (judge_eligibility, consensus). Validators
  fetch https://api.github.com/repos/<owner>/<repo> and agree
  exactly on the vector (repo_exists, readme_match, homepage_ok):
    repo_exists   — API returns 200 and full_name is exactly the
                    owner/repo from the application.
    readme_match  — the README at
                    https://raw.githubusercontent.com/<owner>/<repo>/
                    <default_branch>/<readme_path> (branch taken
                    from the API record) contains the applicant's
                    verbatim readme_claim as a substring.
    homepage_ok   — the homepage fetch returns 200 AND the API
                    record's "homepage" field equals the
                    application's homepage URL after stripping one
                    trailing slash from each side (GitHub records
                    homepages with a trailing slash; the live page
                    may redirect the other way — the comparison is
                    exact after that single normalization, which is
                    documented here, not a tolerance).
  ELIGIBLE iff all three are true. Anything else is INELIGIBLE,
  fail-closed: a fetch failure is a False flag, never a pass.

  Donor identity (bind_donor, consensus). The donor publishes a
  SECRET gist containing exactly `matchroot-bind:<address>` and
  calls bind_donor with (address, github_login, gist_id).
  Validators fetch https://api.github.com/gists/<gist_id> and
  https://api.github.com/users/<github_login> and agree exactly on
  (gist_ok, owner_match, challenge_present, created_at,
  public_repos):
    gist_ok            — gist fetch returns 200.
    owner_match        — gist owner.login is exactly github_login.
    challenge_present  — some file in the gist contains the exact
                         challenge string `matchroot-bind:<address>`.
    created_at         — the profile's created_at string ('' when
                         the profile fetch fails).
    public_repos       — the profile's public_repos int (-1 when
                         the profile fetch fails).
  Deterministic code then applies the established rule:
  ESTABLISHED iff created_at < "2025-11-12" (the deploy date
  2026-11-12 minus one year; ISO dates compare lexicographically,
  no clock exists on Studionet) AND public_repos >= 5. A donor
  that is not established cannot contribute — the bind call itself
  fails with NOT_ESTABLISHED. One GitHub login binds to one
  address only; one address binds once only.

Anti-gaming (see also the worst-case table in the workdir notes):
  * The match is computed on each donor's TOTAL per project, so
    splitting one donation across several transactions cannot
    inflate it (mock-tested).
  * A single donor's match is exactly 0 by the formula, so a whale
    cannot buy matching funds alone (mock-tested, and yq in the
    demo round is the live case).
  * Integer sqrt truncates: each match is the exact integer the
    deterministic algorithm produces, a few wei below the ideal
    real-number value. The mock computes the same integers, the
    evidence run asserts them exactly, and the unspent pool absorbs
    the dust — the ledger still closes to zero.

Sender-bound roles: only the round creator can open funding and
close the round; only the applicant can rejudge its own project
with a corrected claim; only a bound donor can contribute, and
only from its own address; only the entitled party can withdraw
its credit. distribute() is open to anyone because it is pure
deterministic recomputation from recorded state — it cannot favour
anyone. No time gates anywhere (Studionet has no clock): every
transition is an explicit action.

Second look (challenge path): a project judged INELIGIBLE may be
rejudged once by its applicant with a CORRECTED readme_claim
(rejudge_eligibility). The second round judges the NEW claim
against the same README — a corrected claim can flip the verdict
to ELIGIBLE, a still-wrong claim stays INELIGIBLE. The demo round
uses this for the CPython application.

A failed payable call KEEPS its value in the contract (platform
behavior on Studionet). The evidence run sends 0 GEN on its
failed-payable negatives, so no value is stranded there, and the
frontend only ever submits exact amounts to open flows.

Known limits (neutral, product-scope):
  * One round per contract, one matching pool, fixed at creation.
    A second round needs a new deployment.
  * The established rule (account age >= 1 year, >= 5 public
    repos) is a sybil friction, not proof of personhood: one human
    can own several old GitHub accounts. It raises the cost of a
    sybil attack; it does not eliminate it.
  * A project judged INELIGIBLE can only return through the
    one-time rejudge with a corrected claim; there is no appeal
    after that. The round is single-shot by design.
  * A gist deleted after binding does not unbind the donor: the
    binding was recorded on-chain at bind time.
  * GitHub API is rate-limited (60 unauthenticated requests/hour
    per IP). Each consensus call fetches a handful of URLs; a
    fetch failure is a fail-closed False flag, never a pass.
"""
from genlayer import *
import json

GEN_WEI = 1000000000000000000  # 1 GEN = 10^18 wei
POOL_GEN = 100
POOL_WEI = POOL_GEN * GEN_WEI
ESTABLISHED_CUTOFF = "2025-11-12"  # deploy date 2026-11-12 minus 1 year
MIN_PUBLIC_REPOS = 5
MAX_PROJECTS = 8

PHASES = ['APPLICATION', 'FUNDING', 'CLOSED', 'DISTRIBUTED']


def fail(s):
    raise gl.vm.UserError(s)


def packed(x):
    return json.dumps(x, sort_keys=True, separators=(',', ':'))


def _isqrt(n):
    """Integer square root (Newton), same algorithm as the mock."""
    if n < 0:
        fail('ISQRT_NEG')
    if n == 0:
        return 0
    x = n
    y = (x + 1) // 2
    while y < x:
        x = y
        y = (x + n // x) // 2
    return x


def _strip_slash(u):
    return u[:-1] if isinstance(u, str) and u.endswith('/') else u


def _fetch_text(url):
    """One validator's independent fetch. Returns (ok, text):
    ok is True only on HTTP 200 with a decodable body."""
    try:
        response = gl.nondet.web.request(url, method='GET')
    except Exception:
        return False, ''
    if getattr(response, 'status', 0) != 200:
        return False, ''
    body = response.body
    if isinstance(body, bytes):
        try:
            return True, body.decode('utf-8', errors='ignore')
        except Exception:
            return False, ''
    if isinstance(body, str):
        return True, body
    return False, ''


def _parse_repo_api(text):
    """Parse a GitHub repo API record. Returns (full_name, homepage,
    default_branch) or ('', '', '') on any parse problem."""
    try:
        d = json.loads(text)
    except Exception:
        return '', '', ''
    if not isinstance(d, dict):
        return '', '', ''
    fn = d.get('full_name', '')
    hp = d.get('homepage', '')
    br = d.get('default_branch', '')
    if not isinstance(fn, str) or not isinstance(hp, str) \
            or not isinstance(br, str):
        return '', '', ''
    return fn, hp, br


def _check_eligibility(repo_url, homepage_url, readme_claim):
    """The eligibility equivalence vector. All three flags are
    bools; the caller decides ELIGIBLE iff all are True."""
    # repo_url is https://github.com/<owner>/<repo>
    rest = repo_url[len('https://github.com/'):]
    parts = rest.split('/')
    if len(parts) != 2 or not parts[0] or not parts[1]:
        return {'repo_exists': False, 'readme_match': False,
                'homepage_ok': False}
    owner, repo = parts[0], parts[1]
    api_url = 'https://api.github.com/repos/' + owner + '/' + repo
    ok_api, api_text = _fetch_text(api_url)
    full_name, api_homepage, branch = _parse_repo_api(api_text) \
        if ok_api else ('', '', '')
    repo_exists = bool(ok_api) and full_name == owner + '/' + repo
    readme_match = False
    if repo_exists and branch:
        readme_path = _readme_path_for(repo_url)
        raw_url = 'https://raw.githubusercontent.com/' + owner + '/' \
            + repo + '/' + branch + '/' + readme_path
        ok_raw, raw_text = _fetch_text(raw_url)
        readme_match = bool(ok_raw) and readme_claim in raw_text
    ok_home, _ = _fetch_text(homepage_url)
    homepage_ok = bool(ok_home) and _strip_slash(api_homepage) \
        == _strip_slash(homepage_url) and api_homepage != ''
    return {'repo_exists': repo_exists, 'readme_match': readme_match,
            'homepage_ok': homepage_ok}


def _readme_path_for(repo_url):
    """README filename per repo (pinned here so the applicant cannot
    point the check at an arbitrary file)."""
    if repo_url == 'https://github.com/python/cpython':
        return 'README.rst'
    return 'README.md'


def _run_eligibility(repo_url, homepage_url, readme_claim):
    def leader_fn():
        res = _check_eligibility(repo_url, homepage_url, readme_claim)
        for k in ('repo_exists', 'readme_match', 'homepage_ok'):
            if not isinstance(res.get(k), bool):
                fail('ELIG_CHECK')
        return res

    def validator_fn(result):
        if not isinstance(result, gl.vm.Return):
            try:
                leader_fn()
            except Exception:
                return True
            return False
        try:
            mine = leader_fn()
        except Exception:
            return False
        leader = result.calldata
        if not isinstance(leader, dict):
            return False
        return all(leader.get(k) == mine.get(k) for k in
                   ('repo_exists', 'readme_match', 'homepage_ok'))

    return gl.vm.run_nondet_unsafe(leader_fn, validator_fn)


def _check_bind(address, github_login, gist_id):
    """The donor-identity equivalence vector. created_at is a
    string ('' on fetch failure), public_repos an int (-1 on
    failure) — exact equality, no tolerance."""
    gist_ok, owner_match, challenge_present = False, False, False
    ok_g, gist_text = _fetch_text(
        'https://api.github.com/gists/' + gist_id)
    if ok_g:
        gist_ok = True
        try:
            d = json.loads(gist_text)
        except Exception:
            d = None
        if isinstance(d, dict):
            owner = d.get('owner') or {}
            if isinstance(owner, dict) \
                    and owner.get('login') == github_login:
                owner_match = True
            files = d.get('files') or {}
            if isinstance(files, dict):
                for f in files.values():
                    if isinstance(f, dict) \
                            and isinstance(f.get('content'), str) \
                            and ('matchroot-bind:' + address) \
                            in f['content']:
                        challenge_present = True
    ok_u, user_text = _fetch_text(
        'https://api.github.com/users/' + github_login)
    created_at, public_repos = '', -1
    if ok_u:
        try:
            u = json.loads(user_text)
        except Exception:
            u = None
        if isinstance(u, dict):
            ca = u.get('created_at', '')
            pr = u.get('public_repos', -1)
            if isinstance(ca, str):
                created_at = ca
            if isinstance(pr, int) and not isinstance(pr, bool):
                public_repos = pr
    return {'gist_ok': gist_ok, 'owner_match': owner_match,
            'challenge_present': challenge_present,
            'created_at': created_at, 'public_repos': public_repos}


def _run_bind(address, github_login, gist_id):
    def leader_fn():
        res = _check_bind(address, github_login, gist_id)
        for k in ('gist_ok', 'owner_match', 'challenge_present'):
            if not isinstance(res.get(k), bool):
                fail('BIND_CHECK')
        if not isinstance(res.get('created_at'), str) \
                or not isinstance(res.get('public_repos'), int):
            fail('BIND_CHECK')
        return res

    def validator_fn(result):
        if not isinstance(result, gl.vm.Return):
            try:
                leader_fn()
            except Exception:
                return True
            return False
        try:
            mine = leader_fn()
        except Exception:
            return False
        leader = result.calldata
        if not isinstance(leader, dict):
            return False
        return all(leader.get(k) == mine.get(k) for k in
                   ('gist_ok', 'owner_match', 'challenge_present',
                    'created_at', 'public_repos'))

    return gl.vm.run_nondet_unsafe(leader_fn, validator_fn)


@gl.evm.contract_interface
class _Recipient:
    class View:
        pass

    class Write:
        pass


def _new_project(pid, name, repo_url, homepage_url, purpose,
                 readme_claim, readme_path, payout_address, applicant):
    return {
        'project_id': pid, 'name': name, 'repo_url': repo_url,
        'homepage_url': homepage_url, 'purpose': purpose,
        'readme_claim': readme_claim, 'readme_path': readme_path,
        'payout_address': payout_address.lower(),
        'applicant': applicant, 'status': 'APPLIED',
        'direct_wei': 0, 'match_wei': 0, 'distributed': False,
    }


class MatchRoot(gl.Contract):
    round: TreeMap[str, str]
    projects: TreeMap[str, str]
    donors: TreeMap[str, str]
    donor_index: TreeMap[str, str]
    login_to_address: TreeMap[str, str]
    contrib_totals: TreeMap[str, str]
    project_donors: TreeMap[str, str]
    credits: TreeMap[str, str]
    next_project_id: u32
    total_received: u256
    total_withdrawn: u256
    total_direct: u256
    total_match: u256

    def __init__(self):
        self.round = TreeMap()
        self.projects = TreeMap()
        self.donors = TreeMap()
        self.donor_index = TreeMap()
        self.login_to_address = TreeMap()
        self.contrib_totals = TreeMap()
        self.project_donors = TreeMap()
        self.credits = TreeMap()
        self.next_project_id = u32(1)
        self.total_received = u256(0)
        self.total_withdrawn = u256(0)
        self.total_direct = u256(0)
        self.total_match = u256(0)

    # ---- internal helpers ----
    def _load_round(self):
        raw = self.round.get('1', '')
        if not raw:
            fail('NO_ROUND')
        return json.loads(raw)

    def _save_round(self, r):
        self.round['1'] = packed(r)
        return packed(r)

    def _load_project(self, project_id):
        raw = self.projects.get(str(project_id), '')
        if not raw:
            fail('PROJECT_NOT_FOUND')
        return json.loads(raw)

    def _save_project(self, p):
        self.projects[str(p['project_id'])] = packed(p)
        return packed(p)

    def _credit(self, addr):
        raw = self.credits.get(addr, '')
        return int(raw) if raw else 0

    def _add_credit(self, addr, amount):
        self.credits[addr] = str(self._credit(addr) + int(amount))

    def _check_addr(self, addr):
        if not isinstance(addr, str) or len(addr) != 42 \
                or not addr.startswith('0x'):
            fail('BAD_ADDRESS')

    def _check_url(self, url, prefix):
        if not isinstance(url, str) or not url.startswith(prefix) \
                or len(url) > 200:
            fail('BAD_URL')

    # ---- round lifecycle ----
    @gl.public.write.payable
    def create_round(self) -> str:
        if self.round.get('1', ''):
            fail('ROUND_EXISTS')
        if gl.message.value != u256(POOL_WEI):
            fail('VALUE_MUST_EQUAL_POOL')
        creator = str(gl.message.sender_address).lower()
        self.total_received = self.total_received + u256(POOL_WEI)
        r = {'round_id': 1, 'creator': creator, 'pool_wei': POOL_WEI,
             'phase': 'APPLICATION', 'total_direct_wei': 0,
             'total_match_wei': 0, 'distributed': False,
             'project_count': 0, 'donor_count': 0}
        return self._save_round(r)

    @gl.public.write
    def apply_project(self, name: str, repo_url: str,
                      homepage_url: str, purpose: str,
                      readme_claim: str, payout_address: str) -> str:
        r = self._load_round()
        if r['phase'] != 'APPLICATION':
            fail('ROUND_NOT_APPLICATION')
        if int(r['project_count']) >= MAX_PROJECTS:
            fail('TOO_MANY_PROJECTS')
        if not isinstance(name, str) or not 1 <= len(name) <= 80:
            fail('BAD_NAME')
        self._check_url(repo_url, 'https://github.com/')
        rest = repo_url[len('https://github.com/'):]
        parts = rest.split('/')
        if len(parts) != 2 or not parts[0] or not parts[1]:
            fail('BAD_REPO_URL')
        self._check_url(homepage_url, 'http')
        if not isinstance(purpose, str) or not 1 <= len(purpose) <= 200:
            fail('BAD_PURPOSE')
        if not isinstance(readme_claim, str) \
                or not 10 <= len(readme_claim) <= 200:
            fail('BAD_CLAIM')
        self._check_addr(payout_address)
        for i in range(1, int(self.next_project_id)):
            raw = self.projects.get(str(i), '')
            if raw and json.loads(raw)['repo_url'] == repo_url:
                fail('DUPLICATE_PROJECT')
        applicant = str(gl.message.sender_address).lower()
        pid = int(self.next_project_id)
        self.next_project_id = u32(pid + 1)
        p = _new_project(pid, name, repo_url, homepage_url, purpose,
                         readme_claim, _readme_path_for(repo_url),
                         payout_address, applicant)
        r['project_count'] = int(r['project_count']) + 1
        self._save_round(r)
        return self._save_project(p)

    def _judge(self, project_id, readme_claim):
        p = self._load_project(project_id)
        if p['status'] not in ('APPLIED', 'INELIGIBLE'):
            fail('PROJECT_ALREADY_JUDGED')
        checked = _run_eligibility(p['repo_url'], p['homepage_url'],
                                   readme_claim)
        eligible = checked['repo_exists'] and checked['readme_match'] \
            and checked['homepage_ok']
        p['status'] = 'ELIGIBLE' if eligible else 'INELIGIBLE'
        if eligible:
            p['readme_claim'] = readme_claim
        self._save_project(p)
        return packed({'project_id': int(project_id),
                       'status': p['status'], **checked})

    @gl.public.write
    def judge_eligibility(self, project_id: int) -> str:
        r = self._load_round()
        if r['phase'] not in ('APPLICATION', 'FUNDING'):
            fail('ROUND_NOT_JUDGEABLE')
        p = self._load_project(project_id)
        if p['status'] != 'APPLIED':
            fail('PROJECT_ALREADY_JUDGED')
        return self._judge(project_id, p['readme_claim'])

    @gl.public.write
    def rejudge_eligibility(self, project_id: int,
                            new_claim: str) -> str:
        r = self._load_round()
        if r['phase'] not in ('APPLICATION', 'FUNDING'):
            fail('ROUND_NOT_JUDGEABLE')
        p = self._load_project(project_id)
        if p['status'] != 'INELIGIBLE':
            fail('PROJECT_NOT_INELIGIBLE')
        if str(gl.message.sender_address).lower() != p['applicant']:
            fail('NOT_APPLICANT')
        if not isinstance(new_claim, str) \
                or not 10 <= len(new_claim) <= 200:
            fail('BAD_CLAIM')
        return self._judge(project_id, new_claim)

    @gl.public.write
    def bind_donor(self, address: str, github_login: str,
                   gist_id: str) -> str:
        self._load_round()
        self._check_addr(address)
        address = address.lower()
        if str(gl.message.sender_address).lower() != address:
            fail('NOT_DONOR')
        if self.donors.get(address, ''):
            fail('ALREADY_BOUND')
        if self.login_to_address.get(github_login, ''):
            fail('DUPLICATE_BINDING')
        if not isinstance(github_login, str) \
                or not 1 <= len(github_login) <= 39:
            fail('BAD_LOGIN')
        if not isinstance(gist_id, str) \
                or not 1 <= len(gist_id) <= 64:
            fail('BAD_GIST_ID')
        checked = _run_bind(address, github_login, gist_id)
        if not checked['gist_ok']:
            fail('GIST_NOT_FOUND')
        if not checked['owner_match']:
            fail('GIST_OWNER_MISMATCH')
        if not checked['challenge_present']:
            fail('CHALLENGE_MISMATCH')
        if checked['created_at'] == '':
            fail('PROFILE_NOT_FOUND')
        established = checked['created_at'] < ESTABLISHED_CUTOFF \
            and int(checked['public_repos']) >= MIN_PUBLIC_REPOS
        if not established:
            fail('NOT_ESTABLISHED')
        self.donors[address] = packed({
            'address': address, 'github_login': github_login,
            'gist_id': gist_id, 'established': True,
            'created_at': checked['created_at'],
            'public_repos': int(checked['public_repos'])})
        self.login_to_address[github_login] = address
        r = self._load_round()
        r['donor_count'] = int(r['donor_count']) + 1
        self.donor_index[str(r['donor_count'])] = address
        self._save_round(r)
        return self.donors[address]

    @gl.public.write
    def open_funding(self) -> str:
        r = self._load_round()
        if str(gl.message.sender_address).lower() != r['creator']:
            fail('NOT_CREATOR')
        if r['phase'] != 'APPLICATION':
            fail('ROUND_NOT_APPLICATION')
        r['phase'] = 'FUNDING'
        return self._save_round(r)

    @gl.public.write.payable
    def contribute(self, project_id: int) -> str:
        r = self._load_round()
        if r['phase'] != 'FUNDING':
            fail('ROUND_NOT_FUNDING')
        p = self._load_project(project_id)
        if p['status'] != 'ELIGIBLE':
            fail('PROJECT_NOT_ELIGIBLE')
        donor_addr = str(gl.message.sender_address).lower()
        raw = self.donors.get(donor_addr, '')
        if not raw:
            fail('NOT_BOUND')
        donor = json.loads(raw)
        if not donor['established']:
            fail('NOT_ESTABLISHED')
        amount = int(gl.message.value)
        if amount <= 0:
            fail('AMOUNT')
        key = str(project_id) + '|' + donor_addr
        prev = self.contrib_totals.get(key, '')
        total = (int(prev) if prev else 0) + amount
        self.contrib_totals[key] = str(total)
        donors_raw = self.project_donors.get(str(project_id), '')
        donors = json.loads(donors_raw) if donors_raw else []
        if donor_addr not in donors:
            donors.append(donor_addr)
            self.project_donors[str(project_id)] = packed(donors)
        p['direct_wei'] = int(p['direct_wei']) + amount
        self._save_project(p)
        r['total_direct_wei'] = int(r['total_direct_wei']) + amount
        self._save_round(r)
        self.total_received = self.total_received + u256(amount)
        self.total_direct = self.total_direct + u256(amount)
        return packed({'project_id': int(project_id),
                       'donor': donor_addr, 'amount_wei': amount,
                       'donor_total_wei': total})

    @gl.public.write
    def close_round(self) -> str:
        r = self._load_round()
        if str(gl.message.sender_address).lower() != r['creator']:
            fail('NOT_CREATOR')
        if r['phase'] != 'FUNDING':
            fail('ROUND_NOT_FUNDING')
        r['phase'] = 'CLOSED'
        return self._save_round(r)

    @gl.public.write
    def distribute(self) -> str:
        r = self._load_round()
        # v1.1: the distributed guard comes FIRST. v1.0 checked the phase
        # first, which shadowed this branch: after the first distribute
        # the phase is DISTRIBUTED, so a second call failed
        # ROUND_NOT_CLOSED and ALREADY_DISTRIBUTED was unreachable.
        if r['distributed']:
            fail('ALREADY_DISTRIBUTED')
        if r['phase'] != 'CLOSED':
            fail('ROUND_NOT_CLOSED')
        pool = int(r['pool_wei'])
        raw_matches = {}
        total_raw = 0
        for i in range(1, int(self.next_project_id)):
            praw = self.projects.get(str(i), '')
            if not praw:
                continue
            p = json.loads(praw)
            if p['status'] != 'ELIGIBLE':
                raw_matches[i] = 0
                continue
            donors_raw = self.project_donors.get(str(i), '')
            donors = json.loads(donors_raw) if donors_raw else []
            s = 0
            direct = 0
            for d in donors:
                key = str(i) + '|' + d
                c = int(self.contrib_totals.get(key, '0') or '0')
                s += _isqrt(c)
                direct += c
            m = s * s - direct
            if m < 0:
                m = 0
            raw_matches[i] = m
            total_raw += m
        if total_raw > pool:
            scaled = {}
            for i, m in raw_matches.items():
                scaled[i] = m * pool // total_raw
        else:
            scaled = dict(raw_matches)
        total_match = 0
        for i in range(1, int(self.next_project_id)):
            praw = self.projects.get(str(i), '')
            if not praw:
                continue
            p = json.loads(praw)
            if p['status'] != 'ELIGIBLE':
                continue
            m = scaled.get(i, 0)
            p['match_wei'] = m
            p['distributed'] = True
            total_match += m
            self._save_project(p)
            if m > 0 or int(p['direct_wei']) > 0:
                self._add_credit(p['payout_address'],
                                 int(p['direct_wei']) + m)
        unspent = pool - total_match
        if unspent > 0:
            self._add_credit(r['creator'], unspent)
        r['total_match_wei'] = total_match
        r['distributed'] = True
        r['phase'] = 'DISTRIBUTED'
        self._save_round(r)
        self.total_match = self.total_match + u256(total_match)
        return packed({'round_id': 1, 'total_match_wei': total_match,
                       'unspent_pool_wei': unspent,
                       'matches': {str(k): v
                                   for k, v in scaled.items()}})

    @gl.public.write
    def withdraw(self) -> str:
        sender = str(gl.message.sender_address).lower()
        amount = self._credit(sender)
        if amount <= 0:
            fail('NO_CREDIT')
        self.credits[sender] = '0'
        self.total_withdrawn = self.total_withdrawn + u256(amount)
        _Recipient(Address(sender)).emit_transfer(value=u256(amount))
        return packed({'sender': sender, 'withdrawn_wei': amount})

    # ---- views ----
    @gl.public.view
    def get_protocol(self) -> str:
        return 'matchroot-1.1'

    @gl.public.view
    def get_round(self) -> str:
        return self.round.get('1', '')

    @gl.public.view
    def get_project(self, project_id: int) -> str:
        return self.projects.get(str(project_id), '')

    @gl.public.view
    def get_all_projects(self) -> str:
        out = []
        for i in range(1, int(self.next_project_id)):
            raw = self.projects.get(str(i), '')
            if raw:
                out.append(json.loads(raw))
        return packed(out)

    @gl.public.view
    def get_donor(self, address: str) -> str:
        return self.donors.get(address.lower(), '')

    @gl.public.view
    def get_all_donors(self) -> str:
        out = []
        r = self.round.get('1', '')
        count = int(json.loads(r)['donor_count']) if r else 0
        for i in range(1, count + 1):
            addr = self.donor_index.get(str(i), '')
            raw = self.donors.get(addr, '') if addr else ''
            if raw:
                out.append(json.loads(raw))
        return packed(out)

    @gl.public.view
    def get_contribution(self, project_id: int,
                         donor: str) -> str:
        key = str(project_id) + '|' + donor.lower()
        total = self.contrib_totals.get(key, '')
        return packed({'project_id': int(project_id),
                       'donor': donor.lower(),
                       'total_wei': int(total) if total else 0})

    @gl.public.view
    def get_project_donors(self, project_id: int) -> str:
        raw = self.project_donors.get(str(project_id), '')
        return raw if raw else '[]'

    @gl.public.view
    def get_credit(self, address: str) -> str:
        return packed({'address': address.lower(),
                       'credit_wei': self._credit(address.lower())})

    @gl.public.view
    def get_counts(self) -> str:
        r = self._load_round() if self.round.get('1', '') else None
        return packed({
            'phase': r['phase'] if r else '',
            'project_count': int(r['project_count']) if r else 0,
            'donor_count': int(r['donor_count']) if r else 0,
            'total_received_wei': int(self.total_received),
            'total_withdrawn_wei': int(self.total_withdrawn),
            'contract_balance_wei': int(self.balance),
            'pool_wei': int(r['pool_wei']) if r else 0,
            'total_direct_wei': int(self.total_direct),
            'total_match_wei': int(self.total_match),
        })
