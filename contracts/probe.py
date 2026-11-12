# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
"""MatchRoot fetch probe (NOT the product contract).

Deployed once to answer a single question before the real contract
is written: can GenLayer validators fetch each anchor URL, and does
the raw fetched body contain the needle the eligibility rule would
look for? The probe is not part of the evidence pack; only its
results (recorded in the workdir notes) inform the rule.

For each (url, needle) it reports: HTTP status, fetch success, body
length, and whether the needle appears in (a) the whole body,
(b) the first 4000 characters. Leader and validators each fetch
independently and must agree exactly on the whole vector.
"""
from genlayer import *
import json


def fail(s):
    raise gl.vm.UserError(s)


def packed(x):
    return json.dumps(x, sort_keys=True, separators=(',', ':'))


def _probe_once(url, needle):
    """One fetch + needle scan. Never raises: a fetch failure is
    reported as ok=False with status 0."""
    try:
        response = gl.nondet.web.request(url, method='GET')
    except Exception:
        return {'ok': False, 'status': 0, 'len': 0,
                'needle_body': False, 'needle_head': False}
    status = getattr(response, 'status', 0)
    body = response.body
    if isinstance(body, bytes):
        try:
            text = body.decode('utf-8', errors='ignore')
        except Exception:
            text = ''
    elif isinstance(body, str):
        text = body
    else:
        text = ''
    low = text.lower()
    n = needle.lower()
    return {'ok': status == 200, 'status': int(status), 'len': len(text),
            'needle_body': n in low, 'needle_head': n in low[:4000]}


def _validate(res):
    if not isinstance(res, dict):
        fail('PROBE_RESULT')
    for k in ('ok', 'needle_body', 'needle_head'):
        if not isinstance(res.get(k), bool):
            fail('PROBE_BOOL')
    if not isinstance(res.get('status'), int) \
            or not isinstance(res.get('len'), int):
        fail('PROBE_INT')
    if res.get('len') < 0:
        fail('PROBE_LEN')
    return res


def _run_probe(url, needle):
    def leader_fn():
        return _validate(_probe_once(url, needle))

    def validator_fn(result):
        if not isinstance(result, gl.vm.Return):
            try:
                leader_fn()
            except Exception:
                return True
            return False
        try:
            mine = _validate(_probe_once(url, needle))
        except Exception:
            return False
        leader = result.calldata
        if not isinstance(leader, dict):
            return False
        return all(leader.get(k) == mine.get(k) for k in
                   ('ok', 'status', 'len', 'needle_body', 'needle_head'))

    return gl.vm.run_nondet_unsafe(leader_fn, validator_fn)


class Probe(gl.Contract):
    results: TreeMap[str, str]
    next_id: u32

    def __init__(self):
        self.results = TreeMap()
        self.next_id = u32(1)

    @gl.public.write
    def probe(self, url: str, needle: str) -> str:
        if not isinstance(url, str) or not 8 <= len(url.strip()) <= 512:
            fail('URL_LENGTH')
        if not isinstance(needle, str) or not 1 <= len(needle) <= 200:
            fail('NEEDLE_LENGTH')
        url = url.strip()
        if not url.startswith('http://') and not url.startswith('https://'):
            fail('URL_SCHEME')
        res = _run_probe(url, needle)
        rid = int(self.next_id)
        self.next_id = u32(rid + 1)
        rec = {'id': rid, 'url': url, 'needle': needle, **res}
        self.results[str(rid)] = packed(rec)
        return packed(rec)

    @gl.public.view
    def get_result(self, rid: int) -> str:
        return self.results.get(str(rid), '')

    @gl.public.view
    def get_all_results(self) -> str:
        out = []
        for i in range(1, int(self.next_id)):
            raw = self.results.get(str(i), '')
            if raw:
                out.append(json.loads(raw))
        return packed(out)

    @gl.public.view
    def get_protocol(self) -> str:
        return 'matchroot-probe-1'
