import face_recognition
import numpy as np
import base64
import pickle
import os
from PIL import Image
import io

ENCODINGS_DIR  = os.path.join(os.path.dirname(__file__), "..", "face_data")
os.makedirs(ENCODINGS_DIR, exist_ok=True)
ENCODINGS_FILE = os.path.join(ENCODINGS_DIR, "encodings.pkl")

def _load_encodings() -> dict:
    if os.path.exists(ENCODINGS_FILE):
        with open(ENCODINGS_FILE, "rb") as f:
            return pickle.load(f)
    return {}

def _save_encodings(data: dict):
    with open(ENCODINGS_FILE, "wb") as f:
        pickle.dump(data, f)

def save_face_encoding(student_id: str, encoding: np.ndarray):
    data = _load_encodings()
    data[student_id] = encoding
    _save_encodings(data)

def _b64_to_array(b64_str: str) -> np.ndarray:
    if "," in b64_str:
        b64_str = b64_str.split(",")[1]
    img_bytes = base64.b64decode(b64_str)
    img       = Image.open(io.BytesIO(img_bytes)).convert("RGB")
    return np.array(img)

# ── Enrollment ───────────────────────────────────────────────────────────────

def encode_face_from_base64(b64_str: str, check_liveness: bool = False, liveness_threshold: float = 0.7):
    """Царай бүртгэх — liveness шалгалттай."""
    try:
        img_array = _b64_to_array(b64_str)
        locations = face_recognition.face_locations(img_array, model="hog")
        if len(locations) == 0:
            return None, "Зурагт царай илэрсэнгүй. Сайн гэрэлтэй газар дахин оролдоно уу."
        if len(locations) > 1:
            return None, "Зураганд олон царай илэрлээ. Зөвхөн нэг хүний зургийг ашиглана уу."

        # Liveness шалгалт (enrollment-д optional)
        if check_liveness:
            from utils.liveness import check_liveness_from_b64
            top, right, bottom, left = locations[0]
            liveness = check_liveness_from_b64(b64_str, face_location=(top, right, bottom, left), threshold=liveness_threshold)
            if not liveness.get("skipped") and not liveness["is_live"]:
                return None, f"Бодит хүн биш байна. Камерт шууд харна уу. (Итгэлцэл: {liveness['confidence']*100:.0f}%)"

        encodings = face_recognition.face_encodings(img_array, locations)
        return encodings[0], None
    except Exception as e:
        return None, f"Зургийг боловсруулахад алдаа гарлаа: {str(e)}"

# ── Single recognize ─────────────────────────────────────────────────────────

def recognize_face_from_base64(b64_str: str, tolerance: float = 0.5,
                                check_liveness: bool = True, liveness_threshold: float = 0.7):
    try:
        img_array = _b64_to_array(b64_str)
        locations = face_recognition.face_locations(img_array, model="hog")
        if not locations:
            return None, "Царай илэрсэнгүй"

        unknown_encodings = face_recognition.face_encodings(img_array, locations)
        if not unknown_encodings:
            return None, "Царай шифрлэхэд алдаа гарлаа"

        # Liveness шалгалт
        if check_liveness:
            from utils.liveness import check_liveness_from_b64
            top, right, bottom, left = locations[0]
            liveness = check_liveness_from_b64(b64_str, face_location=(top, right, bottom, left), threshold=liveness_threshold)
            if not liveness.get("skipped") and not liveness["is_live"]:
                return None, f"⚠️ Утасны зураг илэрлээ! Бодит хүн камерт харна уу. (Итгэлцэл: {liveness['confidence']*100:.0f}%)"

        unknown_enc = unknown_encodings[0]
        known       = _load_encodings()
        if not known:
            return None, "Бүртгэлтэй царай байхгүй байна"

        student_ids = list(known.keys())
        known_encs  = [known[sid] for sid in student_ids]
        distances   = face_recognition.face_distance(known_encs, unknown_enc)
        best_idx    = int(np.argmin(distances))
        best_dist   = float(distances[best_idx])
        if best_dist > tolerance:
            return None, None
        return {"student_id": student_ids[best_idx], "confidence": round((1 - best_dist) * 100, 1)}, None
    except Exception as e:
        return None, f"Царай таних үед алдаа гарлаа: {str(e)}"

# ── Multi-face recognize ─────────────────────────────────────────────────────

def recognize_multiple_faces(b64_str: str, tolerance: float = 0.5,
                              check_liveness: bool = True, liveness_threshold: float = 0.7):
    """Нэг кадрт олон царай зэрэг таньж, liveness шалгана."""
    try:
        img_array = _b64_to_array(b64_str)
        small     = np.array(Image.fromarray(img_array).resize(
            (img_array.shape[1] // 2, img_array.shape[0] // 2)
        ))
        locations = face_recognition.face_locations(small, model="hog")
        if not locations:
            return [], None

        unknown_encodings = face_recognition.face_encodings(small, locations)
        known = _load_encodings()
        if not known:
            return [], "Бүртгэлтэй царай байхгүй байна"

        student_ids = list(known.keys())
        known_encs  = [known[sid] for sid in student_ids]

        # Бүх царайн liveness зэрэг шалгах
        liveness_results = []
        if check_liveness:
            from utils.liveness import check_liveness_batch
            # 2x scale буцаах
            orig_locs = [(t*2, r*2, b*2, l*2) for t, r, b, l in locations]
            liveness_results = check_liveness_batch(b64_str, orig_locs, threshold=liveness_threshold)

        results = []
        for i, (enc, loc) in enumerate(zip(unknown_encodings, locations)):
            top, right, bottom, left = loc
            orig_loc = [top*2, right*2, bottom*2, left*2]

            # Liveness үр дүн
            lv = liveness_results[i] if liveness_results else {"is_live": True, "confidence": 1.0}
            is_live    = lv.get("is_live", True)
            lv_score   = lv.get("confidence", 1.0)
            lv_skipped = lv.get("skipped", False)

            # Spoof илэрсэн
            if check_liveness and not lv_skipped and not is_live:
                results.append({
                    "student_id": None,
                    "confidence": 0,
                    "location":   orig_loc,
                    "recognized": False,
                    "spoof":      True,
                    "liveness_score": lv_score,
                })
                continue

            # Face recognition
            distances = face_recognition.face_distance(known_encs, enc)
            best_idx  = int(np.argmin(distances))
            best_dist = float(distances[best_idx])

            if best_dist <= tolerance:
                results.append({
                    "student_id":     student_ids[best_idx],
                    "confidence":     round((1 - best_dist) * 100, 1),
                    "location":       orig_loc,
                    "recognized":     True,
                    "spoof":          False,
                    "liveness_score": round(lv_score * 100, 1),
                })
            else:
                results.append({
                    "student_id":     None,
                    "confidence":     0,
                    "location":       orig_loc,
                    "recognized":     False,
                    "spoof":          False,
                    "liveness_score": round(lv_score * 100, 1),
                })

        return results, None

    except Exception as e:
        return [], f"Олон царай таних үед алдаа гарлаа: {str(e)}"