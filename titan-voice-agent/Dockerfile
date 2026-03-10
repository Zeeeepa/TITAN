FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# LiveKit agent expects these env vars
ENV LIVEKIT_URL=ws://localhost:7880
ENV LIVEKIT_API_KEY=devkey
ENV LIVEKIT_API_SECRET=secret

CMD ["python", "agent.py", "start"]
