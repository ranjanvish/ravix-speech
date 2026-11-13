"""
RAVIX Speech Assistant - High Performance Local Bridge Server
Port: 17842 (127.0.0.1)
Connects Browser Extension <-> AI Agents (Antigravity, Claude, Cursor) <-> Local Workflows
"""
import argparse
import glob
import json
import os
from pathlib import Path
import secrets
import shutil
import sqlite3
import threading
import time
import urllib.parse
import uuid
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

BASE_DATA = Path(os.environ.get('SPEECH_BRIDGE_DATA', str(Path(__file__).resolve().parents[2] / 'speech-bridge-data'))).resolve()
BASE_DATA.mkdir(parents=True, exist_ok=True)
DB_PATH = BASE_DATA / 'jobs.sqlite3'
TOKEN_FILE = BASE_DATA / 'pairing-token.txt'
DOWNLOADS_DIR = Path(os.environ.get('USERPROFILE', 'C:/Users/ranja')) / 'Downloads'

if not TOKEN_FILE.exists():
    TOKEN_FILE.write_text(secrets.token_urlsafe(32), encoding='utf-8')
TOKEN = TOKEN_FILE.read_text(encoding='utf-8').strip()

LOCK = threading.Lock()
LATEST_CLIENT_STATE = {
    'online': False,
    'last_seen': 0,
    'page': 'unknown',
    'url': '',
    'blocks': 0,
    'speakers': [],
    'canRun': False,
    'isGenerating': False,
    'canDownload': False
}

def init_db():
    conn = sqlite3.connect(DB_PATH, timeout=10)
    with conn:
        conn.execute('''
            CREATE TABLE IF NOT EXISTS jobs (
                id TEXT PRIMARY KEY,
                action TEXT NOT NULL,
                payload TEXT NOT NULL,
                state TEXT NOT NULL,
                result TEXT,
                created REAL NOT NULL,
                updated REAL NOT NULL
            )
        ''')
    conn.close()

init_db()

def get_db():
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    return conn

class BridgeHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        # Clean logging for diagnostics
        msg = fmt % args
        if '/client/heartbeat' not in self.path and '/next' not in self.path:
            print(f"[BRIDGE {time.strftime('%H:%M:%S')}] {self.command} {self.path} - {msg}", flush=True)

    def send_cors_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')

    def reply_json(self, code, data):
        raw = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_cors_headers()
        self.end_headers()
        self.wfile.write(raw)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_cors_headers()
        self.end_headers()

    def is_authorized(self):
        # Allow localhost / loopback calls without rigid token blocks if local
        client_ip = self.client_address[0]
        if client_ip in ('127.0.0.1', '::1', 'localhost'):
            auth = self.headers.get('Authorization', '')
            if not auth:
                # Local loopback connection is trusted by default
                return True
            return auth.replace('Bearer ', '').strip() == TOKEN or secrets.compare_digest(auth, f'Bearer {TOKEN}')
        auth = self.headers.get('Authorization', '')
        return secrets.compare_digest(auth, f'Bearer {TOKEN}')

    def read_json_body(self):
        length = int(self.headers.get('Content-Length', '0'))
        if length > 10 * 1024 * 1024:
            raise ValueError('Request body too large')
        if length == 0:
            return {}
        body = self.rfile.read(length).decode('utf-8', errors='replace')
        return json.loads(body)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        # Handshake: zero-friction token exchange for local extension & agents
        if path == '/handshake':
            return self.reply_json(200, {
                'ok': True,
                'token': TOKEN,
                'status': 'online',
                'version': '1.0.6',
                'bridge': 'RAVIX-Speech-Bridge',
                'client': LATEST_CLIENT_STATE
            })

        if path == '/status':
            conn = get_db()
            try:
                cur = conn.cursor()
                cur.execute('SELECT id, action, state, result, created, updated FROM jobs ORDER BY created DESC LIMIT 50')
                rows = [dict(r) for r in cur.fetchall()]
            finally:
                conn.close()
            return self.reply_json(200, {
                'ok': True,
                'extension_connected': (time.time() - LATEST_CLIENT_STATE['last_seen']) < 5.0,
                'client': LATEST_CLIENT_STATE,
                'jobs': rows
            })

        if path == '/next':
            # Job retrieval by extension
            with LOCK:
                conn = get_db()
                try:
                    cur = conn.cursor()
                    cur.execute("SELECT * FROM jobs WHERE state = 'queued' ORDER BY created ASC LIMIT 1")
                    row = cur.fetchone()
                    if row:
                        cur.execute("UPDATE jobs SET state = 'dispatched', updated = ? WHERE id = ?", (time.time(), row['id']))
                        conn.commit()
                        payload = json.loads(row['payload'])
                        return self.reply_json(200, {
                            'ok': True,
                            'job': {
                                'id': row['id'],
                                'action': row['action'],
                                'payload': payload
                            }
                        })
                finally:
                    conn.close()
            return self.reply_json(200, {'ok': True, 'job': None})

        if path.startswith('/job/'):
            job_id = path.split('/')[-1]
            conn = get_db()
            try:
                cur = conn.cursor()
                cur.execute("SELECT * FROM jobs WHERE id = ?", (job_id,))
                row = cur.fetchone()
                if not row:
                    return self.reply_json(404, {'ok': False, 'error': 'job not found'})
                res = json.loads(row['result']) if row['result'] else None
                return self.reply_json(200, {
                    'ok': True,
                    'job': {
                        'id': row['id'],
                        'action': row['action'],
                        'state': row['state'],
                        'result': res,
                        'created': row['created'],
                        'updated': row['updated']
                    }
                })
            finally:
                conn.close()

        return self.reply_json(404, {'ok': False, 'error': f'Route {path} not found'})

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        try:
            body = self.read_json_body()
        except Exception as e:
            return self.reply_json(400, {'ok': False, 'error': f'Invalid JSON: {str(e)}'})

        # Heartbeat from browser content script / extension
        if path == '/client/heartbeat':
            LATEST_CLIENT_STATE['online'] = True
            LATEST_CLIENT_STATE['last_seen'] = time.time()
            LATEST_CLIENT_STATE['page'] = body.get('page', 'unknown')
            LATEST_CLIENT_STATE['url'] = body.get('url', '')
            LATEST_CLIENT_STATE['blocks'] = body.get('blocks', 0)
            LATEST_CLIENT_STATE['speakers'] = body.get('speakers', [])
            LATEST_CLIENT_STATE['canRun'] = body.get('canRun', False)
            LATEST_CLIENT_STATE['isGenerating'] = body.get('isGenerating', False)
            LATEST_CLIENT_STATE['canDownload'] = body.get('canDownload', False)
            return self.reply_json(200, {'ok': True, 'acknowledged': True})

        if path == '/enqueue':
            action = body.get('action')
            payload = body.get('payload', {})
            if not action:
                return self.reply_json(400, {'ok': False, 'error': 'Missing action'})
            job_id = uuid.uuid4().hex
            now = time.time()
            conn = get_db()
            try:
                with conn:
                    conn.execute(
                        "INSERT INTO jobs VALUES (?, ?, ?, ?, ?, ?, ?)",
                        (job_id, action, json.dumps(payload, ensure_ascii=False), 'queued', None, now, now)
                    )
            finally:
                conn.close()
            return self.reply_json(201, {'ok': True, 'id': job_id})

        if path == '/result':
            job_id = body.get('id')
            result = body.get('result', {})
            if not job_id:
                return self.reply_json(400, {'ok': False, 'error': 'Missing job id'})

            # If audio base64 is attached, decode and save to file immediately
            audio_data = result.get('audio')
            if isinstance(audio_data, dict) and audio_data.get('base64'):
                try:
                    import base64
                    raw_bytes = base64.b64decode(audio_data['base64'])
                    if len(raw_bytes) > 50000:
                        filename = f"Generated Audio {time.strftime('%Y%m%d_%H%M%S')}.wav"
                        save_path = DOWNLOADS_DIR / filename
                        save_path.write_bytes(raw_bytes)
                        result['audio']['saved_path'] = str(save_path)
                        print(f"[BRIDGE] Saved {len(raw_bytes)} bytes of master WAV to: {save_path}", flush=True)
                    else:
                        print(f"[BRIDGE] Ignored small sample audio ({len(raw_bytes)} bytes)", flush=True)
                except Exception as b64_err:
                    print(f"[BRIDGE] Base64 audio save warning: {b64_err}", flush=True)

            conn = get_db()
            try:
                state = 'completed' if result.get('ok') else 'failed'
                with conn:
                    cur = conn.execute(
                        "UPDATE jobs SET state = ?, result = ?, updated = ? WHERE id = ?",
                        (state, json.dumps(result, ensure_ascii=False), time.time(), job_id)
                    )
                    updated = cur.rowcount > 0
            finally:
                conn.close()
            return self.reply_json(200, {'ok': updated})

        return self.reply_json(404, {'ok': False, 'error': f'Route {path} not found'})

def run_server(port=17842):
    server = ThreadingHTTPServer(('127.0.0.1', port), BridgeHandler)
    print(f"=== RAVIX Speech Assistant Bridge ===", flush=True)
    print(f"Port: {port} on 127.0.0.1", flush=True)
    print(f"Token file: {TOKEN_FILE}", flush=True)
    print(f"Downloads dir: {DOWNLOADS_DIR}", flush=True)
    print(f"Server ready for connections...", flush=True)
    server.serve_forever()

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=17842)
    args = parser.parse_args()
    run_server(args.port)
