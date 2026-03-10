"""
TITAN Voice Server — FastAPI + WebSocket endpoint
Standalone Python service for voice chat (STT + TTS + VAD).
"""
import asyncio
import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from config import cfg
from vad import VoiceActivityDetector
from stt import SpeechToText
from tts import create_tts_engine, TTSEngine
from pipeline import VoicePipeline

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("titan-voice")

# Shared model instances (loaded once, shared across connections)
_stt: SpeechToText | None = None
_tts: TTSEngine | None = None


def _load_models():
    global _stt, _tts
    log.info("Loading VAD (Silero)...")
    t0 = time.monotonic()
    from vad import _get_model
    _get_model()  # Pre-load VAD model at startup
    log.info("VAD loaded in %.1fs", time.monotonic() - t0)

    log.info("Loading STT model: %s (device=%s)", cfg.STT_MODEL, cfg.STT_DEVICE)
    t0 = time.monotonic()
    _stt = SpeechToText()
    log.info("STT loaded in %.1fs", time.monotonic() - t0)

    log.info("Loading TTS engine: %s (device=%s)", cfg.TTS_ENGINE, cfg.TTS_DEVICE)
    t0 = time.monotonic()
    _tts = create_tts_engine()
    log.info("TTS loaded in %.1fs", time.monotonic() - t0)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load models on startup, cleanup on shutdown."""
    _load_models()
    log.info("TITAN Voice Server ready on %s:%d", cfg.HOST, cfg.PORT)
    log.info("  TITAN API: %s", cfg.TITAN_API_URL)
    log.info("  STT: %s (%s)", cfg.STT_MODEL, cfg.STT_DEVICE)
    log.info("  TTS: %s (%s)", cfg.TTS_ENGINE, cfg.TTS_DEVICE)
    yield
    log.info("Shutting down TITAN Voice Server")


app = FastAPI(title="TITAN Voice Server", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "stt": "ready" if _stt else "loading",
        "tts": "ready" if _tts else "loading",
        "sttModel": cfg.STT_MODEL,
        "ttsEngine": cfg.TTS_ENGINE,
        "ttsVoice": cfg.TTS_VOICE,
    }


@app.websocket("/ws/voice")
async def voice_ws(ws: WebSocket):
    await ws.accept()
    log.info("Voice WebSocket connected: %s", ws.client)

    # Each connection gets its own VAD state
    vad = VoiceActivityDetector()
    pipeline = VoicePipeline(ws, vad, _stt, _tts)

    try:
        while True:
            message = await ws.receive()

            if "bytes" in message and message["bytes"]:
                # Binary frame = PCM audio
                await pipeline.handle_audio(message["bytes"])
            elif "text" in message and message["text"]:
                # JSON control message
                await pipeline.handle_control(message["text"])
    except WebSocketDisconnect:
        log.info("Voice WebSocket disconnected: %s", ws.client)
    except Exception as e:
        log.error("Voice WebSocket error: %s", e)
    finally:
        pipeline.interrupt()
        vad.reset()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "server:app",
        host=cfg.HOST,
        port=cfg.PORT,
        log_level="info",
        ws_ping_interval=30,
        ws_ping_timeout=10,
    )
