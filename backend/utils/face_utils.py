"""
InsightFace (ArcFace buffalo_sc) суурьтай царай танилт.
buffalo_sc: ~20MB, CPU дээр хурдан, buffalo_l-тэй харьцуулахад 5x хурдан.
"""
import numpy as np
import base64
import os
import cv2
import time
from PIL import Image
import io
from database import get_db
import logging

logger = logging.getLogger(__name__)

# ── Тохиргоо ──────────────────────────────────────────────────────────────────
TOLERANCE_DEFAULT = 0.45   # buffalo_sc cosine distance (бага=илүү нарийн, 0.45=нарийвчлал нэмэгдсэн)
MIN_GAP           = 0.08   # 2 хүний зайн ялгаа — давхардлаас хамгаалах
MAX_SAMPLES       = 5      # нэг хүний зурагийн тоо
MODEL_NAME        = "buffalo_sc"  # buffalo_l (280MB) → buffalo_sc (~20MB, 5x хурдан)

_face_app = None

# ── In-memory encoding cache ──────────────────────────────────────────────────
_enc_cache: dict | None = None
_enc_cache_time: float  = 0.0
ENC_CACHE_TTL           = 30  # секунд


def _get_app():
    """InsightFace FaceAnalysis app-ийг lazy init хийнэ."""
    global _face_app
    if _face_app is None:
        try:
            from insightface.app import FaceAnalysis
            model_root = os.environ.get("INSIGHTFACE_HOME", "/app/models")
            _face_app = FaceAnalysis(
                name=MODEL_NAME,
                root=model_root,
                providers=["CUDAExecutionProvider", "CPUExecutionProvider"],
            )
            _face_app.prepare(ctx_id=-1, det_size=(640, 640))
            logger.info(f"InsightFace {MODEL_NAME} initialized (det_size=640x640)")
        except Exception as e:
            logger.error(f"InsightFace init failed: {e}")
            raise
    return _face_app


def warmup():
    """Startup-т загварыг урьдчилан ачаалах — эхний хүсэлтийн удаашралыг арилгана."""
    try:
        app = _get_app()
        dummy = np.zeros((320, 320, 3), dtype=np.uint8)
        app.get(dummy)
        logger.info("InsightFace warm-up дууслаа")
    except Exception as e:
        logger.warning(f"Warm-up алдаа (үргэлжилнэ): {e}")


def _b64_to_bgr(b64_str: str) -> np.ndarray:
    """base64 → BGR numpy array."""
    if "," in b64_str:
        b64_str = b64_str.split(",")[1]
    img_bytes = base64.b64decode(b64_str)
    pil_img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
    return cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)


# ── DB helpers ────────────────────────────────────────────────────────────────

def _load_encodings() -> dict[str, list[np.ndarray]]:
    """Memory cache-аас буцаана; TTL дууссан үед DB-ээс дахин уншина."""
    global _enc_cache, _enc_cache_time
    now = time.monotonic()
    if _enc_cache is not None and (now - _enc_cache_time) < ENC_CACHE_TTL:
        return _enc_cache

    db = get_db()
    result = {}
    for doc in db.face_encodings.find():
        sid = doc["student_id"]
        if doc.get("encodings"):
            result[sid] = [np.array(e) for e in doc["encodings"]]
        elif doc.get("encoding"):
            result[sid] = [np.array(doc["encoding"])]

    _enc_cache      = result
    _enc_cache_time = now
    return result


def invalidate_encoding_cache():
    """Царай бүртгэсний дараа cache-ийг шууд хүчингүй болгоно."""
    global _enc_cache_time
    _enc_cache_time = 0.0


def save_face_encoding(student_id: str, encoding: np.ndarray):
    """Хамгийн ихдээ MAX_SAMPLES encoding хадгална."""
    db  = get_db()
    doc = db.face_encodings.find_one({"student_id": student_id})
    enc = (encoding / np.linalg.norm(encoding)).tolist()

    if doc:
        lst = doc.get("encodings") or ([doc["encoding"]] if doc.get("encoding") else [])
        if len(lst) >= MAX_SAMPLES:
            lst.pop(0)
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
    invalidate_encoding_cache()
    if doc:
        old_list = doc.get("encodings") or ([doc["encoding"]] if doc.get("encoding") else [])
        new_count = min(len(old_list) + 1, MAX_SAMPLES)
    else:
        new_count = 1
    logger.info(f"Saved ArcFace encoding for {student_id} (total: {new_count})")


def get_face_encoding(student_id: str) -> np.ndarray | None:
    db  = get_db()
    doc = db.face_encodings.find_one({"student_id": student_id})
    if not doc:
        return None
    if doc.get("encodings"):
        return np.array(doc["encodings"][-1])
    return np.array(doc["encoding"]) if doc.get("encoding") else None


