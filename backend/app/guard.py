"""Bound the local synthetic demo, without collecting visitor identifiers."""
from time import monotonic
from threading import Lock
from urllib.parse import parse_qsl

from starlette.responses import JSONResponse


class DemoGuard:
    """Process-wide 600/min budget and 8 in-flight reads; edge limits still needed."""
    def __init__(self, app, requests_per_minute=600, max_inflight=8):
        self.app = app
        self.budget = requests_per_minute
        self.max_inflight = max_inflight
        self.lock = Lock()
        self.window = monotonic()
        self.count = 0
        self.inflight = 0

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http' or not scope['path'].startswith('/api'):
            return await self.app(scope, receive, send)
        def error(code, message, headers=None):
            return JSONResponse({'detail': message}, status_code=code, headers=headers)
        method = scope['method']
        if method not in {'GET', 'HEAD', 'OPTIONS'}:
            return await error(405, 'Read-only synthetic demo API', {'Allow': 'GET, HEAD, OPTIONS'})(scope, receive, send)
        raw = scope.get('query_string', b'')
        if len(raw) > 2048 or len(scope['path']) > 240:
            return await error(414, 'Request URL is too long')(scope, receive, send)
        params = parse_qsl(raw.decode('utf-8', errors='replace'), keep_blank_values=True)
        keys = [k for k, _ in params]
        allowed = {'scenario', 'threshold', 'q', 'limit', 'relationship'}
        if len(keys) != len(set(keys)) or any(k not in allowed for k in keys):
            return await error(422, 'Unknown or repeated query parameter')(scope, receive, send)
        for key, value in params:
            if len(value) > 80 or (key == 'q' and len(value.strip()) < 2):
                return await error(422, 'Invalid query length')(scope, receive, send)
            if key == 'relationship' and value not in {'all', 'shared_device', 'shared_address', 'category_overlap', 'claim_timing', 'behavioural'}:
                return await error(422, 'Unknown relationship filter')(scope, receive, send)
        with self.lock:
            now = monotonic()
            if now - self.window >= 60:
                self.window, self.count = now, 0
            denied = self.count >= self.budget or self.inflight >= self.max_inflight
            if not denied:
                self.count += 1
                self.inflight += 1
        if denied:
            return await error(429, 'Demo capacity reached; please retry shortly', {'Retry-After': '60'})(scope, receive, send)
        try:
            await self.app(scope, receive, send)
        finally:
            with self.lock:
                self.inflight -= 1
