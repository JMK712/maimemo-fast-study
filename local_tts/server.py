"""Loopback-only Kokoro speech service for the MaiMemo extension."""

from __future__ import annotations

import base64
import hmac
import io
import json
import os
import sys
import threading
import wave
from functools import lru_cache
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PORT = 8765
VOICES = frozenset({'af_heart', 'af_bella', 'af_sarah', 'am_michael'})
DATA_DIR = Path(os.environ.get('MAIMEMO_TTS_HOME', Path.home() / 'AppData/Local/MaiMemoFastStudy'))
SECRET_FILE = DATA_DIR / 'secret.txt'
MODEL_FILE = DATA_DIR / 'models/kokoro-v1.0.onnx'
VOICES_FILE = DATA_DIR / 'models/voices-v1.0.bin'
_model = None
_model_lock = threading.Lock()


@lru_cache(maxsize=96)
def synthesize(text: str, voice: str, rate: float) -> str:
    import numpy as np

    with _model_lock:
        # Kokoro's ONNX runtime session is shared, including across HTTP threads.
        model = get_model_unlocked()
        samples, sample_rate = model.create(text, voice=voice, speed=rate, lang='en-us')
    pcm = (np.clip(samples, -1, 1) * 32767).astype('<i2')
    stream = io.BytesIO()
    with wave.open(stream, 'wb') as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        wav.writeframes(pcm.tobytes())
    return base64.b64encode(stream.getvalue()).decode('ascii')


def get_model_unlocked():
    global _model
    if _model is None:
        from kokoro_onnx import Kokoro
        _model = Kokoro(str(MODEL_FILE), str(VOICES_FILE))
    return _model


class Handler(BaseHTTPRequestHandler):
    server_version = 'MaiMemoLocalTTS/1.0'

    def log_message(self, format, *args):
        print(format % args, file=sys.stderr, flush=True)

    def _reply(self, status: int, payload: dict):
        data = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        self.wfile.write(data)

    def _authorized(self):
        if self.headers.get('Host') != f'127.0.0.1:{PORT}':
            return False
        origin = self.headers.get('Origin')
        if origin and not origin.startswith('chrome-extension://'):
            return False
        expected = SECRET_FILE.read_text(encoding='ascii').strip()
        supplied = self.headers.get('X-MaiMemo-Token', '')
        return bool(expected) and hmac.compare_digest(expected, supplied)

    def do_POST(self):
        if self.path != '/v1/speech':
            self._reply(404, {'error': 'Not found'})
            return
        if not self._authorized():
            self._reply(403, {'error': 'Forbidden'})
            return
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size <= 4096:
                raise ValueError('Invalid body size')
            request = json.loads(self.rfile.read(size))
            text = request['text']
            voice = request['voice']
            rate = request['rate']
            if not isinstance(text, str) or not text.strip() or len(text) > 600:
                raise ValueError('Invalid text')
            if voice not in VOICES or isinstance(rate, bool) or not isinstance(rate, (int, float)) or not 0.5 <= rate <= 2:
                raise ValueError('Invalid voice or rate')
            audio = synthesize(text, voice, round(float(rate), 2))
        except (ValueError, KeyError, TypeError, json.JSONDecodeError) as error:
            self._reply(400, {'error': str(error)})
            return
        except Exception as error:
            self._reply(503, {'error': str(error)})
            return
        self._reply(200, {'audio': audio})


if __name__ == '__main__':
    if not SECRET_FILE.is_file() or not MODEL_FILE.is_file() or not VOICES_FILE.is_file():
        raise SystemExit('Run install.ps1 first; model files or local token are missing.')
    server = ThreadingHTTPServer(('127.0.0.1', PORT), Handler)
    print(f'Local speech service listening on 127.0.0.1:{PORT}', flush=True)
    server.serve_forever()
