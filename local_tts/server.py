"""Loopback-only Kokoro speech service for the MaiMemo extension."""

from __future__ import annotations

import base64
import hmac
import io
import json
import os
import sys
import threading
import time
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
_prefetch_state = threading.Condition()
_prefetch_generation = 0
_interactive_waiters = 0
_prefetch_signature = None
_prefetch_texts = ()
_prefetch_second_played = False
_prefetch_third_played = False
_third_use_score = 0.25
_inflight = {}
_inflight_lock = threading.Lock()


@lru_cache(maxsize=96)
def synthesize(text: str, voice: str, rate: float) -> str:
    key = (text, voice, rate)
    with _inflight_lock:
        flight = _inflight.get(key)
        leader = flight is None
        if leader:
            flight = {'event': threading.Event(), 'result': None, 'error': None}
            _inflight[key] = flight
    if not leader:
        flight['event'].wait()
        if flight['error'] is not None:
            raise flight['error']
        return flight['result']
    try:
        audio = render_audio(text, voice, rate)
        flight['result'] = audio
        return audio
    except BaseException as error:
        flight['error'] = error
        raise
    finally:
        with _inflight_lock:
            _inflight.pop(key, None)
            flight['event'].set()


def render_audio(text: str, voice: str, rate: float) -> str:
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


def prefetch_sentences(texts: list[str], voice: str, rate: float, generation: int):
    for index, text in enumerate(texts):
        with _prefetch_state:
            if index == 2 and _third_use_score < 0.5:
                ready_at = time.monotonic() + 8
                while generation == _prefetch_generation and not _prefetch_second_played:
                    remaining = ready_at - time.monotonic()
                    if remaining <= 0:
                        break
                    _prefetch_state.wait(timeout=remaining)
            while _interactive_waiters and generation == _prefetch_generation:
                _prefetch_state.wait(timeout=0.25)
            if generation != _prefetch_generation:
                return
        try:
            synthesize(text, voice, rate)
        except Exception as error:
            print(f'Prefetch skipped: {error}', file=sys.stderr, flush=True)
            return


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
        global _prefetch_generation, _interactive_waiters, _prefetch_signature
        global _prefetch_texts, _prefetch_second_played, _prefetch_third_played, _third_use_score
        if self.path not in ('/v1/speech', '/v1/prefetch'):
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
            voice = request['voice']
            rate = request['rate']
            if voice not in VOICES or isinstance(rate, bool) or not isinstance(rate, (int, float)) or not 0.5 <= rate <= 2:
                raise ValueError('Invalid voice or rate')
            rate = round(float(rate), 2)
            if self.path == '/v1/prefetch':
                texts = request['texts']
                if not isinstance(texts, list) or not 1 <= len(texts) <= 3 or any(
                    not isinstance(text, str) or not text.strip() or len(text) > 600 for text in texts
                ):
                    raise ValueError('Invalid prefetch texts')
                with _prefetch_state:
                    signature = (tuple(texts), voice, rate)
                    duplicate = signature == _prefetch_signature
                    if not duplicate:
                        if len(_prefetch_texts) >= 3:
                            _third_use_score = 0.75 * _third_use_score + 0.25 * int(_prefetch_third_played)
                        _prefetch_signature = signature
                        _prefetch_texts = tuple(texts)
                        _prefetch_second_played = False
                        _prefetch_third_played = False
                        _prefetch_generation += 1
                        generation = _prefetch_generation
                        _prefetch_state.notify_all()
                if not duplicate:
                    threading.Thread(target=prefetch_sentences, args=(texts, voice, rate, generation), daemon=True).start()
                self._reply(202, {'queued': True})
                return
            text = request['text']
            if not isinstance(text, str) or not text.strip() or len(text) > 600:
                raise ValueError('Invalid text')
            with _prefetch_state:
                _interactive_waiters += 1
                if _prefetch_signature and (voice, rate) == _prefetch_signature[1:]:
                    if len(_prefetch_texts) >= 2 and text == _prefetch_texts[1]:
                        _prefetch_second_played = True
                    if len(_prefetch_texts) >= 3 and text == _prefetch_texts[2]:
                        _prefetch_third_played = True
                    _prefetch_state.notify_all()
            try:
                audio = synthesize(text, voice, rate)
            finally:
                with _prefetch_state:
                    _interactive_waiters -= 1
                    _prefetch_state.notify_all()
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
