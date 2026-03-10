"""
TITAN Voice Server — VAD → STT → TITAN API → TTS pipeline
Orchestrates the full voice conversation loop over a WebSocket connection.
"""
import asyncio
import json
import logging
import re
import time
import numpy as np
import httpx
from fastapi import WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState

from config import cfg
from vad import VoiceActivityDetector
from stt import SpeechToText
from tts import create_tts_engine, TTSEngine

log = logging.getLogger("titan-voice")


class VoicePipeline:
    """One pipeline instance per WebSocket connection."""

    def __init__(self, ws: WebSocket, vad: VoiceActivityDetector, stt: SpeechToText, tts: TTSEngine):
        self.ws = ws
        self.vad = vad
        self.stt = stt
        self.tts = tts
        self.tts_voice: str = cfg.TTS_VOICE
        self._cancelled = False
        self._tts_task: asyncio.Task | None = None
        self._session_id: str | None = None
        self._was_speaking = False

    async def send_json(self, data: dict):
        """Send a JSON message if the connection is open."""
        try:
            if self.ws.client_state == WebSocketState.CONNECTED:
                await self.ws.send_text(json.dumps(data))
        except Exception as e:
            log.error("Failed to send JSON: %s", e)

    async def send_audio(self, audio: np.ndarray):
        """Send PCM audio (24kHz, 16-bit, mono) as binary frames."""
        if self.ws.client_state != WebSocketState.CONNECTED:
            return
        # Convert float32 to int16 PCM
        pcm = (audio * 32767).astype(np.int16).tobytes()
        # Send in ~4096 byte chunks for smooth streaming
        chunk_size = 4096
        for i in range(0, len(pcm), chunk_size):
            if self._cancelled:
                return
            try:
                await self.ws.send_bytes(pcm[i : i + chunk_size])
            except Exception:
                return
            await asyncio.sleep(0)

    def interrupt(self):
        """Cancel current TTS playback."""
        self._cancelled = True
        if self._tts_task and not self._tts_task.done():
            self._tts_task.cancel()

    async def handle_audio(self, pcm_data: bytes):
        """Process incoming PCM audio from the browser."""
        result = self.vad.process_chunk(pcm_data)

        # Detect state transitions
        now_speaking = result["speaking"]
        if now_speaking and not self._was_speaking:
            # Speech started
            log.info("VAD: speech started")
            await self.send_json({"type": "vad", "speaking": True})
            # Interrupt any ongoing TTS
            if self._tts_task and not self._tts_task.done():
                self.interrupt()
        elif not now_speaking and self._was_speaking and not result["speech_end"]:
            # Brief silence (not yet speech_end)
            pass

        self._was_speaking = now_speaking

        if result["speech_end"] and result["audio"] is not None:
            log.info("VAD: speech ended (%.1fs of audio)", len(result["audio"]) / cfg.STT_SAMPLE_RATE)
            await self.send_json({"type": "vad", "speaking": False})

            # Transcribe
            audio_array = result["audio"]
            t0 = time.monotonic()
            text = await asyncio.get_event_loop().run_in_executor(
                None, self.stt.transcribe, audio_array
            )
            stt_ms = (time.monotonic() - t0) * 1000
            log.info("STT (%.0fms): \"%s\"", stt_ms, text)

            if not text or text.isspace():
                log.info("STT returned empty — ignoring")
                return

            await self.send_json({"type": "transcription", "text": text, "final": True})

            # Send to TITAN and stream TTS response
            self._cancelled = False
            self._tts_task = asyncio.create_task(self._process_response(text))

    async def _process_response(self, text: str):
        """Send text to TITAN API and stream TTS audio back."""
        await self.send_json({"type": "thinking"})

        try:
            headers = {"Content-Type": "application/json"}
            if cfg.TITAN_AUTH_TOKEN:
                headers["Authorization"] = f"Bearer {cfg.TITAN_AUTH_TOKEN}"

            # Wrap with voice instruction so the LLM responds naturally for speech
            voice_prefix = (
                "[Voice conversation — respond in natural spoken language. "
                "No markdown, no bullet points, no asterisks, no code blocks. "
                "Keep answers concise and conversational, like you're talking to a friend.]\n\n"
            )
            body = {"content": voice_prefix + text, "channel": "voice"}
            if self._session_id:
                body["sessionId"] = self._session_id

            log.info("TITAN API → POST %s: %s", cfg.TITAN_API_URL, text[:100])
            t0 = time.monotonic()
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(cfg.TITAN_API_URL, json=body, headers=headers)
                resp.raise_for_status()
                data = resp.json()
            api_ms = (time.monotonic() - t0) * 1000
            log.info("TITAN API ← (%.0fms) sessionId=%s", api_ms, data.get("sessionId", "?"))

            response_text = data.get("content", "")
            self._session_id = data.get("sessionId", self._session_id)

            # Strip markdown for TTS (asterisks, headers, code blocks, links)
            tts_text = response_text
            tts_text = re.sub(r'```[\s\S]*?```', '', tts_text)  # code blocks
            tts_text = re.sub(r'`([^`]+)`', r'\1', tts_text)    # inline code
            tts_text = re.sub(r'\*\*\*(.+?)\*\*\*', r'\1', tts_text)  # bold italic
            tts_text = re.sub(r'\*\*(.+?)\*\*', r'\1', tts_text)      # bold
            tts_text = re.sub(r'\*(.+?)\*', r'\1', tts_text)          # italic
            tts_text = re.sub(r'^#{1,6}\s+', '', tts_text, flags=re.MULTILINE)  # headers
            tts_text = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', tts_text)  # links
            tts_text = re.sub(r'^[-*]\s+', '', tts_text, flags=re.MULTILINE)  # list bullets
            tts_text = re.sub(r'\n{2,}', '. ', tts_text)  # collapse newlines
            tts_text = tts_text.strip()

            if not response_text:
                log.warning("TITAN returned empty content")
                return

            if self._cancelled:
                log.info("Cancelled before TTS")
                return

            log.info("Response: \"%s\"", response_text[:200])
            await self.send_json({"type": "response_text", "text": response_text})

            # Stream TTS audio (use cleaned text)
            t0 = time.monotonic()
            loop = asyncio.get_event_loop()
            chunks = await loop.run_in_executor(
                None, lambda: list(self.tts.stream(tts_text, self.tts_voice))
            )
            tts_ms = (time.monotonic() - t0) * 1000
            log.info("TTS (%.0fms): %d chunks", tts_ms, len(chunks))

            for chunk in chunks:
                if self._cancelled:
                    break
                await self.send_audio(chunk)

            if not self._cancelled:
                await self.send_json({"type": "audio_done"})

        except asyncio.CancelledError:
            log.info("Pipeline cancelled")
        except Exception as e:
            log.error("Pipeline error: %s", e, exc_info=True)
            await self.send_json({"type": "error", "message": str(e)})

    async def handle_control(self, message: str):
        """Handle JSON control messages from the browser."""
        try:
            data = json.loads(message)
        except json.JSONDecodeError:
            return

        msg_type = data.get("type", "")

        if msg_type == "config":
            if "ttsVoice" in data:
                self.tts_voice = data["ttsVoice"]
                log.info("TTS voice changed to: %s", self.tts_voice)
        elif msg_type == "interrupt":
            log.info("Client interrupt")
            self.interrupt()
