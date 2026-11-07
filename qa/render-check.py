"""Fixed-loopback, bounded checks for the separate Render test Compose project."""
from concurrent.futures import ThreadPoolExecutor
import argparse
import json
from pathlib import Path
import ssl
import subprocess
import time
import urllib.error
import urllib.request

parser = argparse.ArgumentParser()
parser.add_argument('--output', required=True)
parser.add_argument('--cache', action='store_true')
parser.add_argument('--cold', action='store_true')
parser.add_argument('--lifecycle', action='store_true')
args = parser.parse_args()
results = {'checks':[]}
ctx = ssl._create_unverified_context()  # Fixed loopback certificate only.
container = 'refundshield-render-validation-adapter-1'
compose = Path(__file__).resolve().parents[1]/'deploy/compose.render-test.yaml'

def docker(*command):
    return subprocess.check_output(['docker', *command])

def inspect():
    state = json.loads(docker('inspect',container))[0]
    assert state['Config']['Labels']['com.docker.compose.project'] == 'refundshield-render-validation'
    return state

def request(path, host=None):
    req = urllib.request.Request('https://127.0.0.1:8443'+path, headers={'Host':host} if host else {})
    before = time.monotonic()
    try:
        with urllib.request.urlopen(req,context=ctx,timeout=22) as response:
            return response.status, response.read(), time.monotonic()-before
    except urllib.error.HTTPError as error:
        return error.code, error.read(), time.monotonic()-before

def check(name, function):
    try:
        function()
        results['checks'].append({'name':name,'passed':True})
    except Exception as error:
        results['checks'].append({'name':name,'passed':False,'error':str(error)})
    Path(args.output).write_text(json.dumps(results,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(results['checks'][-1]),flush=True)

def policy():
    state = inspect()
    config = state['HostConfig']
    assert state['Config']['User'] == '10001:10001'
    assert config['ReadonlyRootfs'] and config['Memory'] == 512000000
    assert config['MemorySwap'] == config['Memory'] and config['NanoCpus'] == 100000000
    assert config['PidsLimit'] == 64 and 'ALL' in config['CapDrop']
    assert 'no-new-privileges:true' in config['SecurityOpt'] and not config['PortBindings']
    assert all(n.endswith('_analysis') for n in state['NetworkSettings']['Networks'])
    results['image'] = state['Image']
    assert request('/healthz')[:2] == (200,b'ok\n')
    assert request('/api/health')[0] == 200
    assert request('/healthz',host='untrusted.invalid')[0] == 404
    probe = "import socket,os,stat; s=socket.socket(); assert s.connect_ex(('127.0.0.1',8000))!=0; assert stat.S_ISSOCK(os.stat('/tmp/refundshield/api.sock').st_mode); assert stat.S_IMODE(os.stat('/tmp/refundshield').st_mode)==0o700; print('private socket, no backend TCP port')"
    results['private_backend'] = docker('exec',container,'python','-c',probe).decode().strip()
check('Non-root isolated resource policy, exact Host and real readiness',policy)

if args.cache:
    def cache():
        scenarios = ['normal','household','isolated','coordinated']
        elapsed = []
        for index in range(33):
            code,body,seconds = request('/api/threshold-analysis?scenario='+scenarios[index%4]+'&threshold='+str(round(.031+index*.024,3)))
            assert code == 200 and 'bunching_score' in json.loads(body), code
            elapsed.append(seconds)
            assert request('/healthz')[0] == 200
        results['mixed_cache'] = {'distinct_requests':33,'max_seconds':round(max(elapsed),3),
                                  'total_seconds':round(sum(elapsed),3)}
        results['memory'] = docker('exec',container,'cat','/sys/fs/cgroup/memory.peak','/sys/fs/cgroup/memory.events').decode()
    check('Mixed-scenario full cache and eviction workload at Free limits',cache)

if args.cache or args.cold:
    def capacity():
        samples = {}
        for label,paths in {
            'coordinated_eight': ['/api/threshold-analysis?scenario=coordinated&threshold='+str(round(.401+i*.001,3)) for i in range(8)],
            'mixed_four': ['/api/threshold-analysis?scenario='+scenario+'&threshold='+str(round(.611+i*.001,3)) for i,scenario in enumerate(['normal','household','isolated','coordinated'])],
        }.items():
            with ThreadPoolExecutor(max_workers=8) as pool:
                responses = list(pool.map(request,paths))
            statuses = [r[0] for r in responses]
            samples[label] = {'statuses':statuses,'max_seconds':round(max(r[2] for r in responses),3)}
            results['cold_capacity'] = samples
            assert set(statuses) <= {200,429} and 200 in statuses, statuses
            assert request('/healthz')[0] == 200
    check('Bounded concurrent cold cache misses and independent health',capacity)

if args.lifecycle:
    def wait_ready():
        deadline = time.monotonic()+160
        while time.monotonic()<deadline:
            if inspect()['State'].get('Health',{}).get('Status') == 'healthy' and request('/healthz')[0] == 200:
                return
            time.sleep(1)
        raise AssertionError('Readiness timeout')

    def restart():
        before=time.monotonic()
        docker('compose','-f',str(compose),'restart','--timeout','20','adapter')
        wait_ready()
        results['restart_seconds']=round(time.monotonic()-before,3)
        assert request('/api/health')[0] == 200
    check('Graceful stop and clean health-gated restart',restart)

    def child_failure():
        inspect()
        kill="import json,os,signal; p=json.load(open('/tmp/refundshield/pids.json')); os.kill(p['api'],signal.SIGTERM)"
        docker('exec',container,'python','-c',kill)
        deadline=time.monotonic()+25
        while time.monotonic()<deadline and inspect()['State']['Running']:
            time.sleep(.5)
        state=inspect()['State']
        assert not state['Running'] and state['ExitCode']==1 and not state['OOMKilled']
        assert request('/healthz')[0] in {502,503}
        results['failed_child_exit']=state['ExitCode']
        docker('compose','-f',str(compose),'up','-d','--wait','--wait-timeout','160')
        wait_ready()
        assert request('/api/health')[0] == 200
    check('Backend death shuts down both children and recovers cleanly',child_failure)

print(json.dumps(results,indent=2))
raise SystemExit(1 if any(not c['passed'] for c in results['checks']) else 0)
