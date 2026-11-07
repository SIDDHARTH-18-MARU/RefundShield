"""Render-only work admission; underlying analysis and case APIs are unchanged."""
from math import isfinite
from threading import Lock
from urllib.parse import parse_qsl

from starlette.responses import JSONResponse
from app.main import app as core_app


class AnalysisKeyBudget:
    """Bound distinct concurrent analysis keys without rejecting same-key reads.

    The existing API still bounds total in-flight requests, rate, IDs and inputs.
    This wrapper adds no case state, analytics cache or scoring behavior.
    """
    def __init__(self, app, maximum=4):
        self.app = app
        self.maximum = maximum
        self.active = {}
        self.lock = Lock()

    @staticmethod
    def key(scope):
        if (scope['type'] != 'http' or scope.get('method') not in {'GET','HEAD'}
                or not scope.get('path','').startswith('/api/')
                or scope['path'] in {'/api/health','/api/scenarios'}):
            return None
        raw = scope.get('query_string', b'')
        if len(raw) > 2048:
            return None  # The existing guard rejects malformed input.
        pairs = parse_qsl(raw.decode('utf-8',errors='replace'), keep_blank_values=True)
        if len({k for k,_ in pairs}) != len(pairs) or any(len(v)>80 for _,v in pairs):
            return None
        params = dict(pairs)
        value = params.get('threshold')
        try:
            threshold = float(value) if value is not None else None
        except ValueError:
            return None
        if threshold is not None and (not isfinite(threshold) or not .01 <= threshold <= .9):
            return None
        return params.get('scenario','coordinated'), threshold

    async def __call__(self, scope, receive, send):
        key = self.key(scope)
        if key is None:
            return await self.app(scope,receive,send)
        with self.lock:
            denied = key not in self.active and len(self.active) >= self.maximum
            if not denied:
                self.active[key] = self.active.get(key,0)+1
        if denied:
            return await JSONResponse({'detail':'Demo analysis capacity reached; please retry shortly'},
                                      status_code=429,headers={'Retry-After':'60'})(scope,receive,send)
        try:
            await self.app(scope,receive,send)
        finally:
            with self.lock:
                self.active[key] -= 1
                if not self.active[key]:
                    del self.active[key]


app = AnalysisKeyBudget(core_app)
