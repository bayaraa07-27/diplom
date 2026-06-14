# FaceAttend — Царай Танилтын Ирц Систем

Сургууль, их сургуулийн оюутны ирцийг **царай танилтаар** автоматаар бүртгэдэг веб систем.  
Нэг кадрт байгаа **олон оюутныг зэрэг** таньж, ирцийг **бодит цаг** (real-time) дээр бүртгэнэ.

---

## Технологийн стек

| Давхарга          | Технологи                                                        |
|-------------------|------------------------------------------------------------------|
| Backend           | Python 3.11, Flask, flask-jwt-extended, flask-limiter            |
| Царай танилт      | InsightFace ArcFace **buffalo_sc** (~20 MB, CPU-д хурдан)        |
| Anti-spoofing     | /** (Laplacian + block std + FFT freq ratio) |
| Frontend          | React 18, Vite, Tailwind CSS, Recharts, react-webcam             |
| Database          | MongoDB 7 (ArcFace 512-dim embedding хадгална)                   |
| Auth              | JWT Token (1 цаг)                                                |
| Containerization  | Docker, Docker Compose                                           |

---

## Системийн онцлог

- **Real-time олон царай** — нэг кадрт хэдэн ч оюутан зэрэг таньж ирц бүртгэнэ
- **Anti-spoofing** — утас/принтийн зурагт толгойлуулах оролдлогыг блоклоно
  - ArcFace confidence ≥ 62% шаардана (утасны зураг ихэвчлэн < 60%)
  - OpenCV texture liveness (0.45 босго) — нэмэлт давхарга
- **Гараар засах** — царайгаар танигдаагүй оюутны ирцийг гараар оруулж, засварын лог хадгална
- **Хуваарьтай ирц** — хичээлийн цагийн хуваарьтай уялдуулж хоцрогдол тооцно
- **Тайлан** — тэнхим, өдрийн чиг хандлага, оюутан тус бүрийн ирцийн тайлан

---

## Файлын бүтэц

```
diplom/
├── backend/
│   ├── app.py                  # Flask app, blueprint бүртгэл, warmup
│   ├── database.py             # MongoDB холболт + индекс
│   ├── extensions.py           # flask-limiter singleton
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── download_models.py      # Docker build-д InsightFace buffalo_sc татна
│   ├── migrate_encodings.py    # Хуучин face_recognition → InsightFace шилжүүлэг
│   ├── reset_encodings.py      # Бүх царайн encoding-ийг дахин тооцох
│   ├── models/                 # InsightFace buffalo_sc model файлууд
│   ├── routes/
│   │   ├── auth.py             # Нэвтрэх / бүртгэл
│   │   ├── students.py         # Оюутан CRUD + царай бүртгэл/устгал
│   │   ├── attendance.py       # Ирц бүртгэх / царай таних / liveness
│   │   ├── reports.py          # Тайлан, статистик
│   │   └── schedules.py        # Хичээлийн цагийн хуваарь
│   └── utils/
│       ├── face_utils.py       # InsightFace ArcFace танилт, encoding cache
│       └── liveness.py         # OpenCV texture-based anti-spoofing
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx             # Router
│   │   ├── hooks/useAuth.jsx   # Auth context
│   │   ├── utils/api.js        # Axios client
│   │   ├── components/Layout.jsx
│   │   └── pages/
│   │       ├── Login.jsx       # Нэвтрэх
│   │       ├── Dashboard.jsx   # Хяналтын самбар
│   │       ├── Students.jsx    # Оюутан удирдлага
│   │       ├── Enroll.jsx      # Царай бүртгэх (webcam)
│   │       ├── Attendance.jsx  # Ирц бүртгэх (real-time, олон царай)
│   │       ├── Schedules.jsx   # Хичээлийн цагийн хуваарь
│   │       └── Reports.jsx     # Тайлан (оюутан хайлттай)
│   ├── package.json
│   ├── vite.config.js
│   └── Dockerfile
│
├── docker-compose.yml
└── README.md
```

## Суулгах заавар

### Хариант 1: Docker (хялбар)

```bash
# 1. Репо татах
git clone <your-repo-url>
cd diplom

# 2. Docker-ээр эхлүүлэх (эхний удаад InsightFace model татна ~20 MB)
docker-compose up --build

# 3. Хандах
# Frontend: http://localhost:3000
# Backend:  http://localhost:5000/api/health
```

### Хариант 2: Гараар суулгах

#### Backend

```bash
cd backend

# Virtual environment үүсгэх
python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate

# Системийн хамаарал (Ubuntu/Debian)
sudo apt-get install -y cmake libgl1-mesa-glx libglib2.0-0

# Python package суулгах
pip install -r requirements.txt

# InsightFace buffalo_sc model татах (нэг удаа)
python download_models.py

# Сервер эхлүүлэх
python app.py
```

#### Frontend

```bash
cd frontend
npm install
npm run dev
```

#### MongoDB

```bash
docker run -d -p 27017:27017 --name mongo mongo:7
```

---

## API Endpoints

### Auth
| Method | Endpoint            | Тайлбар        |
|--------|---------------------|----------------|
| POST   | /api/auth/register  | Шинэ хэрэглэгч |
| POST   | /api/auth/login     | Нэвтрэх        |
| GET    | /api/auth/me        | Профайл харах  |

### Оюутан
| Method | Endpoint                         | Тайлбар                  |
|--------|----------------------------------|--------------------------|
| GET    | /api/students/                   | Жагсаалт (хайлт, хуудас) |
| POST   | /api/students/                   | Нэмэх                    |
| PUT    | /api/students/:id                | Засах                    |
| DELETE | /api/students/:id                | Устгах (ирц+царай хамт)  |
| POST   | /api/students/:id/enroll-face    | Царай бүртгэх            |
| DELETE | /api/students/:id/enroll-face    | Царайны бүртгэл устгах   |
| GET    | /api/students/:id/face-status    | Бүртгэлийн статус+зураг   |

### Ирц
| Method | Endpoint                          | Тайлбар                     |
|--------|-----------------------------------|-----------------------------|
| POST   | /api/attendance/recognize         | Нэг царай таних              |
| POST   | /api/attendance/recognize-multi   | Олон царай зэрэг таних + ирц |
| POST   | /api/attendance/checkin           | Ирц бүртгэх                 |
| POST   | /api/attendance/checkout          | Гарах цаг бүртгэх           |
| GET    | /api/attendance/                  | Жагсаалт (өдөр, оюутан)     |
| GET    | /api/attendance/today-summary     | Өнөөдрийн хураангуй         |
| GET    | /api/attendance/daily             | Өдрийн бүх оюутны байдал    |
| POST   | /api/attendance/manual            | Гараар ирц бүртгэх          |
| PUT    | /api/attendance/:id               | Статус засах (audit log)    |
| GET    | /api/attendance/edits             | Засварын түүх               |
| POST   | /api/attendance/check-liveness    | Liveness тест               |
| GET    | /api/attendance/liveness-status   | Anti-spoofing статус        |

### Тайлан
| Method | Endpoint                  | Тайлбар               |
|--------|---------------------------|-----------------------|
| GET    | /api/reports/overview     | Ерөнхий статистик     |
| GET    | /api/reports/student/:id  | Оюутны тайлан         |
| GET    | /api/reports/department   | Тэнхимийн харьцуулалт |
| GET    | /api/reports/daily-trend  | Өдрийн чиг хандлага   |

### Хуваарь
| Method | Endpoint              | Тайлбар            |
|--------|-----------------------|--------------------|
| GET    | /api/schedules/       | Жагсаалт           |
| POST   | /api/schedules/       | Нэмэх              |
| PUT    | /api/schedules/:id    | Засах              |
| DELETE | /api/schedules/:id    | Устгах             |
| GET    | /api/schedules/today  | Өнөөдрийн хуваарь  |

---

## Анхны нэвтрэлт

```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Багш Нэр",
    "email": "admin@university.mn",
    "password": "password123",
    "role": "admin"
  }'
```

---

## Тохиргоо

`docker-compose.yml` → `environment` хэсэгт:

```yaml
MONGO_URI: mongodb://mongodb:27017/face_attendance
JWT_SECRET_KEY: change-this-secret-in-production
FLASK_ENV: production
FLASK_PORT: "5000"
CORS_ORIGINS: http://localhost:3000
FACE_USE_CNN: "false"   # GPU байвал "true" болгоно
```

---

## Царай танилтын параметрүүд

| Параметр                | Утга      | Тайлбар                                              |
|-------------------------|-----------|------------------------------------------------------|
| TOLERANCE_DEFAULT       | **0.45**  | Нийтлэг cosine distance босго (0.50-аас бууруулсан)  |
| ATTENDANCE_TOLERANCE    | **0.38**  | Ирцэд хэрэглэх нарийн босго (≥62% confidence)       |
| MIN_GAP                 | **0.08**  | 2 хүний зайн ялгаа — давхардлаас хамгаална (0.05-аас нэмэгдсэн) |
| MAX_SAMPLES             | 5         | Нэг хүний encoding зурагийн тоо                       |
| det_size                | **640×640** | InsightFace царай илрүүлэлтийн хэмжээ (320×320-аас нэмэгдсэн) |
| MODEL_NAME              | buffalo_sc | ArcFace загвар (~20 MB, CPU оптимизаци)             |
| Liveness threshold      | 0.45      | OpenCV texture liveness босго (0–1)                  |
| ENC_CACHE_TTL           | 30 с      | In-memory encoding cache-ийн хугацаа                 |
| SCAN_INTERVAL           | 1500 мс   | Frontend-ийн автомат скан давтамж                    |

---

## Anti-spoofing (Спуфингийн хамгаалалт)

Ирц бүртгэхэд **хоёр давхарга** ажиллана:

**1. ArcFace confidence босго** — эхний давхарга  
- Ирцэд зөвхөн ≥ 62% (distance ≤ 0.38) confidence бүхий тохирлыг хүлээн зөвшөөрнө  
- Утасны дэлгэцийн зурагт царайны encoding тохирол ихэвчлэн < 60% байдаг тул шүүгдэнэ  
- Бодит хүн: 75–95% → дамждаг

**2. OpenCV texture liveness** — хоёр дахь давхарга  
- **Laplacian variance** — арьсны текстурийн хурц байдал (жин 50%)  
- **Block local std** — орон нутгийн текстурийн хувьсал (жин 30%)  
- **FFT frequency ratio** — дэлгэцийн pixel grid-ийн давтамжийн мэдэг (жин 20%)  
- Нэгтгэсэн оноо 0.45-аас дээш → бодит хүн

> **Тэмдэглэл**: Оюутан бүртгэх (enroll) үед anti-spoofing **ажиллахгүй** — зургаар бүртгэх боломжтой.

---

## Царай бүртгэлийн зөвлөмж

- Сайн гэрэлтэй, тодорхой орчинд зураг авна
- Нүдний шил, малгай аваарай
- Камерт шулуун харна уу
- Зөвхөн нэг хүний зураг байх ёстой
- 5 хүртэл зураг бүртгэх боломжтой (өнцөг, гэрлийн ялгааг давж чадна)

---

## Камерын шаардлага (анги танхим)

| Үзүүлэлт      | Доод хязгаар       | Зөвлөмж              |
|---------------|--------------------|----------------------|
| Нягтрал       | 720p (1280×720)    | 1080p                |
| FPS           | 15 fps             | 30 fps               |
| Гэрэлтэлт     | 200 lux            | 500 lux (ширээний гэрэл) |
| Байрлал       | Дэлгэцний өмнөх   | Таазны камер (дээрээс) |
| Фокусын зай   | 1–5 м              | 2–4 м                |

> 3–4 м-ийн зайнаас 720p камер дээр InsightFace нэг оюутны царайг ~50–100 ms-д таньж чадна.  
> det_size=640×640 нь 320×320-тай харьцуулахад алслалтын мужийг ~2 м-ээс **~4 м** болгон нэмэгдүүлсэн.

---

## Системийн шаардлага (Бодит хэрэглээ — Сургууль)

### Хамгийн бага шаардлага (1 анги, ≤30 оюутан)

| Бүрдэл          | Хамгийн бага                             | Зөвлөмж                              |
|-----------------|------------------------------------------|--------------------------------------|
| **CPU**         | 4 цөм, 2.5 GHz (Intel Core i5-8th gen+) | 8 цөм, 3.0 GHz (Core i7 / Ryzen 7)  |
| **RAM**         | 8 GB                                     | 16 GB                                |
| **GPU**         | Шаардлагагүй (CPU горим)                 | NVIDIA GTX 1060+ (CUDA горим)        |
| **Disk**        | 10 GB чөлөөт зай                         | SSD 50 GB+                           |
| **OS**          | Ubuntu 22.04 / Windows 10+               | Ubuntu 22.04 LTS (серверт)           |
| **Docker**      | Docker Engine 24+, Compose v2            | —                                    |
| **MongoDB**     | MongoDB 7 (Docker эсвэл Atlas)           | MongoDB Atlas M10+                   |

### Камерын шаардлага

| Үзүүлэлт        | Хамгийн бага             | Зөвлөмж                        |
|-----------------|--------------------------|--------------------------------|
| **Нягтрал**     | 720p (1280×720)          | 1080p (1920×1080)              |
| **FPS**         | 15 fps                   | 30 fps                         |
| **Гэрэлтэлт**   | 200 lux                  | 500 lux (ширээний гэрэл)       |
| **Байрлал**     | Дэлгэцний өмнөх          | Таазны камер (өрөөг бүрхэх)   |
| **Фокусын зай** | 1–5 м                    | 2–4 м                          |
| **Холболт**     | USB 2.0                  | USB 3.0 / IP камер (RTSP)      |

### Сүлжээний шаардлага

| Үзүүлэлт        | Утга                                          |
|-----------------|-----------------------------------------------|
| **Backend↔Frontend** | Локал сүлжээ ≥ 100 Mbps                 |
| **MongoDB↔Backend**  | Локал (Docker network, <1 ms latency)   |
| **Нэг хүсэлтийн дата** | ~80–200 KB (720p кадр JPEG 80%)        |
| **Нэг нэвтрэлт**    | ~50–150 мс (CPU горим, 1–5 царай)       |
| **30 оюутан зэрэг** | ~450–800 мс нэг кадрт (CPU горим)       |

### Олон анги (масштаблах)

| Ачааллын хэмжээ         | Зөвлөмж тохиргоо                                       |
|-------------------------|--------------------------------------------------------|
| 1–5 анги (≤150 оюутан)  | Дээрх хамгийн бага шаардлага хангалттай                |
| 5–20 анги (≤600 оюутан) | GPU (NVIDIA RTX 3060+), 32 GB RAM, NVMe SSD            |
| 20+ анги (3000+ оюутан) | Олон backend container (horizontal scaling), load balancer, GPU сервер |

> **Тэмдэглэл**: Одоогийн архитектур нь монолит Flask бөгөөд нэг серверт ажиллана. Томоохон масштабт Celery task queue болон олон процессын тохиргоо шаардагдана.
