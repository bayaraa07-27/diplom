# 🎓 FaceAttend — Царай Танилтын Ирц Систем

Сургууль, их сургуулийн оюутны ирцийг **царай танилтаар** бүртгэдэг веб систем.

## 🛠 Технологийн стек

| Давхарга   | Технологи                                  |
|------------|--------------------------------------------|
| Backend    | Python 3.11, Flask, flask-jwt-extended     |
| Царай танилт | `face_recognition` (dlib суурьтай)       |
| Frontend   | React 18, Vite, Tailwind CSS, Recharts     |
| Database   | MongoDB 7                                  |
| Зураг      | Webcam (react-webcam)                      |
| Auth       | JWT Token                                  |

---

## 📁 Файлын бүтэц

```
face-attendance/
├── backend/
│   ├── app.py                  # Flask app
│   ├── database.py             # MongoDB холболт
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── routes/
│   │   ├── auth.py             # Нэвтрэх / бүртгэл
│   │   ├── students.py         # Оюутан CRUD + царай бүртгэл
│   │   ├── attendance.py       # Ирц бүртгэх / царай таних
│   │   └── reports.py          # Тайлан, статистик
│   ├── utils/
│   │   └── face_utils.py       # face_recognition утилити
│   └── face_data/
│       └── encodings.pkl       # Царайны encoding (автоматаар үүснэ)
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx             # Router
│   │   ├── main.jsx
│   │   ├── index.css
│   │   ├── hooks/
│   │   │   └── useAuth.jsx     # Auth context
│   │   ├── utils/
│   │   │   └── api.js          # Axios client
│   │   ├── components/
│   │   │   └── Layout.jsx      # Sidebar + navigation
│   │   └── pages/
│   │       ├── Login.jsx       # Нэвтрэх
│   │       ├── Dashboard.jsx   # Хяналтын самбар
│   │       ├── Students.jsx    # Оюутан удирдлага
│   │       ├── Enroll.jsx      # Царай бүртгэх
│   │       ├── Attendance.jsx  # Ирц бүртгэх (live)
│   │       └── Reports.jsx     # Тайлан
│   ├── package.json
│   ├── vite.config.js
│   └── Dockerfile
│
├── docker-compose.yml
└── README.md
```

---

## 🚀 Суулгах заавар

### Хариант 1: Docker (хялбар)

```bash
# 1. Репо татах
git clone <your-repo-url>
cd face-attendance

# 2. Docker-ээр эхлүүлэх
docker-compose up --build

# 3. Хандах
# Frontend: http://localhost:3000
# Backend:  http://localhost:5000/api/health
```

---

### Хариант 2: Гараар суулгах

#### Backend

```bash
cd backend

# Virtual environment үүсгэх
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate

# Системийн хамаарал (Ubuntu/Debian)
sudo apt-get install -y cmake libopenblas-dev liblapack-dev python3-dev

# Python package суулгах
pip install -r requirements.txt

# .env тохируулах
cp .env.example .env
# .env файлд MONGO_URI болон JWT_SECRET_KEY засна

# Сервер эхлүүлэх
python app.py
```

#### Frontend

```bash
cd frontend

# Хамаарал суулгах
npm install

# Хөгжүүлэлтийн сервер
npm run dev
```

#### MongoDB

```bash
# Docker-ээр MongoDB эхлүүлэх
docker run -d -p 27017:27017 --name mongo mongo:7

# Эсвэл MongoDB Compass ашиглаж localhost:27017 холбох
```

---

## 📖 API Endpoints

### Auth
| Method | Endpoint            | Тайлбар         |
|--------|---------------------|-----------------|
| POST   | /api/auth/register  | Шинэ хэрэглэгч  |
| POST   | /api/auth/login     | Нэвтрэх         |
| GET    | /api/auth/me        | Профайл харах   |

### Оюутан
| Method | Endpoint                           | Тайлбар            |
|--------|------------------------------------|--------------------|
| GET    | /api/students/                     | Жагсаалт (хайлт)   |
| POST   | /api/students/                     | Нэмэх              |
| PUT    | /api/students/:id                  | Засах              |
| DELETE | /api/students/:id                  | Устгах             |
| POST   | /api/students/:id/enroll-face      | Царай бүртгэх      |

### Ирц
| Method | Endpoint                      | Тайлбар                  |
|--------|-------------------------------|--------------------------|
| POST   | /api/attendance/recognize     | Царай таних              |
| POST   | /api/attendance/checkin       | Ирц бүртгэх              |
| POST   | /api/attendance/checkout      | Гарах цаг бүртгэх        |
| GET    | /api/attendance/              | Жагсаалт (өдөр, оюутан)  |
| GET    | /api/attendance/today-summary | Өнөөдрийн хураангуй      |

### Тайлан
| Method | Endpoint                      | Тайлбар                    |
|--------|-------------------------------|----------------------------|
| GET    | /api/reports/overview         | Ерөнхий статистик          |
| GET    | /api/reports/student/:id      | Оюутны тайлан              |
| GET    | /api/reports/department       | Тэнхимийн харьцуулалт      |
| GET    | /api/reports/daily-trend      | Өдрийн чиг хандлага        |

---

## 🔐 Анхны нэвтрэлт

Дараах curl командаар анхны admin бүртгэнэ:

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

## ⚙️ Тохиргоо

`backend/.env` файлд:

```env
MONGO_URI=mongodb://localhost:27017/face_attendance
JWT_SECRET_KEY=your-very-long-random-secret
FLASK_ENV=development
FLASK_PORT=5000
CORS_ORIGINS=http://localhost:3000
```

---

## 📸 Царай бүртгэлийн зөвлөмж

- Сайн гэрэлтэй, цэлмэг орчинд зураг авна
- Нүдний шил, малгай аваарай
- Камерт шулуун харна уу
- Зөвхөн нэг хүний зураг ашиглана
- JPEG формат, `tolerance=0.5` (тааруулж болно `face_utils.py`-д)

---

## 🤝 Хувь нэмэр

1. Fork хийх
2. Feature branch үүсгэх (`git checkout -b feature/new-feature`)
3. Commit хийх (`git commit -m 'Add new feature'`)
4. Push хийх (`git push origin feature/new-feature`)
5. Pull Request нээх
"# diplom" 
