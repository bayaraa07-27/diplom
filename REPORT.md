# Царай Танилтад Суурилсан Оюутны Ирц Бүртгэлийн Систем
## Техникийн Тайлан

---

## 1. Оршил

Уламжлалт ирц бүртгэлийн арга (гараар дуудлага, гарын үсэг) нь цаг хугацаа их зарцуулдаг, алдаа гарах магадлал өндөр, заримдаа оюутнууд нэг нэгнийхээ оронд бүртгүүлэх боломжтой байдаг. Энэхүү ажилд **царай танилтын технологи** ашиглан оюутны ирцийг автоматаар, бодит цаг дээр бүртгэх веб систем боловсруулав.

Системийн гол зорилтууд:
- Нэг камерын кадрт байгаа **олон оюутныг зэрэг** таньж ирц бүртгэх
- Утас, хэвлэмэл зурагт **спуфинг хийхийг** блоклох
- Багш дэлгэцний өмнөөс **гараар засах** боломжтой байх
- Хичээлийн **хуваарьтай уялдуулж хоцрогдол** тооцох

---

## 2. Системийн Архитектур

Систем нь гурван бүрэлдэхүүн хэсгээс тогтоно:

```
┌─────────────────────────────────────────────────┐
│           Frontend  (React 18 + Vite)           │
│  Attendance.jsx → Webcam → Canvas bbox зурах    │
└────────────────────┬────────────────────────────┘
                     │ HTTP + JWT (axios)
┌────────────────────▼────────────────────────────┐
│            Backend  (Flask + Python 3.11)        │
│  ┌──────────────┐   ┌──────────────────────────┐│
│  │ face_utils.py│   │      liveness.py          ││
│  │ InsightFace  │   │  OpenCV texture analysis  ││
│  │ ArcFace      │   │  Laplacian + Std + FFT    ││
│  └──────┬───────┘   └──────────────────────────┘│
└─────────┼───────────────────────────────────────┘
          │ pymongo
┌─────────▼───────────────────────────────────────┐
│              MongoDB 7                           │
│  students │ face_encodings │ attendance          │
│  schedules │ attendance_edits                    │
└─────────────────────────────────────────────────┘
```

---

## 3. Технологийн Сонголт

### 3.1 Царай Танилт — InsightFace ArcFace buffalo_sc

| Шалгуур | InsightFace buffalo_sc | face_recognition (dlib) |
|---------|----------------------|------------------------|
| Загварын хэмжээ | ~20 MB | ~100 MB |
| CPU гүйцэтгэл | ~50–100 ms/нүүр | ~200–500 ms/нүүр |
| Нарийвчлал | ArcFace (SOTA) | ResNet-34 |
| Олон нүүр | Нэгэн зэрэг | Нэг нэгээр |
| Embedding хэмжээ | 512-dim | 128-dim |

**buffalo_sc** сонгосон шалтгаан: buffalo_l (280 MB) загвартай харьцуулахад 5 дахин хурдан, CPU дээр ажиллах боломжтой, нарийвчлалын алдагдал бага.

### 3.2 Anti-spoofing — OpenCV Texture Analysis

MiniFASNet ONNX загварууд нь `batch_size=0` буруу export-той учраас бүх оролтод ижил (`class 2` давамгайлсан) гаралт өгч байсан тул **OpenCV texture analysis** аргыг хэрэгжүүллээ.

Нэгтгэсэн 3 метрик:

| Метрик | Тооцооллын арга | Жин |
|--------|----------------|-----|
| Laplacian variance | `cv2.Laplacian(gray_u8, cv2.CV_32F)` → `np.var()` | 50% |
| Block local std | 16×16 блок тус бүрийн дисперсийн дундаж | 30% |
| FFT frequency ratio | Доод/дээд давтамжийн харьцаа (R < 15% vs R ≥ 15%) | 20% |

```
confidence = lap_s × 0.5 + std_s × 0.3 + freq_s × 0.2
```

Босго: `0.45` — дараагийн хоёр давхарга:

1. **ArcFace confidence ≥ 62%** (distance ≤ 0.38) — утасны зураг ихэвчлэн < 60% тохирдог
2. **Liveness score ≥ 0.45** — OpenCV texture шинжилгээ

### 3.3 Бусад Технологи

| Бүрэлдэхүүн | Технологи | Шалтгаан |
|-------------|-----------|---------|
| Backend framework | Flask 3.0 | Хөнгөн, REST API-д тохиромжтой |
| Database | MongoDB 7 | Схемгүй, embedding array хадгалахад тохиромжтой |
| Auth | JWT (flask-jwt-extended) | Stateless, frontend-д хялбар |
| Rate limiting | flask-limiter | `/recognize-multi` endpoint-ийг хамгаална |
| Frontend | React 18 + Vite | HMR, Tailwind CSS-тэй нийцтэй |
| Container | Docker Compose | Нэг командаар бүгдийг эхлүүлнэ |

