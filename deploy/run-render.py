"""Non-root single-service adapter. No application/scoring state is persisted."""
from __future__ import annotations

import http.client
import ipaddress
import json
import os
from pathlib import Path
import re
import signal
import socket
import subprocess
import sys
import threading
import time
from urllib.parse import urlsplit

STATE = Path('/tmp/refundshield')
SOCKET = str(STATE / 'api.sock')


def configuration(env):
    raw_port = env.get('PORT', '10000')
    if not re.fullmatch(r'[0-9]{4,5}', raw_port):
        raise ValueError('Invalid port')
    port = int(raw_port)
    if not 1024 <= port <= 65535 or port in {18012, 18013, 19099}:
        raise ValueError('Invalid port')
    origin = env.get('REFUNDSHIELD_ORIGINS', '')
    if not origin and env.get('RENDER_EXTERNAL_HOSTNAME'):
        origin = 'https://' + env['RENDER_EXTERNAL_HOSTNAME']
    parsed = urlsplit(origin)
    host = parsed.hostname or ''
    # A single exact HTTPS origin; reject config injection and wildcard origins.
    if (parsed.scheme != 'https' or not host or parsed.username or parsed.password
            or parsed.path or parsed.query or parsed.fragment or origin != origin.strip()
            or ',' in origin or len(host) > 253):
        raise ValueError('Invalid origin')
    try:
        address = ipaddress.ip_address(host)
        if str(address) != '127.0.0.1':
            raise ValueError('Only loopback IP is allowed for local validation')
    except ValueError:
        if not re.fullmatch(r'[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+', host):
            raise ValueError('Invalid hostname')
        # An unapproved numeric IP must not pass the DNS branch.
        if re.fullmatch(r'[0-9.]+', host):
            raise ValueError('Invalid hostname')
    if parsed.port not in {None, 443} and not (host == '127.0.0.1' and parsed.port == 8443):
        raise ValueError('Invalid origin port')
    # Canonical spelling avoids server_name, Origin and authority disagreement.
    canonical = 'https://' + host + (':8443' if parsed.port == 8443 else '')
    if origin != canonical:
        raise ValueError('Non-canonical origin')
    return port, host, canonical


class UnixHTTPConnection(http.client.HTTPConnection):
    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.settimeout(self.timeout)
        self.sock.connect(SOCKET)


def backend_ready():
    connection = UnixHTTPConnection('localhost', timeout=2)
    try:
        # The existing lightweight root bypasses visitor /api budgets.
        connection.request('GET', '/')
        response = connection.getresponse()
        data = response.read(4096)
        decoded = json.loads(data)
        return response.status == 200 and isinstance(decoded, dict) and decoded.get('service') == 'RefundShield'
    except (OSError, ValueError, http.client.HTTPException):
        return False
    finally:
        connection.close()


def harden_process():
    # These restrictions also apply when a provider cannot express Compose flags.
    import ctypes
    import resource
    if os.geteuid() == 0:
        raise OSError('Root runtime is prohibited')
    if ctypes.CDLL(None, use_errno=True).prctl(38, 1, 0, 0, 0) != 0:  # PR_SET_NO_NEW_PRIVS
        raise OSError('Cannot enable no-new-privileges')
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    resource.setrlimit(resource.RLIMIT_NOFILE, (512, 512))
    resource.setrlimit(resource.RLIMIT_FSIZE, (32*1024*1024, 32*1024*1024))


def stop_children(children):
    for name, child in children:
        if child.poll() is None:
            try:
                os.killpg(child.pid, signal.SIGQUIT if name == 'web' else signal.SIGTERM)
            except ProcessLookupError:
                pass
    deadline = time.monotonic() + 12
    for _, child in children:
        try:
            child.wait(timeout=max(0.1, deadline-time.monotonic()))
        except subprocess.TimeoutExpired:
            try:
                os.killpg(child.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            child.wait(timeout=2)


def healthcheck():
    try:
        port, host, _ = configuration(os.environ)
        connection = http.client.HTTPConnection('127.0.0.1', port, timeout=2)
        try:
            connection.request('GET', '/healthz', headers={'Host': host})
            response = connection.getresponse()
            return 0 if response.status == 200 and response.read(32) == b'ok\n' else 1
        finally:
            connection.close()
    except (ValueError, OSError, http.client.HTTPException):
        return 1


def main():
    try:
        port, host, origin = configuration(os.environ)
    except (ValueError, TypeError):
        print('Invalid deployment configuration.', file=sys.stderr, flush=True)
        return 2
    os.umask(0o077)
    try:
        harden_process()
    except OSError:
        print('Runtime hardening failed.', file=sys.stderr, flush=True)
        return 2
    STATE.mkdir(mode=0o700, exist_ok=True)
    ready = STATE/'ready'
    ready.unlink(missing_ok=True)
    Path(SOCKET).unlink(missing_ok=True)
    template = Path('/app/deployment/nginx.render.conf.template').read_text()
    config = template.replace('__PORT__', str(port)).replace('__HOST__', host)
    (STATE/'nginx.conf').write_text(config)
    if subprocess.run(['nginx', '-e', 'stderr', '-t', '-c', str(STATE/'nginx.conf')]).returncode:
        return 2
    os.environ['REFUNDSHIELD_ORIGINS'] = origin
    stopping = threading.Event()
    for sig in (signal.SIGTERM, signal.SIGINT):
        signal.signal(sig, lambda *_: stopping.set())
    children = []
    exit_code = 0
    try:
        children.append(('api', subprocess.Popen([
            sys.executable, '-m', 'uvicorn', 'deployment.render_app:app', '--uds', SOCKET,
            '--workers', '1', '--loop', 'asyncio', '--http', 'h11', '--no-access-log',
            '--no-server-header', '--no-proxy-headers', '--limit-concurrency', '16',
            '--timeout-keep-alive', '5', '--timeout-graceful-shutdown', '10',
        ], start_new_session=True)))
        children.append(('web', subprocess.Popen([
            'nginx', '-e', 'stderr', '-c', str(STATE/'nginx.conf'), '-g', 'daemon off;',
        ], start_new_session=True)))
        (STATE/'pids.json').write_text(json.dumps({name: p.pid for name,p in children}))
        next_check, failures, ever_ready = 0.0, 0, False
        started = time.monotonic()
        while not stopping.wait(0.1):
            if any(child.poll() is not None for _,child in children):
                print('A runtime process stopped; shutting down.', flush=True)
                exit_code = 1
                break
            now = time.monotonic()
            if now >= next_check:
                healthy = backend_ready()
                if healthy:
                    ever_ready = True
                    if not ready.exists():
                        ready.write_text('ok\n')
                    failures = 0
                else:
                    ready.unlink(missing_ok=True)
                    failures += 1
                if failures >= 5 and (ever_ready or now-started > 120):
                    print('Backend readiness failed; shutting down.', flush=True)
                    exit_code = 1
                    break
                next_check = time.monotonic()+2
    except OSError:
        print('Runtime startup failed.', file=sys.stderr, flush=True)
        exit_code = 1
    finally:
        ready.unlink(missing_ok=True)
        stop_children(children)
        print('Synthetic runtime shutdown complete.', flush=True)
    return exit_code


if __name__ == '__main__':
    raise SystemExit(healthcheck() if sys.argv[1:] == ['--healthcheck'] else main())
