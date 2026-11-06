"""Release boundary tests: read-only synthetic API, bounded traffic and input."""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.main import app
from app.guard import DemoGuard
from app.api.routes import get_analysis, _cached_analysis
from app.engines import investigation


@pytest.fixture(scope='module')
def client():
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


@pytest.mark.parametrize('method', ['post', 'put', 'patch', 'delete'])
@pytest.mark.parametrize('suffix', ['action', 'notes'])
def test_no_case_mutation(client, method, suffix):
    before = client.get('/api/investigations/RET-7137').json()
    response = getattr(client, method)(f'/api/investigations/RET-7137/{suffix}')
    assert response.status_code == 405
    assert client.get('/api/investigations/RET-7137').json() == before
    assert not hasattr(investigation, 'STORE')


@pytest.mark.parametrize('query', [
    'threshold=nan', 'threshold=inf', 'threshold=0', 'threshold=1',
    'threshold=0.2&threshold=0.3', 'scenario=unknown',
    'scenario=' + 'x' * 81, 'unexpected=value',
])
def test_invalid_analysis_requests(client, query):
    assert client.get('/api/threshold-analysis?' + query).status_code in (404, 422)


@pytest.mark.parametrize('query', ['q=a', 'q=%20%20', 'q=' + 'a' * 81])
def test_search_bounds(client, query):
    assert client.get('/api/search?' + query).status_code == 422


def test_queue_and_relationship_bounds(client):
    for limit in ('0', '501', 'NaN'):
        assert client.get('/api/investigation-queue?limit=' + limit).status_code == 422
    assert client.get('/api/network/ACC-1032?relationship=unknown').status_code == 422
    for relationship in ('all', 'shared_device', 'shared_address'):
        assert client.get('/api/network/ACC-1032?relationship=' + relationship).status_code == 200


@pytest.mark.parametrize('route', [
    '/api/investigations/RET-MISSING', '/api/accounts/ACC-MISSING/detail',
    '/api/network/ACC-MISSING', '/api/clusters/C-MISSING/timeline',
])
def test_record_validation(client, route):
    assert client.get(route).status_code == 404


def test_origins(client):
    trusted = client.options('/api/dashboard', headers={
        'Origin': 'http://localhost:5173', 'Access-Control-Request-Method': 'GET'})
    assert trusted.status_code == 200
    assert trusted.headers['access-control-allow-origin'] == 'http://localhost:5173'
    rejected = client.options('/api/dashboard', headers={
        'Origin': 'https://untrusted.invalid', 'Access-Control-Request-Method': 'GET'})
    assert rejected.status_code == 400
    assert 'access-control-allow-origin' not in rejected.headers


def test_baselines_and_scenarios_are_read_only(client):
    for scenario in ('normal', 'household', 'isolated', 'coordinated'):
        a = client.get('/api/dashboard', params={'scenario': scenario}).json()
        b = client.get('/api/dashboard', params={'scenario': scenario}).json()
        assert a == b
        assert a['totals']['reviewed'] == 0
        assert a['totals']['awaiting_review'] == a['totals']['return_requests']
    assert _cached_analysis.cache_info().maxsize == 32


def test_rate_capacity_and_sanitized_error():
    small = FastAPI()
    small.add_middleware(DemoGuard, requests_per_minute=2)

    @small.get('/api/test')
    def ok():
        return {'ok': True}

    with TestClient(small) as c:
        assert c.get('/api/test').status_code == 200
        assert c.get('/api/test').status_code == 200
        denied = c.get('/api/test')
        assert denied.status_code == 429
        assert denied.headers['retry-after'] == '60'


def test_internal_threshold_validation():
    with pytest.raises(Exception):
        get_analysis('coordinated', float('nan'))


def test_unexpected_errors_do_not_expose_details(client, monkeypatch):
    def fail(_):
        raise RuntimeError('private-error-sentinel')
    monkeypatch.setattr(investigation, 'dashboard', fail)
    response = client.get('/api/dashboard')
    assert response.status_code == 500
    assert response.json() == {'detail': 'Synthetic analysis could not be completed'}
    assert 'private-error-sentinel' not in response.text
