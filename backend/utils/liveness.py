"""
Silent Face Anti-Spoofing — MiniFASNet
CPU дээр ажиллах, ~10MB, нэг кадраас л бодит хүн эсэхийг тодорхойлно.
"""
import os, base64, numpy as np
from PIL import Image
import io

MODEL_DIR   = os.path.join(os.path.dirname(__file__), "..", "models")
os.makedirs(MODEL_DIR, exist_ok=True)

MODELS = [
    {
        "name": "MiniFASNetV2.onnx",
        "url":  "https://github.com/minivision-ai/Silent-Face-Anti-Spoofing/raw/master/resources/anti_spoof_models/2.7_80x80_MiniFASNetV2.onnx",
    },
    {
        "name": "MiniFASNetV1SE.onnx",
        "url":  "https://github.com/minivision-ai/Silent-Face-Anti-Spoofing/raw/master/resources/anti_spoof_models/4_0_0_80x80_MiniFASNetV1SE.onnx",
    },
]

_sessions     = []
_initialized  = False
_init_failed  = False

# ── Model татах ─────────────────────────────────────────────────────────────

def _download(url: str, path: str) -> bool:
    try:
        import urllib.request
        print(f"📥 Liveness model татаж байна: {os.path.basename(path)} ...")
        urllib.request.urlretrieve(url, path)
        size = os.path.getsize(path) / 1024 / 1024
        print(f"✅ Татаж дууслаа: {os.path.basename(path)} ({size:.1f} MB)")
        return True
    except Exception as e:
        print(f"❌ Татахад алдаа ({os.path.basename(path)}): {e}")
        if os.path.exists(path):
            os.remove(path)
        return False

# ── Model ачаалах ────────────────────────────────────────────────────────────

def _init() -> bool:
    global _sessions, _initialized, _init_failed
    if _initialized:
        return True
    if _init_failed:
        return False
    try:
        import onnxruntime as ort
        loaded = []
        for m in MODELS:
            path = os.path.join(MODEL_DIR, m["name"])
            # Файл байхгүй бол татна
            if not os.path.exists(path) or os.path.getsize(path) < 1000:
                ok = _download(m["url"], path)
                if not ok:
                    continue
            try:
                sess = ort.InferenceSession(path, providers=["CPUExecutionProvider"])
                loaded.append(sess)
                print(f"✅ Liveness model ачааллаа: {m['name']}")
            except Exception as e:
                print(f"⚠️ Model ачаалахад алдаа ({m['name']}): {e}")

        if loaded:
            _sessions    = loaded
            _initialized = True
            print(f"🎯 Liveness detection бэлэн — {len(loaded)} model")
            return True
        else:
            _init_failed = True
            print("⚠️ Liveness model суулгагдсангүй — шалгалтгүй ажиллана")
            return False
    except ImportError:
        print("⚠️ onnxruntime суулгагдаагүй байна — pip install onnxruntime")
        _init_failed = True
        return False
    except Exception as e:
        print(f"⚠️ Liveness init алдаа: {e}")
        _init_failed = True
        return False

# ── Зургийн preprocessing ────────────────────────────────────────────────────

def _preprocess(img_rgb: np.ndarray, bbox, size=(80, 80)) -> np.ndarray:
    x1, y1, x2, y2 = [int(v) for v in bbox]
    h, w = img_rgb.shape[:2]
    pad  = int(max(x2 - x1, y2 - y1) * 0.2)
    x1   = max(0, x1 - pad); y1 = max(0, y1 - pad)
    x2   = min(w, x2 + pad); y2 = min(h, y2 + pad)
    face = img_rgb[y1:y2, x1:x2]
    if face.size == 0:
        return None
    face = np.array(Image.fromarray(face).resize(size)).astype(np.float32) / 255.0
    mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
    std  = np.array([0.229, 0.224, 0.225], dtype=np.float32)
    face = (face - mean) / std
    return np.expand_dims(face.transpose(2, 0, 1), 0)

def _softmax(x):
    e = np.exp(x - np.max(x))
    return e / e.sum()

def _b64_to_rgb(b64: str) -> np.ndarray:
    if "," in b64:
        b64 = b64.split(",")[1]
    return np.array(Image.open(io.BytesIO(base64.b64decode(b64))).convert("RGB"))

# ── Гол функц ───────────────────────────────────────────────────────────────

def check_liveness(img_rgb: np.ndarray, face_location, threshold: float = 0.7) -> dict:
    """numpy array + face_location авч liveness буцаана."""
    if not _init():
        return {"is_live": True, "confidence": 1.0, "skipped": True}
    try:
        top, right, bottom, left = face_location
        inp = _preprocess(img_rgb, [left, top, right, bottom])
        if inp is None:
            return {"is_live": True, "confidence": 0.5, "skipped": True}
        scores = []
        for sess in _sessions:
            out   = sess.run(None, {sess.get_inputs()[0].name: inp})[0]
            prob  = _softmax(out[0])
            score = float(prob[1]) if len(prob) > 1 else float(prob[0])
            scores.append(score)
        avg = float(np.mean(scores))
        return {
            "is_live":    avg >= threshold,
            "confidence": round(avg, 3),
            "score":      round(avg, 3),
            "threshold":  threshold,
        }
    except Exception as e:
        return {"is_live": True, "confidence": 0.5, "skipped": True, "error": str(e)}

def check_liveness_from_b64(b64: str, face_location=None, threshold: float = 0.7) -> dict:
    """base64 зураг авч liveness буцаана."""
    if not _init():
        return {"is_live": True, "confidence": 1.0, "skipped": True}
    try:
        img = _b64_to_rgb(b64)
        if face_location is None:
            import face_recognition
            locs = face_recognition.face_locations(img, model="hog")
            if not locs:
                return {"is_live": False, "confidence": 0.0, "error": "Царай илэрсэнгүй"}
            face_location = locs[0]
        return check_liveness(img, face_location, threshold)
    except Exception as e:
        return {"is_live": True, "confidence": 0.5, "skipped": True, "error": str(e)}

def check_liveness_batch(b64: str, face_locations: list, threshold: float = 0.7) -> list:
    """Нэг зургаас олон царайн liveness зэрэг шалгана."""
    if not _init():
        return [{"is_live": True, "confidence": 1.0, "skipped": True}] * len(face_locations)
    try:
        img = _b64_to_rgb(b64)
        return [check_liveness(img, loc, threshold) for loc in face_locations]
    except Exception as e:
        return [{"is_live": True, "confidence": 0.5, "skipped": True}] * len(face_locations)

def get_status() -> dict:
    """Model-ийн одоогийн байдал."""
    _init()
    return {
        "initialized":    _initialized,
        "failed":         _init_failed,
        "models_loaded":  len(_sessions),
        "models_expected": len(MODELS),
        "model_dir":      MODEL_DIR,
        "models": [
            {
                "name":    m["name"],
                "exists":  os.path.exists(os.path.join(MODEL_DIR, m["name"])),
                "size_mb": round(os.path.getsize(os.path.join(MODEL_DIR, m["name"])) / 1024 / 1024, 1)
                           if os.path.exists(os.path.join(MODEL_DIR, m["name"])) else 0,
            }
            for m in MODELS
        ],
    }