# ── Cosine distance matching ──────────────────────────────────────────────────

def _best_match(
    unknown_enc: np.ndarray,
    known: dict[str, list[np.ndarray]],
    tolerance: float = TOLERANCE_DEFAULT,
) -> tuple[str | None, float]:
    """ArcFace cosine distance ашиглан хамгийн ойр хүнийг олно."""
    if not known:
        return None, 1.0

    per_person: list[tuple[float, str]] = []
    for sid, encs in known.items():
        sims     = [float(np.dot(unknown_enc, enc)) for enc in encs]
        best_dist = 1.0 - max(sims)
        per_person.append((best_dist, sid))

    per_person.sort(key=lambda x: x[0])
    best_dist, best_sid = per_person[0]

    if best_dist > tolerance:
        return None, best_dist

    if len(per_person) > 1:
        gap = per_person[1][0] - best_dist
        if gap < MIN_GAP:
            return None, best_dist

    return best_sid, best_dist


# ── Enrollment ────────────────────────────────────────────────────────────────

def encode_face_from_base64(
    b64_str: str,
    check_liveness: bool = False,
    liveness_threshold: float = 0.45,
):
    """Зургаас нэг царайн ArcFace embedding олж буцаана."""
    try:
        img_bgr = _b64_to_bgr(b64_str)
        app     = _get_app()
        faces   = app.get(img_bgr)

        if len(faces) == 0:
            return None, "Зурагт царай илэрсэнгүй. Зураг тод, шулуун харсан байх ёстой."
        if len(faces) > 1:
            return None, "Зураганд олон царай илэрлээ. Зөвхөн нэг хүний зургийг ашиглана уу."

        face = faces[0]
        if face.det_score < 0.60:
            return None, f"Царай тодорхой биш байна. (Итгэлцэл: {face.det_score*100:.0f}%)"

        if check_liveness:
            try:
                from utils.liveness import check_liveness_from_b64
                x1, y1, x2, y2 = face.bbox.astype(int)
                liveness = check_liveness_from_b64(
                    b64_str, face_location=(x1, y1, x2, y2), threshold=liveness_threshold
                )
                if not liveness.get("skipped") and not liveness["is_live"]:
                    return None, f"Бодит хүн биш байна. (Итгэлцэл: {liveness['confidence']*100:.0f}%)"
            except Exception:
                pass

        return face.normed_embedding, None
    except Exception as e:
        logger.error(f"encode_face_from_base64 error: {e}")
        return None, f"Зургийг боловсруулахад алдаа гарлаа: {str(e)}"


# ── Single recognize ──────────────────────────────────────────────────────────

def recognize_face_from_base64(
    b64_str: str,
    tolerance: float = TOLERANCE_DEFAULT,
):
    """Зургаас нэг царай таньж student_id болон confidence буцаана."""
    try:
        img_bgr = _b64_to_bgr(b64_str)
        app     = _get_app()
        faces   = app.get(img_bgr)

        if not faces:
            return None, None

        known   = _load_encodings()
        results = []
        for face in faces:
            sid, dist = _best_match(face.normed_embedding, known, tolerance)
            if sid:
                results.append({"student_id": sid, "confidence": round((1 - dist) * 100, 1)})

        if not results:
            return None, None
        results.sort(key=lambda x: x["confidence"], reverse=True)
        return results[0], None
    except Exception as e:
        logger.error(f"recognize_face_from_base64 error: {e}")
        return None, str(e)


# ── Multi-face recognize ──────────────────────────────────────────────────────

def recognize_multiple_faces(
    b64_str: str,
    tolerance: float = TOLERANCE_DEFAULT,
    check_liveness: bool = False,
):
    """Нэг кадрт байгаа бүх царайг зэрэг таньж жагсаалт буцаана.

    check_liveness нь route-уудтай нийцтэй байлгах optional flag; liveness шалгалт
    attendance route дээр тусдаа хийгддэг.
    """
    try:
        img_bgr = _b64_to_bgr(b64_str)
        app     = _get_app()
        faces   = app.get(img_bgr)

        if not faces:
            return [], None

        known   = _load_encodings()
        results = []

        for face in faces:
            x1, y1, x2, y2 = face.bbox.astype(int)
            location = (int(y1), int(x2), int(y2), int(x1))

            sid, dist = _best_match(face.normed_embedding, known, tolerance)
            results.append({
                "recognized": sid is not None,
                "student_id": sid,
                "confidence": round((1 - dist) * 100, 1) if sid else 0,
                "location":   location,
                "bbox":       [int(x1), int(y1), int(x2), int(y2)],
            })

        return results, None
    except Exception as e:
        logger.error(f"recognize_multiple_faces error: {e}")
        return [], str(e)