---

## 4. Царай Танилтын Алгоритм

### 4.1 Бүртгэлийн үе шат (Enrollment)

```
Webcam зураг авах
       ↓
InsightFace: det_score ≥ 0.60 эсэх шалгах
       ↓
ArcFace normed_embedding (512-dim float32) тооцох
       ↓
MongoDB face_encodings-д хадгалах (хамгийн ихдээ 5 зураг)
```

5 зураг хадгалах шалтгаан: өнцөг, гэрэлтэлтийн ялгааг давж, танилтын нарийвчлалыг нэмэгдүүлнэ.

### 4.2 Танилтын үе шат (Recognition)

**Cosine distance** ашиглан тохирол олно:

```python
similarity = dot(unknown_enc, known_enc)   # норм хийгдсэн embedding
distance   = 1 - similarity
```

| Нөхцөл | Үйлдэл |
|--------|--------|
| distance > 0.38 (ирц) | Танигдаагүй — unknown |
| distance > 0.50 (ерөнхий) | Танигдаагүй |
| Хоёр дахь хамгийн ойр gap < 0.05 | Тодорхойгүй — unknown |
| distance ≤ 0.38 | Танигдсан |

**In-memory encoding cache** (TTL = 30 секунд): MongoDB-д хандалгүйгээр хурдан тохирол олох.

### 4.3 Олон царайн зэрэг танилт

```python
faces = insightface_app.get(img_bgr)      # бүх царайг нэгэн зэрэг илрүүлнэ
for face in faces:
    sid, dist = _best_match(face.normed_embedding, known, tol=0.38)
```

Нэг кадрт дурын тооны оюутан зэрэг танигдана — анги танхимын хэрэглээнд тохиромжтой.

---

## 5. Ирц Бүртгэлийн Урсгал

```
Webcam (480×360, 1.5 секунд тутамд)
        ↓
POST /api/attendance/recognize-multi
        ↓
InsightFace: царай илрүүлэх + ArcFace embedding
        ↓
Cosine distance: тохирол хайх (tol=0.38)
        ↓
    confidence ≥ 62%?
    ├── Үгүй  → status="unknown"  🔴
    └── Тийм ↓
        Liveness шалгалт (Laplacian + Std + FFT)
        ├── score < 0.45 → status="spoof"   🟡
        └── score ≥ 0.45 ↓
            already_ids cache шалгах
            ├── Тийм → status="already"      🔵
            └── Үгүй ↓
                MongoDB: өнөөдөр бүртгэлтэй?
                ├── Тийм → status="already"  🔵
                └── Үгүй → DB-д бичих
                          → status="new"     🟢
```

### Статусын өнгө

| Статус | Өнгө | Утга |
|--------|------|------|
| `new` | Ногоон | Шинэ ирц бүртгэгдсэн |
| `already` | Цэнхэр | Аль хэдийн бүртгэгдсэн |
| `spoof` | Шар | Спуфинг илэрсэн (утас/зураг) |
| `unknown` | Улаан | Танигдаагүй |

---

## 6. Өгөгдлийн Сангийн Бүтэц

### Коллекцүүд

**students**
```json
{
  "student_id": "2021CS001",
  "name": "Болд Дорж",
  "department": "Компьютерийн ухаан",
  "email": "bold@university.mn",
  "created_at": "2024-09-01T08:00:00Z"
}
```

**face_encodings**
```json
{
  "student_id": "2021CS001",
  "encodings": [[0.023, -0.141, ...], ...],  // 512-dim × 5 зураг
  "sample_count": 5
}
```

**attendance**
```json
{
  "student_id": "2021CS001",
  "date": "2024-11-15",
  "check_in": "2024-11-15T08:02:31Z",
  "subject": "Алгоритм",
  "status": "present",
  "late": false,
  "manual": false,
  "schedule_id": "..."
}
```

**attendance_edits** — засварын audit log:
```json
{
  "attendance_id": "...",
  "student_id": "2021CS001",
  "old_status": "absent",
  "new_status": "present",
  "edited_by": "teacher@university.mn",
  "edited_at": "2024-11-15T10:15:00Z"
}
```

### Индексүүд

| Коллекц | Индекс | Зорилго |
|---------|--------|---------|
| students | `student_id` (unique) | Хурдан хайлт |
| face_encodings | `student_id` (unique) | Encoding уншилт |
| attendance | `(student_id, date)` | Давхардал шалгах |
| attendance | `date` | Өдрөөр шүүх |

---

## 7. API Эндпойнтууд

### Үндсэн эндпойнтууд

