"""
TITAN Voice Server — faster-whisper STT wrapper
"""
import numpy as np
from faster_whisper import WhisperModel
from config import cfg


class SpeechToText:
    """faster-whisper transcription with GPU acceleration."""

    def __init__(self):
        self.model = WhisperModel(
            cfg.STT_MODEL,
            device=cfg.STT_DEVICE,
            compute_type=cfg.STT_COMPUTE_TYPE,
            download_root=cfg.MODEL_DIR,
        )

    def transcribe(self, audio: np.ndarray) -> str:
        """
        Transcribe a numpy float32 audio array (16kHz, mono).
        Returns the transcribed text.
        """
        segments, info = self.model.transcribe(
            audio,
            beam_size=5,
            language="en",
            vad_filter=False,  # We already run Silero VAD upstream
            without_timestamps=True,
        )
        text = " ".join(seg.text.strip() for seg in segments).strip()
        return text
