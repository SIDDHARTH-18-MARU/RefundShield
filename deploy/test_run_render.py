"""Standard-library regressions; no test tools belong in the deployed image."""
import importlib.util
import asyncio
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import Mock, patch

spec = importlib.util.spec_from_file_location('adapter', Path(__file__).with_name('run-render.py'))
adapter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(adapter)
sys.path[:0] = [str(Path.cwd()), str(Path(__file__).resolve().parents[1]/'backend')]
budget_spec = importlib.util.spec_from_file_location('render_budget', Path(__file__).with_name('render_app.py'))
budget_module = importlib.util.module_from_spec(budget_spec)
budget_spec.loader.exec_module(budget_module)


class AnalysisBudgetTests(unittest.IsolatedAsyncioTestCase):
    def scope(self, threshold='.2'):
        return {'type':'http','method':'GET','path':'/api/dashboard',
                'query_string':('scenario=coordinated&threshold='+threshold).encode()}

    async def test_distinct_keys_shed_capacity(self):
        gate = asyncio.Event()
        messages = []
        async def send(message): messages.append(message)
        async def backend(*_): await gate.wait()
        budget = budget_module.AnalysisKeyBudget(backend)
        tasks = [asyncio.create_task(budget(self.scope(str(i/10)),None,send)) for i in range(1,5)]
        await asyncio.sleep(0)
        await budget(self.scope('.5'),None,send)
        self.assertEqual(messages[0]['status'],429)
        self.assertIn((b'retry-after',b'60'),messages[0]['headers'])
        self.assertEqual(len(budget.active),4)
        gate.set()
        await asyncio.gather(*tasks)
        self.assertEqual(budget.active,{})

    async def test_same_key_parallel_reads_are_preserved(self):
        gate = asyncio.Event()
        async def backend(*_): await gate.wait()
        budget = budget_module.AnalysisKeyBudget(backend)
        tasks = [asyncio.create_task(budget(self.scope('.20'),None,None)) for _ in range(8)]
        await asyncio.sleep(0)
        self.assertEqual(budget.active,{('coordinated',.2):8})
        gate.set()
        await asyncio.gather(*tasks)
        self.assertEqual(budget.active,{})

    async def test_exception_releases_slot(self):
        async def backend(*_): raise RuntimeError('synthetic failure')
        budget=budget_module.AnalysisKeyBudget(backend)
        with self.assertRaises(RuntimeError): await budget(self.scope(),None,None)
        self.assertEqual(budget.active,{})

    async def test_cancellation_releases_slot(self):
        async def backend(*_): await asyncio.Event().wait()
        budget=budget_module.AnalysisKeyBudget(backend)
        task=asyncio.create_task(budget(self.scope(),None,None))
        await asyncio.sleep(0)
        task.cancel()
        with self.assertRaises(asyncio.CancelledError): await task
        self.assertEqual(budget.active,{})

    def test_health_mutations_and_malformed_inputs_delegate_to_original_guards(self):
        for path in ['/api/health','/api/scenarios','/']:
            scope=self.scope(); scope['path']=path
            self.assertIsNone(budget_module.AnalysisKeyBudget.key(scope))
        scope=self.scope(); scope['method']='POST'
        self.assertIsNone(budget_module.AnalysisKeyBudget.key(scope))
        for value in ['NaN','inf','0','.91','x','0.2&threshold=0.3','A'*2100]:
            self.assertIsNone(budget_module.AnalysisKeyBudget.key(self.scope(value)))


class ConfigurationTests(unittest.TestCase):
    def test_exact_origin(self):
        self.assertEqual(adapter.configuration({'REFUNDSHIELD_ORIGINS':'https://demo.onrender.com'}),
                         (10000,'demo.onrender.com','https://demo.onrender.com'))

    def test_platform_hostname(self):
        self.assertEqual(adapter.configuration({'RENDER_EXTERNAL_HOSTNAME':'demo.onrender.com'})[2],
                         'https://demo.onrender.com')

    def test_loopback_tls_validation(self):
        self.assertEqual(adapter.configuration({'REFUNDSHIELD_ORIGINS':'https://127.0.0.1:8443'})[1], '127.0.0.1')

    def test_reject_origins(self):
        for origin in ['', '*', 'http://demo.onrender.com', 'https://demo.onrender.com/',
                       'https://user:password@demo.onrender.com', 'https://demo.onrender.com?q=x',
                       'https://demo.onrender.com#fragment', 'https://demo.onrender.com,https://other.com',
                       'https://demo.onrender.com;return 200;', 'https://demo.onrender.com\n',
                       'https://DEMO.onrender.com', 'https://demo.onrender.com:443',
                       'https://demo.onrender.com:8000', 'https://192.0.2.1', 'https://[::1]',
                       'https://-demo.onrender.com', 'https://demo_.onrender.com']:
            with self.subTest(origin=origin), self.assertRaises(ValueError):
                adapter.configuration({'REFUNDSHIELD_ORIGINS': origin})

    def test_reject_ports(self):
        for port in ['80','443','-1','65536','18012','18013','19099','10000;id','1e4',' 10000']:
            with self.subTest(port=port), self.assertRaises(ValueError):
                adapter.configuration({'REFUNDSHIELD_ORIGINS':'https://demo.onrender.com','PORT':port})

    def test_valid_port(self):
        self.assertEqual(adapter.configuration({'REFUNDSHIELD_ORIGINS':'https://demo.onrender.com','PORT':'10001'})[0],10001)


class ReadinessTests(unittest.TestCase):
    def test_root_is_prohibited(self):
        with patch.object(adapter.os,'geteuid',return_value=0), self.assertRaises(OSError):
            adapter.harden_process()

    def test_private_root_probe(self):
        connection = Mock()
        response = connection.getresponse.return_value
        response.status = 200
        response.read.return_value = b'{"service":"RefundShield"}'
        with patch.object(adapter, 'UnixHTTPConnection', return_value=connection):
            self.assertTrue(adapter.backend_ready())
        connection.request.assert_called_once_with('GET','/')
        connection.close.assert_called_once()

    def test_unready_and_malformed_probe(self):
        for content in [b'not json', b'{}', b'[]', b'null']:
            connection = Mock()
            connection.getresponse.return_value.status = 200
            connection.getresponse.return_value.read.return_value = content
            with patch.object(adapter,'UnixHTTPConnection',return_value=connection):
                self.assertFalse(adapter.backend_ready())

    def test_connection_failure(self):
        connection = Mock()
        connection.request.side_effect = OSError('unavailable')
        with patch.object(adapter,'UnixHTTPConnection',return_value=connection):
            self.assertFalse(adapter.backend_ready())
        connection.close.assert_called_once()

    def test_shutdown_forwards_signals(self):
        api, web = Mock(pid=101), Mock(pid=102)
        api.poll.return_value = web.poll.return_value = None
        with patch.object(adapter.os, 'killpg') as kill:
            adapter.stop_children([('api',api),('web',web)])
        self.assertEqual(kill.call_args_list[0].args,(101,adapter.signal.SIGTERM))
        self.assertEqual(kill.call_args_list[1].args,(102,adapter.signal.SIGQUIT))

    def test_shutdown_escalates_only_timed_out_child(self):
        api = Mock(pid=101)
        api.poll.return_value = None
        api.wait.side_effect = [subprocess.TimeoutExpired('api',12),0]
        with patch.object(adapter.os,'killpg') as kill:
            adapter.stop_children([('api',api)])
        self.assertEqual(kill.call_args_list[-1].args,(101,adapter.signal.SIGKILL))


if __name__ == '__main__':
    unittest.main()
