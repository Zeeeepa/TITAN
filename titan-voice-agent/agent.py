"""
TITAN Voice Agent — LiveKit Agents SDK v1.4+
Fully local STT + TTS. TITAN Gateway is the brain (no local LLM routing).
"""
import os
import logging
import aiohttp
from dotenv import load_dotenv

from livekit.agents import (
    AgentServer,
    AgentSession,
    Agent,
    JobContext,
    RunContext,
    UserInputTranscribedEvent,
    cli,
    function_tool,
)
from livekit.plugins import silero, openai
from livekit.plugins.turn_detector.multilingual import MultilingualModel
from kokoro_tts import KokoroTTS

load_dotenv(dotenv_path=".env.local")
logger = logging.getLogger("titan-voice-agent")

TITAN_API_URL = os.getenv("TITAN_API_URL", "http://192.168.1.95:48420/api/message")
TITAN_AUTH_TOKEN = os.getenv("TITAN_AUTH_TOKEN", "")
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://192.168.1.11:11434/v1")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen3:0.6b")
STT_BASE_URL = os.getenv("STT_BASE_URL", "")
TTS_VOICE = os.getenv("TTS_VOICE", "af_heart")
KOKORO_BASE_URL = os.getenv("KOKORO_BASE_URL", "http://localhost:8880/v1")

server = AgentServer()

# Persistent TITAN session ID across turns
_titan_session_id = None


async def ask_titan_gateway(question: str) -> str:
    """Send a question directly to TITAN Gateway and return the response."""
    global _titan_session_id
    try:
        headers = {"Content-Type": "application/json"}
        if TITAN_AUTH_TOKEN:
            headers["Authorization"] = f"Bearer {TITAN_AUTH_TOKEN}"

        payload = {
            "content": f"[Voice conversation] {question}",
            "options": {"voice": True},
            "systemPrompt": (
                "The user is talking to you through voice. Keep responses concise and conversational. "
                "Do NOT use markdown, bullet points, code blocks, numbered lists, or special formatting. "
                "Speak numbers naturally (say 'seventy four degrees' not '74°F'). "
                "Keep answers to 2-3 sentences unless the user asks for detail."
            ),
        }
        if _titan_session_id:
            payload["sessionId"] = _titan_session_id

        async with aiohttp.ClientSession() as http_session:
            async with http_session.post(
                TITAN_API_URL, json=payload, headers=headers,
                timeout=aiohttp.ClientTimeout(total=60)
            ) as resp:
                if resp.status != 200:
                    return f"Sorry, I couldn't reach my brain. Status {resp.status}."
                data = await resp.json()
                _titan_session_id = data.get("sessionId", _titan_session_id)
                return data.get("content", "I got a response but it was empty.")
    except Exception as e:
        logger.error(f"TITAN Gateway error: {e}")
        return f"Sorry, I'm having trouble connecting to my backend right now."


class TitanAgent(Agent):
    """Minimal agent — greeting only. All real work goes through TITAN Gateway."""

    def __init__(self):
        super().__init__(
            instructions=(
                "You are TITAN, a helpful AI assistant. "
                "Keep responses very brief and conversational. "
                "This is voice — no markdown, no lists, no code blocks."
            ),
        )


@server.rtc_session(agent_name="titan-voice")
async def titan_session(ctx: JobContext):
    """Called when a participant joins the LiveKit room."""
    logger.info("TITAN Voice Agent starting...")

    # STT
    if STT_BASE_URL:
        stt = openai.STT(
            base_url=STT_BASE_URL,
            api_key="not-needed",
            model="Systran/faster-whisper-base",
        )
    else:
        stt = openai.STT.with_groq(model="whisper-large-v3-turbo")

    session = AgentSession(
        stt=stt,
        llm=openai.LLM.with_ollama(
            model=OLLAMA_MODEL,
            base_url=OLLAMA_BASE_URL,
        ),
        tts=KokoroTTS(base_url=KOKORO_BASE_URL, voice=TTS_VOICE),
        vad=silero.VAD.load(),
        turn_detection=MultilingualModel(),
    )

    # Intercept user speech — send to TITAN Gateway, bypass local LLM
    @session.on("user_input_transcribed")
    def on_transcript(ev: UserInputTranscribedEvent):
        if not ev.is_final:
            return
        text = ev.transcript.strip()
        if not text:
            return
        logger.info(f"User said: {text}")
        # Interrupt any current speech and route to TITAN
        import asyncio
        asyncio.create_task(_handle_user_input(session, text))

    await session.start(
        room=ctx.room,
        agent=TitanAgent(),
    )

    # Hardcoded greeting — skip LLM entirely for speed
    session.say("Hey! I'm TITAN, your AI assistant. What can I help you with?")


