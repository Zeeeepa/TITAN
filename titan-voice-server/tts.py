"""
TITAN Voice Server — TTS abstraction (Kokoro default, Orpheus optional)
"""
import numpy as np
import io
from abc import ABC, abstractmethod
from config import cfg


class TTSEngine(ABC):
    """Base class for TTS engines."""

    @abstractmethod
    def synthesize(self, text: str, voice: str | None = None) -> np.ndarray:
        """Synthesize text to PCM float32 audio at TTS_SAMPLE_RATE."""
        ...

    @abstractmethod
    def stream(self, text: str, voice: str | None = None):
        """Yield audio chunks as they're generated (for streaming)."""
        ...


class KokoroTTS(TTSEngine):
    """Kokoro TTS — 82M params, runs on CPU at ~210x realtime. Zero VRAM."""

    def __init__(self):
        import kokoro
        self._pipeline = kokoro.KPipeline(lang_code="a")  # American English
        self._voice = cfg.TTS_VOICE

    def synthesize(self, text: str, voice: str | None = None) -> np.ndarray:
        voice = voice or self._voice
        chunks = []
        for result in self._pipeline(text, voice=voice):
            if result.audio is not None:
                chunks.append(result.audio.numpy() if hasattr(result.audio, 'numpy') else np.array(result.audio))
        if not chunks:
            return np.array([], dtype=np.float32)
        return np.concatenate(chunks)

    def stream(self, text: str, voice: str | None = None):
        """Yield audio chunks as numpy float32 arrays."""
        voice = voice or self._voice
        for result in self._pipeline(text, voice=voice):
            if result.audio is not None:
                audio = result.audio.numpy() if hasattr(result.audio, 'numpy') else np.array(result.audio)
                yield audio


class OrpheusTTS(TTSEngine):
    """Orpheus 3B TTS — high quality, requires ~4-6GB VRAM."""

    def __init__(self):
        try:
            from orpheus_tts import OrpheusModel
            self._model = OrpheusModel(model_name="canopylabs/orpheus-3b-0.1-ft")
        except ImportError:
            raise ImportError("Orpheus TTS requires: pip install orpheus-tts")

    def synthesize(self, text: str, voice: str | None = None) -> np.ndarray:
        voice = voice or "tara"
        chunks = list(self._model.generate_speech(prompt=text, voice=voice))
        if not chunks:
            return np.array([], dtype=np.float32)
        return np.concatenate(chunks)

    def stream(self, text: str, voice: str | None = None):
        voice = voice or "tara"
        for chunk in self._model.generate_speech(prompt=text, voice=voice):
            yield chunk


def create_tts_engine() -> TTSEngine:
    """Factory: create the configured TTS engine."""
    engine = cfg.TTS_ENGINE.lower()
    if engine == "kokoro":
        return KokoroTTS()
    elif engine == "orpheus":
        return OrpheusTTS()
    else:
        raise ValueError(f"Unknown TTS engine: {engine}. Use 'kokoro' or 'orpheus'.")
