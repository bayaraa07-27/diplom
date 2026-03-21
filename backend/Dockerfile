FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential cmake libopenblas-dev liblapack-dev \
    libx11-dev libgtk-3-dev libboost-python-dev wget \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
RUN mkdir -p face_data models

# ── Liveness model татах ──────────────────────────────────────────
RUN wget -q -O models/MiniFASNetV2.onnx \
    "https://github.com/minivision-ai/Silent-Face-Anti-Spoofing/raw/master/resources/anti_spoof_models/2.7_80x80_MiniFASNetV2.onnx" \
    && echo "✅ MiniFASNetV2 татагдлаа" \
    || echo "⚠️ MiniFASNetV2 татахад алдаа — runtime-д дахин оролдоно"

RUN wget -q -O models/MiniFASNetV1SE.onnx \
    "https://github.com/minivision-ai/Silent-Face-Anti-Spoofing/raw/master/resources/anti_spoof_models/4_0_0_80x80_MiniFASNetV1SE.onnx" \
    && echo "✅ MiniFASNetV1SE татагдлаа" \
    || echo "⚠️ MiniFASNetV1SE татахад алдаа — runtime-д дахин оролдоно"

EXPOSE 5000
CMD ["python", "app.py"]