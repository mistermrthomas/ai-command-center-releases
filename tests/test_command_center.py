"""Regression checks for Claude critique, OpenAI variable tolerance, and login redirect.

The historical private suite is not in this releases repository. These tests cover
the new provider, the session redirect, and the workflow paths those changes touch.
"""
import importlib
import io
import json
import os
import sys
import tempfile
import threading
import unittest
import urllib.error
from email.message import Message
from http.client import HTTPConnection
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'source'))
for name in ('GEMINI_API_KEY', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'OPEN_AI_KEY',
             'ACC_ADMIN_PASSWORD', 'ACC_MUSE_TOKEN', 'ACC_GROK_TOKEN'):
    os.environ.pop(name, None)
os.environ['ACC_HOST'] = '127.0.0.1'
app = importlib.import_module('app')

BRIEF = ('Compare three public coastal towns for a short holiday using published '
         'visitor information, walkability, and typical costs. Do not include personal details.')
MUSE_REPLY = json.dumps({
    'handoff': 'Use published visitor guides and prefer walkable town centers.',
    'resolved': False,
    'open_issues': ['Confirm seasonal prices'],
})


def write_spending(root, monthly_micro=10_000_000, attempts=None):
    control = root / 'control'
    control.mkdir(parents=True, exist_ok=True)
    state = {
        'format': 1,
        'owner_approved': True,
        'api_monthly_micro_usd': monthly_micro,
        'grok_monthly_runs': 20,
        'attempts': attempts or {},
        'tasks': {},
        'approval_ref': 'test-guard',
    }
    (control / 'spending.json').write_text(json.dumps(state))


class AppCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        app.DB_PATH = root / 'data' / 'command_center.db'
        app.STATE_BASE = root
        app.ADMIN_SESSIONS.clear()
        app.ADMIN_LOGIN_ATTEMPTS.clear()
        app.MUSE_TOKEN = 'm' * 40
        app.GROK_TOKEN = ''
        app.GROK_WEBHOOK_URL = ''
        app.GROK_WEBHOOK_KEY = ''
        app.PUBLIC_GATEWAY_URL = ''
        app.init_db()
        write_spending(root / 'data')
        self._schedule = app.schedule_workflow
        app.schedule_workflow = lambda cid: None
        for name in ('GEMINI_API_KEY', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'OPEN_AI_KEY'):
            os.environ.pop(name, None)

    def tearDown(self):
        app.schedule_workflow = self._schedule
        self.tmp.cleanup()

    def start(self, version, **extra):
        body = {
            'request_id': os.urandom(16).hex(),
            'owner_approved': True,
            'share_task_replies': True,
            'workflow_version': version,
            'title': 'Public coastal comparison',
            'goal': BRIEF,
            'roundtable_mode': 'collaborative',
        }
        body.update(extra)
        return app.start_discussion_workflow(body)

    def test_dialogue_plans_keep_existing_shapes(self):
        cid = 'a' * 32
        self.assertEqual([t['agent'] for t in app.dialogue_plan(cid)], ['Muse', 'Grok Bot'] * 3)
        self.assertEqual([t['agent'] for t in app.dialogue_plan(cid, True)], ['Gemini', 'Muse', 'Grok Bot'] * 3)
        self.assertEqual(
            [t['agent'] for t in app.dialogue_plan(cid, True, True)],
            ['Gemini', 'Muse', 'Claude', 'Grok Bot'] * 3,
        )
        self.assertEqual([t['agent'] for t in app.dialogue_plan(cid, False, True)][:4],
                         ['Muse', 'Claude', 'Grok Bot', 'Muse'])

    def test_openai_key_accepts_railway_name_without_echoing_it(self):
        os.environ['OPEN_AI_KEY'] = 'fixture-openai-key-not-secret'
        try:
            status = app.status()
            encoded = json.dumps(status)
            self.assertTrue(status['providers']['openai'])
            self.assertNotIn('fixture-openai-key-not-secret', encoded)
            self.assertFalse(status['providers']['claude'])
            self.assertFalse(status['providers']['gemini'])
        finally:
            os.environ.pop('OPEN_AI_KEY', None)
        self.assertFalse(app.status()['providers']['openai'])
        self.assertEqual(app.provider_api_key('openai'), '')

    def test_version_four_requires_public_safe_opt_in(self):
        with self.assertRaises(ValueError):
            self.start(4, claude_public_safe=False)
        with self.assertRaises(ValueError):
            self.start(4, claude_public_safe=True, goal='Email me at person@example.com about the trip')

    def test_missing_claude_key_skips_and_does_not_call_provider(self):
        convo = self.start(4, claude_public_safe=True)
        self.assertEqual([t['agent'] for t in convo['workflow']['turns'][:3]], ['Muse', 'Claude', 'Grok Bot'])
        self.assertEqual(convo['task_approval']['api_budget_micro_usd'], app.DISCUSSION_API_BUDGET_MICRO_USD)
        assignment = next(a for a in convo['assignments'] if a['agent'] == 'Muse')
        app.complete_assignment('Muse', assignment['id'], MUSE_REPLY)

        def explode(*args, **kwargs):
            raise AssertionError('provider was called without a key')

        with mock.patch.object(app, 'request_json', explode):
            app.advance_workflow(convo['id'])
        saved = app.fetch_conversation(convo['id'])
        self.assertEqual(saved['workflow']['claude_status'], 'unavailable')
        self.assertTrue(saved['workflow']['turns'][1]['skipped'])
        self.assertNotIn('Claude', [m['agent'] for m in saved['messages']])
        self.assertEqual(saved['workflow']['claude_status'], 'unavailable')
        self.assertIn('claude_unavailable', [event['phase'] for event in saved['workflow']['events']])

    def _claude_payload(self):
        return {
            'content': [
                {'type': 'server_tool_use', 'name': 'web_search', 'input': {'query': 'public coastal town visitor guide'}},
                {'type': 'web_search_tool_result', 'content': [
                    {'type': 'web_search_result', 'url': 'https://example.com/visitor-guide', 'title': 'Visitor guide'}
                ]},
                {'type': 'text', 'text': json.dumps({
                    'handoff': 'Prefer towns with a published visitor guide and a walkable center.',
                    'resolved': False,
                    'open_issues': ['Check seasonal access'],
                }), 'citations': [{
                    'type': 'web_search_result_location',
                    'url': 'https://example.com/visitor-guide',
                    'title': 'Visitor guide',
                }]},
            ],
            'usage': {'input_tokens': 120, 'output_tokens': 48, 'server_tool_use': {'web_search_requests': 1}},
        }

    def test_claude_reply_saves_sources_inside_discussion_and_monthly_guards(self):
        os.environ['ANTHROPIC_API_KEY'] = 'fixture-anthropic-key-not-secret'
        convo = self.start(4, claude_public_safe=True)
        assignment = next(a for a in convo['assignments'] if a['agent'] == 'Muse')
        app.complete_assignment('Muse', assignment['id'], MUSE_REPLY)
        seen = {}

        def fake_request(url, payload, headers, reject_redirects=False):
            seen['url'] = url
            seen['payload'] = payload
            seen['headers'] = headers
            seen['reject_redirects'] = reject_redirects
            return self._claude_payload()

        buf = io.StringIO()
        try:
            with mock.patch.object(app, 'request_json', fake_request), mock.patch('sys.stdout', buf):
                app.advance_workflow(convo['id'])
        finally:
            os.environ.pop('ANTHROPIC_API_KEY', None)
        saved = app.fetch_conversation(convo['id'])
        claude = next(m for m in saved['messages'] if m['agent'] == 'Claude')
        self.assertEqual(claude['source'], 'api:claude/critique')
        body = json.loads(claude['body'])
        self.assertEqual(body['grounding']['sources'][0]['uri'], 'https://example.com/visitor-guide')
        self.assertEqual(seen['url'], 'https://api.anthropic.com/v1/messages')
        self.assertEqual(seen['headers'].get('anthropic-version'), '2026-10-21')
        self.assertEqual(seen['payload']['tools'][0]['name'], 'web_search')
        self.assertEqual(seen['payload']['tools'][0]['max_uses'], 1)
        self.assertTrue(seen['reject_redirects'])
        self.assertNotIn('fixture-anthropic-key-not-secret', buf.getvalue())
        self.assertNotIn('fixture-anthropic-key-not-secret', json.dumps(saved['workflow']))
        status = app.spending_status()
        self.assertGreater(status['api_used_or_reserved_usd'], 0)
        self.assertLess(status['api_used_or_reserved_usd'], 10)
        self.assertLess(saved['workflow']['api_used_or_reserved_usd'], 0.25)
        self.assertEqual(saved['workflow']['api_budget_usd'], 0.25)

    def test_discussion_budget_blocks_claude_without_calling_provider(self):
        os.environ['ANTHROPIC_API_KEY'] = 'fixture-anthropic-key-not-secret'
        convo = self.start(4, claude_public_safe=True)
        assignment = next(a for a in convo['assignments'] if a['agent'] == 'Muse')
        app.complete_assignment('Muse', assignment['id'], MUSE_REPLY)
        with app.spend_ledger() as state:
            state['tasks'][convo['id']]['api_budget_micro_usd'] = 1
        calls = []
        try:
            with mock.patch.object(app, 'request_json', lambda *a, **k: calls.append(1) or self._claude_payload()):
                app.advance_workflow(convo['id'])
        finally:
            os.environ.pop('ANTHROPIC_API_KEY', None)
        saved = app.fetch_conversation(convo['id'])
        self.assertEqual(calls, [])
        self.assertEqual(saved['workflow']['phase'], 'blocked_claude')
        self.assertEqual(saved['workflow']['claude_failure_code'], 'budget_guard')
        self.assertNotIn('Claude', [m['agent'] for m in saved['messages']])

    def test_monthly_guard_blocks_claude(self):
        write_spending(app.DB_PATH.parent, attempts={
            'seed': {
                'kind': 'api', 'provider': 'openai', 'reference': 'seed', 'month': app.budget_month(),
                'created_at': app.utcnow(), 'reserved_micro_usd': 9_990_000, 'charged_micro_usd': 9_990_000,
                'state': 'completed',
            }
        })
        # Re-create the task inside the replaced ledger by starting after the write.
        # start_discussion reads the ledger, so write first then start.
        os.environ['ANTHROPIC_API_KEY'] = 'fixture-anthropic-key-not-secret'
        # The previous start in this method has not happened. Spending file was replaced
        # and wiped tasks, which is what we want before start.
        convo = self.start(4, claude_public_safe=True)
        assignment = next(a for a in convo['assignments'] if a['agent'] == 'Muse')
        app.complete_assignment('Muse', assignment['id'], MUSE_REPLY)
        try:
            with mock.patch.object(app, 'request_json', lambda *a, **k: self._claude_payload()):
                app.advance_workflow(convo['id'])
        finally:
            os.environ.pop('ANTHROPIC_API_KEY', None)
        saved = app.fetch_conversation(convo['id'])
        self.assertEqual(saved['workflow']['claude_failure_code'], 'budget_guard')
        self.assertIn('Monthly total API budget', saved['workflow']['note'])
        self.assertNotIn('Claude', [m['agent'] for m in saved['messages']])

    def test_provider_failure_hides_response_body(self):
        os.environ['ANTHROPIC_API_KEY'] = 'fixture-anthropic-key-not-secret'
        convo = self.start(4, claude_public_safe=True)
        assignment = next(a for a in convo['assignments'] if a['agent'] == 'Muse')
        app.complete_assignment('Muse', assignment['id'], MUSE_REPLY)

        def boom(*args, **kwargs):
            err = urllib.error.HTTPError(
                'https://api.anthropic.com/v1/messages', 401, 'no', Message(),
                io.BytesIO(b'{"leak":"SECRET_MARKER"}'))
            raise RuntimeError('Provider rejected request (HTTP 401).') from err

        buf = io.StringIO()
        try:
            with mock.patch.object(app, 'request_json', boom), mock.patch('sys.stdout', buf):
                app.advance_workflow(convo['id'])
        finally:
            os.environ.pop('ANTHROPIC_API_KEY', None)
        saved = app.fetch_conversation(convo['id'])
        self.assertEqual(saved['workflow']['claude_failure_code'], 'provider_http_401')
        self.assertNotIn('SECRET_MARKER', saved['workflow']['note'])
        self.assertNotIn('SECRET_MARKER', buf.getvalue())
        self.assertNotIn('fixture-anthropic-key-not-secret', buf.getvalue())


class LoginRedirectCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        app.DB_PATH = root / 'data' / 'command_center.db'
        app.STATE_BASE = root
        app.HOST = '0.0.0.0'
        app.PUBLIC_UI_URL = 'https://command.example'
        app.ADMIN_PASSWORD = 'p' * 20
        app.ADMIN_SESSIONS.clear()
        app.ADMIN_LOGIN_ATTEMPTS.clear()
        app.init_db()
        self.server = app.ThreadingHTTPServer(('127.0.0.1', 0), app.HostedHandler)
        self.port = self.server.server_address[1]
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        app.HOST = '127.0.0.1'
        app.PUBLIC_UI_URL = ''
        app.ADMIN_PASSWORD = ''
        self.tmp.cleanup()

    def request(self, method, path, headers=None, body=None):
        conn = HTTPConnection('127.0.0.1', self.port, timeout=5)
        merged = {'Host': 'command.example'}
        if headers:
            merged.update(headers)
        conn.request(method, path, body=body, headers=merged)
        resp = conn.getresponse()
        payload = resp.read()
        status, location, cookie = resp.status, resp.getheader('Location'), resp.getheader('Set-Cookie')
        conn.close()
        return status, location, cookie, payload

    def test_api_fetch_stays_json_and_document_navigation_redirects(self):
        status, location, _, payload = self.request('GET', '/api/status')
        self.assertEqual(status, 401)
        self.assertEqual(json.loads(payload)['error'], 'Admin login required')
        self.assertIsNone(location)
        status, location, _, payload = self.request(
            'GET', '/api/status', headers={'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'document'})
        self.assertEqual(status, 303)
        self.assertEqual(location, '/login?next=%2F')
        self.assertEqual(payload, b'')
        discussion = 'ab' * 16
        status, location, _, _ = self.request('GET', '/?discussion=' + discussion)
        self.assertEqual(status, 303)
        self.assertEqual(location, '/login?next=' + '%2F%3Fdiscussion%3D' + discussion)

    def test_bad_password_redisplays_form_and_login_returns_to_discussion(self):
        discussion = 'cd' * 16
        nxt = '/?discussion=' + discussion
        status, location, cookie, payload = self.request(
            'POST', '/login',
            headers={'Origin': 'https://command.example', 'Content-Type': 'application/x-www-form-urlencoded'},
            body='password=wrong-password&next=' + '%2F%3Fdiscussion%3D' + discussion)
        self.assertEqual(status, 401)
        text = payload.decode()
        self.assertIn('type="password"', text)
        self.assertIn('Invalid password', text)
        self.assertNotIn('{"error"', text)
        self.assertIn('value="/?discussion=' + discussion + '"', text)
        status, location, cookie, _ = self.request(
            'POST', '/login',
            headers={'Origin': 'https://command.example', 'Content-Type': 'application/x-www-form-urlencoded'},
            body='password=' + ('p' * 20) + '&next=' + '%2F%3Fdiscussion%3D' + discussion)
        self.assertEqual(status, 303)
        self.assertEqual(location, nxt)
        self.assertIn('__Host-acc_session=', cookie)
        status, location, _, payload = self.request(
            'GET', '/login?next=https://evil.example/phish')
        self.assertEqual(status, 200)
        self.assertIn('value="/"', payload.decode())
        self.assertNotIn('evil.example', payload.decode())

    def test_expired_session_redirects_back_to_the_same_discussion(self):
        discussion = 'ef' * 16
        _, _, cookie, _ = self.request(
            'POST', '/login',
            headers={'Origin': 'https://command.example', 'Content-Type': 'application/x-www-form-urlencoded'},
            body='password=' + ('p' * 20) + '&next=%2F')
        token = cookie.split(';', 1)[0]
        for key in list(app.ADMIN_SESSIONS):
            app.ADMIN_SESSIONS[key] = 0
        status, location, _, payload = self.request(
            'GET', '/?discussion=' + discussion, headers={'Cookie': token})
        self.assertEqual(status, 303)
        self.assertEqual(location, '/login?next=' + '%2F%3Fdiscussion%3D' + discussion)
        self.assertNotIn(b'Admin login required', payload)
        status, _, _, payload = self.request('GET', '/api/status', headers={'Cookie': token})
        self.assertEqual(status, 401)
        self.assertEqual(json.loads(payload)['error'], 'Admin login required')


if __name__ == '__main__':
    unittest.main()
