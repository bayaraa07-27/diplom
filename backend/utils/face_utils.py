import face_recognition
import numpy as np
import base64
import os
from PIL import Image
import io
from database import get_db
import logging

logger = logging.getLogger(__name__)

# ── Constants ─────────────────────────────────────────────────────────────────
# Хэт өргөн tolerance → буруу хүнийг таниx.  0.38 = 62%+ ижилтэл шаардана.
TOLERANCE_DEFAULT = 0.38
# Best-vs-second gap: хамгийн ойр хоёр хүний зай наад зах нь энэ хэмжээ ялгаатай байх ёстой.
# Жижиг gap → хоёр хүн хэт төстэй → бүртгэхгүй.
MIN_GAP           = 0.06
# Нэг хүний хэдэн encoding хадгалах вэ (өнцөг, гэрлийн ялгаанд тэсвэртэй байна)
MAX_SAMPLES       = 5


# ── DB helpers ───────────────────────────────────────────────────────────────

def _load_encodings() -> dict[str, list[np.ndarray]]:
    """
    student_id → [enc1, enc2, ...] буцаана.
    Хуучин нэг encoding-тай бичлэгтэй backward-compatible.
    """
    db = get_db()
    result = {}
    for doc in db.face_encodings.find():
        sid = doc["student_id"]
        if doc.get("encodings"):
            result[sid] = [np.array(e) for e in doc["encodings"]]
        elif doc.get("encoding"):
            result[sid] = [np.array(doc["encoding"])]
    return result


def save_face_encoding(student_id: str, encoding: np.ndarray):
    """
    Хамгийн ихдээ MAX_SAMPLES тусдаа encoding хадгална.
    Дундажлах биш — тусдаа хадгалснаар өнцөг/гэрлийн ялгааг давж чадна.
    """
    db  = get_db()
    doc = db.face_encodings.find_one({"student_id": student_id})
    enc = (encoding / np.linalg.norm(encoding)).tolist()

    if doc:
        lst = doc.get("encodings") or ([doc["encoding"]] if doc.get("encoding") else [])
        if len(lst) >= MAX_SAMPLES:
            lst.pop(0)          # хамгийн хуучныг хасна
        lst.append(enc)
        db.face_encodings.update_one(
            {"student_id": student_id},
            {"$set": {"encodings": lst, "encoding": lst[-1], "sample_count": len(lst)}},
        )
    else:
        db.face_encodings.update_one(
            {"student_id": student_id},
            {"$set": {"encodings": [enc], "encoding": enc, "sample_count": 1}},
            upsert=True,
        )
    count = len(doc.get("encodings", [])) + 1 if doc else 1
    logger.info(f"Saved encoding for {student_id} (total samples: {min(count, MAX_SAMPLES)})")


def get_face_encoding(student_id: str) -> np.ndarray | None:
    db  = get_db()
    doc = db.face_encodings.find_one({"student_id": student_id})
    if not doc:
        return None
    if doc.get("encodings"):
        return np.array(doc["encodings"][-1])
    return np.array(doc["encoding"]) if doc.get("encoding") else None


def _b64_to_array(b64_str: str) -> np.ndarray:
    if "," in b64_str:
        b64_str = b64_str.split(",")[1]
    return np.array(Image.open(io.BytesIO(base64.b64decode(b64_str))).convert("RGB"))


# ── Detection ─────────────────────────────────────────────────────────────────

def _detect_with_best_model(img_array: np.ndarray, upsample: int = 1) -> list:
    use_cnn = os.environ.get("FACE_USE_CNN", "false").lower() == "true"
    if use_cnn:
        locs = face_recognition.face_locations(img_array, model="cnn")
        if locs:
            return locs
    return face_recognition.face_locations(
        img_array, model="hog", number_of_times_to_upsample=upsample
    )


# ── Best-match logic ──────────────────────────────────────────────────────────

def _best_match(unknown_enc: np.ndarray,
                known: dict[str, list[np.ndarray]],
                tolerance: float = TOLERANCE_DEFAULT) -> tuple[str | None, float]:
    """
    Бүртгэлтэй хүн бүрийн ХАМГИЙН ОЙРЫН encoding-тай харьцуулж
    нийт хамгийн бага зайг олно.

    Буцаах утга: (student_id | None, best_distance)

    Хамгаалалт:
    - best_dist > tolerance → таниxгүй
    - best_dist-second_best_dist < MIN_GAP → хэт төстэй 2 хүн → таниxгүй
    """
    if not known:
        return None, 1.0

    per_person_best: list[tuple[float, str]] = []

    for sid, encs in known.items():
        distances = face_recognition.face_distance(encs, unknown_enc)
        per_person_best.append((float(np.min(distances)), sid))

    per_person_best.sort(key=lambda x: x[0])
    best_dist, best_sid = per_person_best[0]

    if best_dist > tolerance:
        logger.debug(f"No match: best_dist={best_dist:.3f} > tolerance={tolerance}")
        return None, best_dist

    # Gap шалгалт: хоёрдугаар хамгийн ойр хүнтэй хэр ялгаатай вэ
    if len(per_person_best) > 1:
        second_dist = per_person_best[1][0]
        gap = second_dist - best_dist
        if gap < MIN_GAP:
            logger.debug(
                f"Ambiguous: best={best_dist:.3f}({best_sid}) "
                f"second={second_dist:.3f} gap={gap:.3f} < {MIN_GAP}"
            )
            return None, best_dist

    logger.debug(f"Match: {best_sid} dist={best_dist:.3f}")
    return best_sid, best_dist


