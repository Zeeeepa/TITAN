"""
Kokoro TTS plugin for LiveKit Agents.
Talks to a Kokoro-FastAPI server (OpenAI-compatible /v1/audio/speech endpoint).
Based on: https://github.com/taresh18/livekit-kokoro
"""
import logging
import time
from dataclasses import dataclass
from typing import Optional

import httpx
import openai

from livekit.agents import (
    APIConnectionError,
    APIConnectOptions,
    APIStatusError,
    APITimeoutError,
    tts,
)
from livekit.agents.types import (
    DEFAULT_API_CONNECT_OPTIONS,
    NOT_GIVEN,
    NotGivenOr,
)
from livekit.agents.utils import is_given

logger = logging.getLogger(__name__)

TTS_SAMPLE_RATE = 24000
TTS_CHANNELS = 1


@dataclass
class KokoroTTSOptions:
    model: str
    voice: str
    speed: float


class KokoroTTS(tts.TTS):
    """TTS using Kokoro via OpenAI-compatible API (Kokoro-FastAPI server)."""

    def __init__(
        self,
        base_url: str = "http://localhost:8880/v1",
        api_key: str = "not-needed",
        model: str = "kokoro",
        voice: str = "af_heart",
        speed: float = 1.0,
        client: Optional[openai.AsyncClient] = None,
    ) -> None:
        logger.info(f"Kokoro TTS API: {base_url}")

        super().__init__(
            capabilities=tts.TTSCapabilities(streaming=False),
            sample_rate=TTS_SAMPLE_RATE,
            num_channels=TTS_CHANNELS,
        )

        self._opts = KokoroTTSOptions(model=model, voice=voice, speed=speed)

        self._client = client or openai.AsyncClient(
            max_retries=0,
            api_key=api_key,
            base_url=base_url,
            http_client=httpx.AsyncClient(
                timeout=httpx.Timeout(connect=15.0, read=5.0, write=5.0, pool=5.0),
                follow_redirects=True,
                limits=httpx.Limits(
                    max_connections=50,
                    max_keepalive_connections=50,
                    keepalive_expiry=120,
                ),
            ),
        )

    def update_options(
        self,
        *,
        model: NotGivenOr[str] = NOT_GIVEN,
        voice: NotGivenOr[str] = NOT_GIVEN,
        speed: NotGivenOr[float] = NOT_GIVEN,
    ) -> None:
        if is_given(model):
            self._opts.model = model
        if is_given(voice):
            self._opts.voice = voice
        if is_given(speed):
            self._opts.speed = speed

    def synthesize(
        self,
        text: str,
        *,
        conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS,
    ) -> "KokoroTTSStream":
        return KokoroTTSStream(
            tts=self,
            input_text=text,
            conn_options=conn_options,
            opts=self._opts,
            client=self._client,
        )


class KokoroTTSStream(tts.ChunkedStream):
    def __init__(self, *, tts, input_text, conn_options, opts, client):
        super().__init__(tts=tts, input_text=input_text, conn_options=conn_options)
        self._client = client
        self._opts = opts

    async def _run(self, output_emitter: tts.AudioEmitter) -> None:
        oai_stream = self._client.audio.speech.with_streaming_response.create(
            input=self.input_text,
            model=self._opts.model,
            voice=self._opts.voice,
            response_format="pcm",
            speed=self._opts.speed,
            timeout=httpx.Timeout(30, connect=self._conn_options.timeout),
        )

        try:
            start_time = time.time()
            async with oai_stream as stream:
                output_emitter.initialize(
                    request_id=stream.request_id or "",
                    sample_rate=TTS_SAMPLE_RATE,
                    num_channels=TTS_CHANNELS,
                    mime_type="audio/pcm",
                )

                async for data in stream.iter_bytes():
                    output_emitter.push(data)

            output_emitter.flush()
            logger.info(f"Kokoro TTS done in {(time.time() - start_time)*1000:.0f}ms")

        except openai.APITimeoutError:
            raise APITimeoutError()
        except openai.APIStatusError as e:
            raise APIStatusError(
                e.message, status_code=e.status_code,
                request_id=e.request_id, body=e.body,
            )
        except Exception as e:
            raise APIConnectionError() from e
