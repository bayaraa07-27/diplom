FROM python:3.11-slim

# InsightFace Cython-д шаардлагатай build tool + runtime сангууд
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential cmake \
    libgomp1 libglib2.0-0 libgl1 wget curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
RUN mkdir -p face_data models

# Liveness болон InsightFace моделиудыг урьдчилан татна
COPY download_models.py /tmp/download_models.py
RUN python3 /tmp/download_models.py || echo "Model download failed — will retry on startup"

EXPOSE 5000
CMD ["python", "app.py"]
