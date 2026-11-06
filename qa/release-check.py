"""Bounded, synthetic-only HTTPS/proxy checks. Loopback is the only target."""
from concurrent.futures import ThreadPoolExecutor
from collections import Counter
import argparse
import json
from pathlib import Path
import re
import ssl
import statistics
import time
from urllib.error import HTTPError
from urllib.request import Request, urlopen

parser = argparse.ArgumentParser()
parser.add_argument('--output', required=True)
parser.add_argument('--local-self-signed', action='store_true')
parser.add_argument('--load', action='store_true', help='Bounded 64-request capacity probe; run after browser tests')
args = parser.parse_args()
context = ssl._create_unverified_context() if args.local_self_signed else ssl.create_default_context()
base = 'https://127.0.0.1:8443'
results = {'checks': [], 'local_self_signed': args.local_self_signed}

def request(path, method='GET', headers=None):
    start = time.perf_counter()
    try:
        response = urlopen(Request(base+path, method=method, headers=headers or {}), context=context, timeout=25)
    except HTTPError as error:
        response = error
    with response:
        return response.status, dict(response.headers), response.read(), (time.perf_counter()-start)*1000

def check(name, run):
    try:
        run()
        results['checks'].append({'name': name, 'passed': True})
    except Exception as error:
        results['checks'].append({'name': name, 'passed': False, 'error_type': type(error).__name__, 'message': str(error)[:200]})

def health():
    code, headers, body, elapsed = request('/api/health')
    assert code == 200 and json.loads(body)['status'] == 'ok'
    assert 'Synthetic' in json.loads(body)['synthetic_notice']
    results['health_ms'] = round(elapsed, 2)
check('Proxy and synthetic API health', health)

def routes():
    for path in ['/', '/investigations/RET-7137', '/accounts/ACC-1032', '/threshold', '/network?cluster=C-011', '/scenarios']:
        code, headers, body, _ = request(path)
        assert code == 200 and re.search(rb'<div\b[^>]*\bid="root"(?:\s|>)', body), f'SPA root missing: {path}'
        normalized = {k.lower(): v for k, v in headers.items()}
        assert "script-src 'self'" in normalized['content-security-policy']
        assert normalized['x-content-type-options'] == 'nosniff'
        assert normalized['x-frame-options'] == 'DENY'
        assert normalized['referrer-policy'] == 'no-referrer'
        assert normalized['cache-control'] == 'no-cache'
    script = re.search(rb'src="(/assets/[^\"]+\.js)"', body).group(1).decode()
    code, headers, body, _ = request(script)
    assert code == 200 and 'immutable' in headers.get('Cache-Control', '')
    assert 'Content-Security-Policy' in headers
check('SPA deep links, immutable assets and inherited security headers', routes)

def excluded_paths():
    for path in ['/.git/config', '/.env', '/backend/app/main.py', '/frontend/package.json', '/private/certs/tls.key', '/security/phase2', '/docs', '/redoc', '/openapi.json', '/README.md', '/assets/missing.js']:
        assert request(path)[0] == 404, path
check('Private/source/docs paths never return files or SPA fallback', excluded_paths)

def mutations():
    for method in ['POST', 'PUT', 'PATCH', 'DELETE']:
        assert request('/api/investigations/RET-7137/notes', method)[0] == 405
check('Proxy denies all case mutation methods', mutations)

def inputs():
    for query in ['threshold=NaN', 'threshold=inf', 'threshold=0', 'threshold=0.91', 'scenario=unknown', 'scenario=coordinated&scenario=household', 'unexpected=value']:
        assert request('/api/dashboard?'+query)[0] in {404, 422}
    assert request('/api/dashboard?x='+'A'*2100)[0] in {414, 422}
    assert request('/api/accounts/ACC-DOES-NOT-EXIST')[0] == 404
check('Invalid/oversized/duplicate inputs and unknown IDs are rejected', inputs)

def cors():
    _, headers, _, _ = request('/api/health', headers={'Origin': 'https://untrusted.invalid'})
    assert not any(k.lower() == 'access-control-allow-origin' for k in headers)
    code, _, _, _ = request('/api/health', 'OPTIONS', {'Origin': 'https://untrusted.invalid', 'Access-Control-Request-Method': 'GET'})
    assert code == 400
check('Untrusted origin receives no CORS permission', cors)

def cold():
    code, _, body, elapsed = request('/api/dashboard?scenario=coordinated&threshold=0.231')
    assert code == 200 and isinstance(json.loads(body), dict)
    results['uncached_analysis_ms'] = round(elapsed, 2)
    code, _, _, warm = request('/api/dashboard?scenario=coordinated&threshold=0.231')
    assert code == 200
    results['cached_analysis_ms'] = round(warm, 2)
check('Cold and cached analysis respond within bounded deadlines', cold)

if args.load:
    # Let prior sequential probes leave the 8r/s bucket before bounded load.
    time.sleep(3)
    def capacity():
        with ThreadPoolExecutor(max_workers=32) as workers:
            responses = list(workers.map(lambda _: request('/api/dashboard?scenario=coordinated'), range(64)))
        statuses = Counter(r[0] for r in responses)
        latencies = sorted(r[3] for r in responses)
        assert set(statuses) <= {200, 429}, statuses
        assert statuses[200] and statuses[429]
        assert all(r[1].get('Retry-After') == '60' for r in responses if r[0] == 429)
        results['bounded_capacity_probe'] = {'requests': 64, 'concurrency': 32, 'statuses': dict(statuses),
                                              'median_ms': round(statistics.median(latencies), 2),
                                              'max_ms': round(max(latencies), 2)}
    check('Bounded concurrent reads shed capacity with 429 and Retry-After', capacity)

Path(args.output).write_text(json.dumps(results, indent=2)+'\n', encoding='utf-8')
print(json.dumps(results, indent=2))
raise SystemExit(1 if any(not c['passed'] for c in results['checks']) else 0)