| Method | Endpoint | Тайлбар |
|--------|----------|---------|
| POST | `/api/auth/login` | JWT token авах |
| GET | `/api/students/` | Оюутны жагсаалт (хайлт, хуудаслалт) |
| POST | `/api/students/:id/enroll-face` | Царай бүртгэх (5 зураг хүртэл) |
| POST | `/api/attendance/recognize-multi` | Олон царай зэрэг таних + ирц |
| GET | `/api/attendance/daily` | Өдрийн бүх оюутны ирцийн байдал |
| PUT | `/api/attendance/:id` | Статус засах + audit log |
| GET | `/api/reports/overview` | Ерөнхий статистик |
| GET | `/api/reports/department` | Тэнхимийн харьцуулалт |

### `/api/attendance/recognize-multi` — гол эндпойнт

**Request:**
```json
{
  "image": "data:image/jpeg;base64,...",
  "check_liveness": true,
  "already_registered": ["2021CS001"],
  "schedule_id": "..."
}
```

**Response:**
```json
{
  "faces": [
    {
      "student_id": "2021CS002",
      "confidence": 87.3,
      "status": "new",
      "name": "Сарнай Бат",
      "location": [120, 340, 280, 180],
      "bbox": [180, 120, 340, 280]
    }
  ],
  "new_registrations": [...],
  "new_count": 1,
  "total_faces": 3,
  "already_registered": ["2021CS001", "2021CS002"]
}
```

---

## 8. Камерын Шаардлага

Анги танхимд ашиглахад дараах шаардлага тавигдана:

| Үзүүлэлт | Доод хязгаар | Зөвлөмж |
|----------|--------------|---------|
| Нягтрал | 720p (1280×720) | 1080p |
| FPS | 15 fps | 30 fps |
| Гэрэлтэлт | 200 lux | 500+ lux |
| Фокусын зай | 1–5 м | 2–4 м |
| Байрлал | Дэлгэцний өмнө | Таазнаас доош харсан |

InsightFace `det_size=320×320` тохиргоотой үед 2–4 м-ийн зайнаас 720p камер дээр нэг царайг **50–120 ms** дотор таньж чадна.

---

## 9. Аюулгүй Байдал

| Давхарга | Механизм |
|----------|---------|
| Auth | JWT Bearer token (1 цаг хугацаа) |
| Password | bcrypt hash (ойролцоогоор 12 round) |
| Rate limit | flask-limiter (recognize-multi exempt, бусад хязгаарлагдсан) |
| Anti-spoofing | ArcFace confidence + OpenCV liveness (2 давхарга) |
| Audit log | Бүх гараар засварын бичлэг `attendance_edits`-д хадгалагдана |
| CORS | `CORS_ORIGINS` env-ээр тохируулна |

---

## 10. Гүйцэтгэлийн Тоо Баримт

| Үйлдэл | Хугацаа (CPU) |
|--------|--------------|
| InsightFace warm-up | ~3–5 сек (нэг удаа) |
| Нэг царай илрүүлэх + embedding | ~50–100 ms |
| Encoding cache хайлт (100 оюутан) | < 5 ms |
| Liveness тооцоолол (нэг царай) | ~10–20 ms |
| MongoDB insert | ~2–5 ms |
| **Нийт нэг frame боловсруулалт** | **~80–150 ms** |

Scan interval: **1500 ms** → нэг минутэд 40 хүрд, CPU ачаалал ~10–15%.

---

## 11. Дүгнэлт

Энэхүү ажилд дараах үр дүнд хүрлээ:

1. **InsightFace ArcFace buffalo_sc** ашиглан 512-хэмт embedding дээр суурилсан, нэг кадрт олон царай зэрэг таних систем хэрэгжүүллээ.

2. MiniFASNet ONNX загваруудын `batch_size=0` алдааг илрүүлж, **OpenCV texture analysis** (Laplacian variance + block local std + FFT frequency ratio) аргаар орлуулан anti-spoofing хэрэгжүүллээ.

3. **Хоёр давхарга** бүхий спуфингийн хамгаалалт:
   - ArcFace confidence босго (≥ 62%) — утасны зурагт confidence < 60% байдгийг ашигладаг
   - OpenCV liveness score босго (≥ 0.45)

4. In-memory encoding cache (TTL=30с), batch liveness зэрэг **гүйцэтгэлийн оновчлол**-ыг хэрэгжүүллээ.

5. Засварын бүрэн **audit log**, хуваарьтай ирц, тэнхимийн тайлан зэрэг бизнесийн шаардлагыг хангалаа.

---

## Хавсралт — Ашигласан Номзүй

1. Deng, J., et al. "ArcFace: Additive Angular Margin Loss for Deep Face Recognition." *CVPR 2019*.
2. Guo, J., et al. "InsightFace: 2D and 3D Face Analysis Project." GitHub, 2021.
3. Zhang, K., et al. "Real-World Anti-Spoofing with Anomaly Detection." *CVPR 2020*.
4. Flask Documentation. https://flask.palletsprojects.com/
5. MongoDB Documentation. https://www.mongodb.com/docs/
6. React Documentation. https://react.dev/