# ── Enrollment ────────────────────────────────────────────────────────────────

def encode_face_from_base64(b64_str: str, check_liveness: bool = False,
                             liveness_threshold: float = 0.6):
    try:
        img_array = _b64_to_array(b64_str)

        h, w = img_array.shape[:2]
        if w < 640 or h < 480:
            scale = max(640 / w, 480 / h)
            img_array = np.array(Image.fromarray(img_array).resize((int(w*scale), int(h*scale))))

        locations = _detect_with_best_model(img_array, upsample=2)
        if len(locations) == 0:
            return None, "Зурагт царай илэрсэнгүй. Зураг тод, дэлхий харагдаж байх ёстой."
        if len(locations) > 1:
            return None, "Зураганд олон царай илэрлээ. Зөвхөн нэг хүний зургийг ашиглана уу."

        if check_liveness:
            from utils.liveness import check_liveness_from_b64
            top, right, bottom, left = locations[0]
            liveness = check_liveness_from_b64(
                b64_str, face_location=(left, top, right, bottom), threshold=liveness_threshold
            )
            if not liveness.get("skipped") and not liveness["is_live"]:
                return None, f"Бодит хүн биш байна. (Итгэлцэл: {liveness['confidence']*100:.0f}%)"

        # num_jitters=20: enrollment нэг удаа хийгддэг тул маш нарийвчлалтай encoding үүсгэнэ
        encodings = face_recognition.face_encodings(img_array, locations, num_jitters=20)
        return encodings[0], None
    except Exception as e:
        return None, f"Зургийг боловсруулахад алдаа гарлаа: {str(e)}"


# ── Single recognize ──────────────────────────────────────────────────────────

def recognize_face_from_base64(b64_str: str, tolerance: float = TOLERANCE_DEFAULT,
                                check_liveness: bool = False, liveness_threshold: float = 0.6):
    try:
        img_array = _b64_to_array(b64_str)
        locations = _detect_with_best_model(img_array)
        if not locations:
            return None, "Царай илэрсэнгүй"

        unknown_encodings = face_recognition.face_encodings(img_array, locations, num_jitters=4)
        if not unknown_encodings:
            return None, "Царай шифрлэхэд алдаа гарлаа"

        if check_liveness:
            from utils.liveness import check_liveness_from_b64
            top, right, bottom, left = locations[0]
            liveness = check_liveness_from_b64(
                b64_str, face_location=(left, top, right, bottom), threshold=liveness_threshold
            )
            if not liveness.get("skipped") and not liveness["is_live"]:
                return None, f"⚠️ Бодит хүн биш. (Итгэлцэл: {liveness['confidence']*100:.0f}%)"

        known = _load_encodings()
        if not known:
            return None, "Бүртгэлтэй царай байхгүй байна"

        sid, dist = _best_match(unknown_encodings[0], known, tolerance)
        if sid is None:
            return None, None
        return {"student_id": sid, "confidence": round((1 - dist) * 100, 1)}, None
    except Exception as e:
        return None, f"Царай таних үед алдаа гарлаа: {str(e)}"


# ── Multi-face recognize ──────────────────────────────────────────────────────

def recognize_multiple_faces(b64_str: str, tolerance: float = TOLERANCE_DEFAULT):
    """Нэг кадрт олон царай зэрэг таниx."""
    try:
        img_array = _b64_to_array(b64_str)

        # Full-size detection — ½ хэмжээнд bbox алдаа гардаг байсан
        locations = _detect_with_best_model(img_array, upsample=1)
        if not locations:
            return [], None

        # num_jitters=4: нэг фрэймийн encoding нарийвчлалыг сайжруулж, хурдыг хэвээр хадгална
        unknown_encodings = face_recognition.face_encodings(
            img_array, locations, num_jitters=4
        )

        known = _load_encodings()
        if not known:
            return [], "Бүртгэлтэй царай байхгүй байна"

        results = []
        for enc, loc in zip(unknown_encodings, locations):
            top, right, bottom, left = loc
            orig_loc = [top, right, bottom, left]

            sid, dist = _best_match(enc, known, tolerance)

            if sid is not None:
                results.append({
                    "student_id": sid,
                    "confidence": round((1 - dist) * 100, 1),
                    "location":   orig_loc,
                    "recognized": True,
                    "spoof":      False,
                    "liveness_score": 100,
                })
            else:
                results.append({
                    "student_id": None,
                    "confidence": 0,
                    "location":   orig_loc,
                    "recognized": False,
                    "spoof":      False,
                    "liveness_score": 100,
                })

        return results, None

    except Exception as e:
        return [], f"Олон царай таних үед алдаа гарлаа: {str(e)}"
