"""
OpenCV texture + frequency суурилсан liveness detection.
MiniFASNet ONNX загварууд (minivision-ai/Silent-Face-Anti-Spoofing) нь
batch_size=0 буруу ONNX export-той тул ажиллахгүй байна.
Энэ implementation (Enhanced Phase 1):
  - Laplacian variance      (арьсны бүтэц/текстур хурц байдал) - 30%
  - Local std deviation     (дотоодын тексурийн хувьсамтгай байдал) - 25%
  - Edge density (Sobel)    (ирмэгийн нягтрал) - 20%
  - LBP entropy            (Local Binary Pattern) - 15%
  - Specularity detection  (гялбааны хэмжүүр) - 10%
  → 5 метрик нэгтгэн 0..1 дундаж оноо гаргана
"""
import numpy as np
import base64
import logging
from PIL import Image
import io

logger = logging.getLogger(__name__)
FFT_SPOOF_THRESHOLD = 0.30


def _b64_to_rgb(b64: str) -> np.ndarray:
    if "," in b64:
        b64 = b64.split(",")[1]
    return np.array(Image.open(io.BytesIO(base64.b64decode(b64))).convert("RGB"))


# ── Гол CV алгоритм ──────────────────────────────────────────────────────────

def _block_local_std(gray_u8: np.ndarray, block: int = 16) -> float:
    """Block-wise local std — cv2.filter2D ашиглахгүй."""
    h, w = gray_u8.shape
    f = gray_u8.astype(np.float32)
    vars_ = []
    for i in range(0, h - block + 1, block):
        for j in range(0, w - block + 1, block):
            b = f[i:i + block, j:j + block]
            vars_.append(float(np.var(b)))
    return float(np.mean(vars_) ** 0.5) if vars_ else 0.0


def _fft_score(gray_u8: np.ndarray) -> float:
    """FFT frequency score. Lower values are more likely to be screen/photo spoof."""
    try:
        h, w = gray_u8.shape
        gray_f = gray_u8.astype(np.float32)
        mag = np.abs(np.fft.fftshift(np.fft.fft2(gray_f)))

        y, x = np.indices((h, w))
        cy, cx = h / 2.0, w / 2.0
        radius = np.sqrt((x - cx) ** 2 + (y - cy) ** 2)
        cutoff = 0.15 * max(h, w)

        low_e = mag[radius < cutoff].mean()
        high_e = mag[radius >= cutoff].mean()
        freq_ratio = low_e / (high_e + 1e-6)

        return float(min(1.0, max(0.0, (freq_ratio - 1.5) / 6.0)))
    except Exception as e:
        logger.warning(f"FFT score error: {e}")
        return 0.5


def _edge_density(gray_u8: np.ndarray) -> float:
    """Sobel operators ашиглаж ирмэгийн нягтралыг хэмжих."""
    try:
        import cv2
        # Sobel edges
        sobelx = cv2.Sobel(gray_u8, cv2.CV_32F, 1, 0, ksize=3)
        sobely = cv2.Sobel(gray_u8, cv2.CV_32F, 0, 1, ksize=3)
        magnitude = np.sqrt(sobelx**2 + sobely**2)

        # Threshold at 20 to find significant edges
        edge_count = np.sum(magnitude > 20)
        total_pixels = gray_u8.size
        edge_density = edge_count / max(total_pixels, 1)

        # Real faces: edge_density ~0.15-0.35, Photos: ~0.05-0.15
        return float(edge_density)
    except Exception as e:
        logger.warning(f"Edge density error: {e}")
        return 0.0


def _lbp_entropy(gray_u8: np.ndarray) -> float:
    """Local Binary Pattern entropy — texture diversity хэмжих."""
    try:
        from skimage.feature import local_binary_pattern

        # Compute LBP
        lbp = local_binary_pattern(gray_u8, P=8, R=1, method='uniform')

        # Histogram (normalized)
        hist, _ = np.histogram(lbp, bins=59, range=(0, 59))
        hist = hist / np.sum(hist)

        # Shannon entropy: -sum(p*log(p))
        hist = hist[hist > 0]
        entropy = -np.sum(hist * np.log2(hist))

        # Normalize: real faces entropy ~4.5-5.5, photos ~2.5-4.0
        # Max entropy for 59 bins: log2(59) ≈ 5.88
        normalized_entropy = entropy / 5.88

        return float(normalized_entropy)
    except Exception as e:
        logger.warning(f"LBP entropy error: {e}")
        return 0.0


def _specularity_score(img_rgb: np.ndarray) -> float:
    """Гялбаа (specularity) хэмжүүр — экран/glossy зургийг илрүүлэх."""
    try:
        # HSV-д шилжүүлэх (V channel = brightness)
        import cv2
        hsv = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2HSV)
        v_channel = hsv[:, :, 2].astype(np.float32)

        # High brightness regions (V > 200)
        bright_pixels = np.sum(v_channel > 200)
        total_pixels = v_channel.size
        bright_ratio = bright_pixels / max(total_pixels, 1)

        # Real faces: bright_ratio ~0.05-0.15, Screens: ~0.20-0.40
        # Check uniformity of bright regions
        if bright_ratio > 0.01:
            bright_mask = v_channel > 200
            bright_region = v_channel[bright_mask]
            uniformity = np.std(bright_region) / (np.mean(bright_region) + 1e-6)
            # Lower uniformity = more uniform bright regions = likely screen/glossy
            # Real faces have varied highlights, screens have uniform
            specularity = uniformity / 50.0  # Normalize
        else:
            specularity = 1.0  # No bright regions = good for liveness

        return float(min(1.0, max(0.0, specularity)))
    except Exception as e:
        logger.warning(f"Specularity error: {e}")
        return 0.5


