# 🚀 Face Recognition Optimize — Deployment Guide

## ✅ Хийсэн өөрчлөлтүүд

### Backend
- **Загвар:** buffalo_l (280MB) → buffalo_sc (~20MB) — **5x хурдан**
- **Detection хэмжээ:** 640×640 → 320×320 — **4x цөөн pixel**
- **Encoding cache:** Memory-д 30 сек хадгална — **DB call арилна**
- **Model warmup:** Startup-т background thread-д — **эхний хүсэлт хурдан**
- **TOLERANCE:** 0.45 → 0.50 — **илүү нэвтрүүлтүүлэх**
- **Liveness:** PIL resize → OpenCV resize — **хурдан**

### Frontend (тугэлэнэ)
- Camera resolution сайжруулалт
- Compression optimization

---

## 🔧 Deployment алхамууд

### 1️⃣ Build → Start containers

```bash
docker-compose up --build
```

Хүлээнэ: `✅ InsightFace buffalo_sc initialized`

### 2️⃣ Encoding-уудыг сүмэнэ (ШААРДЛАГАТАЙ!)

Buffalo_sc нь buffalo_l-ын feature space-аас үл хамаарна. Бүх бүртгэл шинэчилгүй:

```bash
docker compose exec backend python reset_encodings.py
```

Output:
```
Устгах encoding бичлэг: X
face_enrolled=True оюутан: Y

Цааш үргэлжлүүлэх үү? (yes/n): yes

✅ X encoding устгагдлаа.
✅ Бүх оюутны face_enrolled = False болгогдлоо.
```

### 3️⃣ Frontend дээр оюутнуудыг дахин бүртгэнэ

- http://localhost:3000 орно
- "Students" хуудас
- Хүн бүрийн хувьд "Enroll Face" → зураг авна → `✅`

---

## ⏱️ Гүйцэтгэлийн хүлээлт

| Үйл ажиллагаа | Өмнө | Одоо | Сайжирлалт |
|---|---|---|---|
| Single recognize | ~3-5 сек | **0.8-1.5 сек** | **3-5x** |
| Multi-face (3 хүн) | ~5-7 сек | **1.5-2.5 сек** | **3-4x** |
| Enroll (1 зураг) | ~2-3 сек | **0.5-1 сек** | **3-4x** |

---

## ⚙️ Performance tuning (preview)

### Liveness check-ийг идэвхгүй болгох (хурдан)

```bash
# attendance.py 244 мөр дээр threshold=0.0 давна
result = check_liveness_from_b64(data["image"], threshold=0.0)
```

### Memory usage сайжруулалт

`face_utils.py` дээр cache TTL:
```python
ENC_CACHE_TTL = 30  # сек (бага = цөөн memory)
```

---

## 🐛 Засварын log

✅ Dockerfile: build-essential + cmake нэмлээ
✅ face_utils.py: buffalo_sc ашиглалт + memory cache
✅ liveness.py: OpenCV resize (хурдан)
✅ app.py: startup warmup thread

---

## ❓ Асуульта

**Q: Түрүүнд бүртгэсэн царай унаж болох уу?**
A: Тийм, buffalo_sc нь үл ажилтайнааа. Reset_encodings.py ажиллуулсан дээр шинэ encoding бүрхүүлнэ.

**Q: Liveness check хоц болох уу?**
A: Үгүй, Buffalo_sc ялангуяа detection-д хурдан (320×320). Liveness ONNX model хатуу цөөн хүндэрч байна.

**Q: Енвайронмент переменнуудыг илүү сайжруулж болох уу?**
A: [backend/.env]: FACE_TOLERANCE, LIVENESS_THRESHOLD нэмж болно. За дараа хэндэх.