def _num_to_words(n: int) -> str:
    """Convert integer to spoken words."""
    if n < 0:
        return "negative " + _num_to_words(-n)
    if n == 0:
        return "zero"

    ones = ["", "one", "two", "three", "four", "five", "six", "seven",
            "eight", "nine", "ten", "eleven", "twelve", "thirteen",
            "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"]
    tens = ["", "", "twenty", "thirty", "forty", "fifty",
            "sixty", "seventy", "eighty", "ninety"]

    if n < 20:
        return ones[n]
    if n < 100:
        return tens[n // 10] + (" " + ones[n % 10] if n % 10 else "")
    if n < 1000:
        rest = _num_to_words(n % 100)
        return ones[n // 100] + " hundred" + (" " + rest if n % 100 else "")
    if n < 1000000:
        rest = _num_to_words(n % 1000)
        return _num_to_words(n // 1000) + " thousand" + (" " + rest if n % 1000 else "")
    if n < 1000000000:
        rest = _num_to_words(n % 1000000)
        return _num_to_words(n // 1000000) + " million" + (" " + rest if n % 1000000 else "")
    return str(n)


def normalize_for_speech(text: str) -> str:
    """Clean up text for natural TTS output."""
    import re

    # Strip markdown formatting
    text = re.sub(r'\*\*(.+?)\*\*', r'\1', text)  # bold
    text = re.sub(r'\*(.+?)\*', r'\1', text)  # italic
    text = re.sub(r'`(.+?)`', r'\1', text)  # inline code
    text = re.sub(r'```[\s\S]*?```', '', text)  # code blocks
    text = re.sub(r'^#{1,6}\s+', '', text, flags=re.MULTILINE)  # headings
    text = re.sub(r'^\s*[-*]\s+', '', text, flags=re.MULTILINE)  # bullet points
    text = re.sub(r'^\s*\d+\.\s+', '', text, flags=re.MULTILINE)  # numbered lists

    # Remove emojis (common unicode ranges)
    text = re.sub(
        r'[\U0001F600-\U0001F64F\U0001F300-\U0001F5FF\U0001F680-\U0001F6FF'
        r'\U0001F1E0-\U0001F1FF\U00002702-\U000027B0\U0001F900-\U0001F9FF'
        r'\U0001FA00-\U0001FA6F\U0001FA70-\U0001FAFF\U00002600-\U000026FF'
        r'\U0000FE00-\U0000FE0F\U0000200D]+', '', text
    )

    # Units and abbreviations → spoken form (before number expansion)
    unit_map = {
        '°F': ' degrees Fahrenheit', '°C': ' degrees Celsius', '°': ' degrees',
        'mph': 'miles per hour', 'km/h': 'kilometers per hour', 'kph': 'kilometers per hour',
        'ft': 'feet', 'in': 'inches', 'lbs': 'pounds', 'lb': 'pounds',
        'kg': 'kilograms', 'km': 'kilometers', 'mi': 'miles',
        'mm': 'millimeters', 'cm': 'centimeters', 'm/s': 'meters per second',
        'GB': 'gigabytes', 'MB': 'megabytes', 'KB': 'kilobytes', 'TB': 'terabytes',
        'GHz': 'gigahertz', 'MHz': 'megahertz',
        '%': ' percent', 'hrs': 'hours', 'hr': 'hour', 'mins': 'minutes', 'min': 'minutes',
        'sec': 'seconds', 'ms': 'milliseconds',
    }
    for abbr, spoken in unit_map.items():
        # Match number + optional space + unit (word boundary for non-symbol units)
        if abbr[0].isalpha():
            text = re.sub(r'(\d)\s*' + re.escape(abbr) + r'\b', r'\1 ' + spoken, text)
        else:
            text = re.sub(r'(\d)\s*' + re.escape(abbr), r'\1 ' + spoken, text)

    # Compass directions (longest first to avoid partial matches)
    compass = {
        'NNE': 'north northeast', 'NNW': 'north northwest',
        'SSE': 'south southeast', 'SSW': 'south southwest',
        'ENE': 'east northeast', 'ESE': 'east southeast',
        'WNW': 'west northwest', 'WSW': 'west southwest',
        'NE': 'northeast', 'NW': 'northwest',
        'SE': 'southeast', 'SW': 'southwest',
        'N': 'north', 'S': 'south', 'E': 'east', 'W': 'west',
    }
    for abbr, spoken in compass.items():
        text = re.sub(r'\b' + abbr + r'\b', spoken, text)

    # Common abbreviations
    text = re.sub(r'\be\.g\.\s*', 'for example ', text)
    text = re.sub(r'\bi\.e\.\s*', 'that is ', text)
    text = re.sub(r'\betc\.\s*', 'etcetera ', text)
    text = re.sub(r'\bvs\.?\s', 'versus ', text)
    text = re.sub(r'\bapprox\.?\s', 'approximately ', text)
    text = re.sub(r'\bw/\s', 'with ', text)
    text = re.sub(r'\bw/o\s', 'without ', text)

    # Time expressions: "3:45 PM" → "three forty five PM"
    def replace_time(m):
        h, mn, ampm = int(m.group(1)), m.group(2), m.group(3) or ''
        hour = _num_to_words(h)
        if mn == '00':
            if ampm:
                return f"{hour} {ampm}"
            return f"{hour} o'clock"
        elif mn[0] == '0':
            minute = "oh " + _num_to_words(int(mn))
        else:
            minute = _num_to_words(int(mn))
        return f"{hour} {minute} {ampm}".strip()

    text = re.sub(r'\b(\d{1,2}):(\d{2})\s*(AM|PM|am|pm|a\.m\.|p\.m\.)?', replace_time, text)

    # Dates: "March 9, 2026" → "March ninth, twenty twenty six"
    ordinals = {1: 'first', 2: 'second', 3: 'third', 4: 'fourth', 5: 'fifth',
                6: 'sixth', 7: 'seventh', 8: 'eighth', 9: 'ninth', 10: 'tenth',
                11: 'eleventh', 12: 'twelfth', 13: 'thirteenth', 14: 'fourteenth',
                15: 'fifteenth', 16: 'sixteenth', 17: 'seventeenth', 18: 'eighteenth',
                19: 'nineteenth', 20: 'twentieth', 21: 'twenty first', 22: 'twenty second',
                23: 'twenty third', 24: 'twenty fourth', 25: 'twenty fifth',
                26: 'twenty sixth', 27: 'twenty seventh', 28: 'twenty eighth',
                29: 'twenty ninth', 30: 'thirtieth', 31: 'thirty first'}

    def replace_date(m):
        month, day = m.group(1), int(m.group(2))
        year_str = m.group(3) or ''
        day_word = ordinals.get(day, _num_to_words(day))
        if year_str:
            yr = int(year_str)
            if 2000 <= yr <= 2009:
                year_word = _num_to_words(yr)
            elif 2010 <= yr <= 2099:
                year_word = "twenty " + _num_to_words(yr - 2000)
            elif 1900 <= yr <= 1999:
                year_word = "nineteen " + _num_to_words(yr - 1900)
            else:
                year_word = _num_to_words(yr)
            return f"{month} {day_word}, {year_word}"
        return f"{month} {day_word}"

    months = r'(?:January|February|March|April|May|June|July|August|September|October|November|December)'
    text = re.sub(months + r'\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})?', replace_date, text)

    # Decimals: "3.5" → "three point five"
    def replace_decimal(m):
        whole = _num_to_words(int(m.group(1)))
        decimals = ' '.join(_num_to_words(int(d)) for d in m.group(2))
        return f"{whole} point {decimals}"

    text = re.sub(r'\b(\d+)\.(\d+)\b', replace_decimal, text)

    # Money: "$45" → "forty five dollars", "$3.50" → "three dollars and fifty cents"
    def replace_money(m):
        symbol, amount = m.group(1), m.group(2)
        currency = 'dollars' if symbol == '$' else 'pounds' if symbol == '£' else 'euros'
        cents_name = 'cents' if symbol == '$' else 'pence' if symbol == '£' else 'cents'
        if '.' in amount:
            whole, frac = amount.split('.')
            frac = frac.ljust(2, '0')[:2]
            result = _num_to_words(int(whole)) + f" {currency}"
            if int(frac) > 0:
                result += " and " + _num_to_words(int(frac)) + f" {cents_name}"
            return result
        return _num_to_words(int(amount)) + f" {currency}"

    text = re.sub(r'([$£€])(\d+(?:\.\d{1,2})?)', replace_money, text)

    # Fractions: "1/2" → "one half", "3/4" → "three quarters"
    fraction_names = {
        (1, 2): 'one half', (1, 3): 'one third', (2, 3): 'two thirds',
        (1, 4): 'one quarter', (3, 4): 'three quarters',
        (1, 5): 'one fifth', (2, 5): 'two fifths', (3, 5): 'three fifths',
        (4, 5): 'four fifths', (1, 8): 'one eighth', (3, 8): 'three eighths',
    }

    def replace_fraction(m):
        num, den = int(m.group(1)), int(m.group(2))
        return fraction_names.get((num, den), f"{_num_to_words(num)} over {_num_to_words(den)}")

    text = re.sub(r'\b(\d+)/(\d+)\b', replace_fraction, text)

    # Ordinal suffixes: "1st" → "first", "23rd" → "twenty third"
    def replace_ordinal(m):
        n = int(m.group(1))
        if n in ordinals:
            return ordinals[n]
        word = _num_to_words(n)
        if word.endswith('y'):
            return word[:-1] + 'ieth'
        elif word.endswith('one'):
            return word[:-3] + 'first'
        elif word.endswith('two'):
            return word[:-3] + 'second'
        elif word.endswith('three'):
            return word[:-5] + 'third'
        elif word.endswith('ve'):
            return word[:-2] + 'fth'
        elif word.endswith('eight'):
            return word + 'h'
        elif word.endswith('nine'):
            return word[:-1] + 'th'
        elif word.endswith('t'):
            return word + 'h'
        return word + 'th'

    text = re.sub(r'\b(\d+)(?:st|nd|rd|th)\b', replace_ordinal, text)

    # Phone-style numbers: keep digit-by-digit for 7+ digits without commas (phone, zip+4)
    # Already handled naturally since we only expand comma-grouped or short numbers

    # URLs and emails → just say "a link" or skip
    text = re.sub(r'https?://\S+', 'a link', text)
    text = re.sub(r'\S+@\S+\.\S+', 'an email address', text)

    # Expand remaining numbers to words (up to 999,999,999)
    def replace_number(m):
        num_str = m.group(0).replace(',', '')
        try:
            n = int(num_str)
            if n > 999999999:
                return num_str
            return _num_to_words(n)
        except ValueError:
            return num_str

    text = re.sub(r'\b\d{1,3}(?:,\d{3})*\b', replace_number, text)

    # Symbols that TTS might read wrong
    text = text.replace('&', ' and ')
    text = text.replace('+', ' plus ')
    text = text.replace('=', ' equals ')
    text = text.replace('<', ' less than ')
    text = text.replace('>', ' greater than ')
    text = text.replace('~', ' approximately ')
    text = text.replace('/', ' slash ')

    # Clean up parentheses and brackets
    text = re.sub(r'[(\[{}\])]', '', text)

    # Normalize whitespace and ensure sentence spacing
    text = re.sub(r'\n+', '. ', text)
    text = re.sub(r'\s+', ' ', text)
    text = re.sub(r'\.\s*\.', '.', text)  # collapse double periods
    text = re.sub(r',\s*\.', '.', text)  # trailing comma before period
    text = text.strip()

    return text


async def _handle_user_input(session: AgentSession, text: str):
    """Route user input to TITAN Gateway and speak the response."""
    logger.info(f"Routing to TITAN Gateway: {text}")
    response = await ask_titan_gateway(text)
    response = normalize_for_speech(response)
    logger.info(f"TITAN response: {response[:100]}...")
    session.say(response)


if __name__ == "__main__":
    cli.run_app(server)