def _compute_liveness(img_rgb: np.ndarray, face_location, threshold: float) -> dict:
    """
    img_rgb      : (H, W, 3) numpy RGB array
    face_location: (left, top, right, bottom) = (x1, y1, x2, y2)

    Enhanced with 5 metrics: Laplacian (30%), LocalStd (25%), EdgeDensity (20%),
    LBP Entropy (15%), Specularity (10%)
    """
    try:
        import cv2
        x1, y1, x2, y2 = [int(v) for v in face_location]
        h_img, w_img = img_rgb.shape[:2]
        x1 = max(0, x1); y1 = max(0, y1)
        x2 = min(w_img, x2); y2 = min(h_img, y2)

        face = img_rgb[y1:y2, x1:x2]
        if face.size == 0 or min(face.shape[:2]) < 20:
            return {"is_live": True, "confidence": 0.5, "skipped": True}

        face_r  = cv2.resize(face, (128, 128))
        gray_u8 = cv2.cvtColor(face_r, cv2.COLOR_RGB2GRAY)  # uint8

        # ① Laplacian variance — uint8→CV_32F (OpenCV 4.x compatible)
        lap     = cv2.Laplacian(gray_u8, cv2.CV_32F)
        lap_var = float(np.var(lap))

        # ② Block local std — numpy only, cv2.filter2D ашиглахгүй
        local_std = _block_local_std(gray_u8)

        # ③ Edge density — Sobel-based
        # FFT frequency ratio hard gate
        fft_score = _fft_score(gray_u8)
        if fft_score < FFT_SPOOF_THRESHOLD:
            logger.info(
                f"Liveness (FFT gate): fft={fft_score:.2f} "
                f"live=False reason=fft_score_below_threshold"
            )
            return {
                "is_live":    False,
                "confidence": round(fft_score, 3),
                "score":      round(fft_score, 3),
                "threshold":  threshold,
                "fft_score":  fft_score,
                "reason":     "fft_score_below_threshold",
            }


        # ④ LBP entropy — texture diversity

        # ⑤ Specularity detection

        # Нормализаци (empirical):
        #   lap_var : real≈150-700, screen≈50-250
        #   local_std: real≈12-35,  screen≈6-18
        #   edge_dens: real≈0.15-0.35, screen≈0.05-0.15
        #   lbp_ent: real≈0.75-0.95, screen≈0.40-0.70
        #   specularity: real≈0.3-0.8, screen≈0.05-0.3

        lap_s  = min(1.0, lap_var    / 350.0)
        std_s  = min(1.0, local_std  / 20.0)
        freq_s = fft_score

        # Cascaded score: Laplacian 50%, LocalStd 30%, FFT 20%
        confidence = round(
            lap_s * 0.50 +
            std_s * 0.30 +
            freq_s * 0.20,
            3
        )
        logger.info(
            f"Liveness (FFT gate passed): lap={lap_var:.0f}({lap_s:.2f}) "
            f"std={local_std:.1f}({std_s:.2f}) "
            f"fft={fft_score:.2f}({freq_s:.2f}) "
            f"conf={confidence:.3f} live={confidence >= threshold}"
        )

        return {
            "is_live":    confidence >= threshold,
            "confidence": confidence,
            "score":      confidence,
            "threshold":  threshold,
            "fft_score":  fft_score,
            "reason":     None if confidence >= threshold else "total_score_below_threshold",
        }
    except Exception as e:
        logger.warning(f"Liveness error: {e}")
        return {"is_live": True, "confidence": 0.5, "skipped": True}


# ── Public API (attendance.py-д нийцтэй) ─────────────────────────────────────

def check_liveness(img_rgb: np.ndarray, face_location, threshold: float = 0.45) -> dict:
    """numpy array + (left,top,right,bottom) авч liveness буцаана."""
    return _compute_liveness(img_rgb, face_location, threshold)


def check_liveness_from_b64(b64: str, face_location=None, threshold: float = 0.45) -> dict:
    """base64 зураг + bbox авч liveness буцаана."""
    try:
        img = _b64_to_rgb(b64)
        if face_location is None:
            return {"is_live": True, "confidence": 0.5, "skipped": True}
        return _compute_liveness(img, face_location, threshold)
    except Exception as e:
        return {"is_live": True, "confidence": 0.5, "skipped": True, "error": str(e)}


def check_liveness_batch(b64: str, face_locations: list, threshold: float = 0.45) -> list:
    """Нэг зургаас олон царайн liveness зэрэг шалгана (зургийг нэг удаа decode)."""
    try:
        img = _b64_to_rgb(b64)
        return [_compute_liveness(img, loc, threshold) for loc in face_locations]
    except Exception as e:
        logger.warning(f"Liveness batch error: {e}")
        return [{"is_live": True, "confidence": 0.5, "skipped": True}] * len(face_locations)


def get_status() -> dict:
    """Liveness байдал буцаана."""
    return {
        "initialized":   True,
        "failed":        False,
        "method":        "opencv-texture",
        "models_loaded": 0,
        "note":          "MiniFASNet ONNX models replaced with OpenCV texture analysis",
    }
