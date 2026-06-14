"""
Multi-face scalability test
============================
Olivetti датасетаас N царайг нэг зурган дотор байрлуулж
InsightFace buffalo_sc-ийн multi-face detection+recognition туршина.
N = 20, 30, 50, 100, 150, 200

Ажиллуулах: python evaluate_scalability.py
"""

import sys, json, time, math
from pathlib import Path
from datetime import datetime
import numpy as np

MODEL_NAME  = "buffalo_sc"
MODEL_ROOT  = Path("backend/models")
RESULTS_DIR = Path("eval_output")
FACE_SIZE   = 160        # grid дотор нэг царайн пиксель
THRESHOLD   = 0.45
TEST_COUNTS = [20, 30, 50, 100, 150, 200]

# ─── ДАТАСЕТ ─────────────────────────────────────────────────────────────────

def load_olivetti():
    try:
        from sklearn.datasets import fetch_olivetti_faces
    except ImportError:
        print("pip install scikit-learn")
        sys.exit(1)
    data   = fetch_olivetti_faces(shuffle=False, data_home=".olivetti_cache")
    return data.images, data.target   # (400,64,64) float32, (400,) int


# ─── INSIGHTFACE ─────────────────────────────────────────────────────────────

def make_app(det_size):
    try:
        from insightface.app import FaceAnalysis
    except ImportError:
        print("pip install insightface onnxruntime")
        sys.exit(1)
    root = str(MODEL_ROOT) if MODEL_ROOT.exists() else ".insightface_cache"
    app  = FaceAnalysis(name=MODEL_NAME, root=root,
                        providers=["CPUExecutionProvider"])
    app.prepare(ctx_id=-1, det_size=det_size)
    return app


# ─── ENROLLMENT (тусдаа жижиг app) ──────────────────────────────────────────

def build_enrollment(images, labels, enroll_n=5):
    import cv2
    print("  Enrollment app (det_size=320) ачаалж байна...")
    app = make_app((320, 320))
    enrolled = {}
    for pid in sorted(set(labels)):
        idxs = [i for i, l in enumerate(labels) if l == pid][:enroll_n]
        embs = []
        for idx in idxs:
            gray = (images[idx] * 255).astype(np.uint8)
            bgr  = __to_bgr(gray, 300)
            for size in [300, 480]:
                bgr2  = __to_bgr(gray, size)
                faces = app.get(bgr2)
                if faces:
                    best = max(faces,
                               key=lambda f: (f.bbox[2]-f.bbox[0])*(f.bbox[3]-f.bbox[1]))
                    embs.append(best.normed_embedding)
                    break
        if embs:
            enrolled[pid] = embs
    print(f"  Enrollment дууслаа: {len(enrolled)} субъект бүртгэгдлээ.")
    return enrolled


def __to_bgr(gray_u8, size):
    import cv2
    up = cv2.resize(gray_u8, (size, size), interpolation=cv2.INTER_LANCZOS4)
    return cv2.cvtColor(up, cv2.COLOR_GRAY2BGR)


# ─── GRID ҮҮСГЭХ ─────────────────────────────────────────────────────────────

def build_grid(face_imgs_gray, face_size, n):
    import cv2
    cols   = math.ceil(math.sqrt(n))
    rows   = math.ceil(n / cols)
    canvas = np.zeros((rows * face_size, cols * face_size, 3), dtype=np.uint8)
    for i, f32 in enumerate(face_imgs_gray[:n]):
        gray = (f32 * 255).astype(np.uint8)
        bgr  = cv2.cvtColor(
            cv2.resize(gray, (face_size, face_size), interpolation=cv2.INTER_LANCZOS4),
            cv2.COLOR_GRAY2BGR)
        r, c = divmod(i, cols)
        canvas[r*face_size:(r+1)*face_size, c*face_size:(c+1)*face_size] = bgr
    return canvas


# ─── MATCHING ────────────────────────────────────────────────────────────────

def match_all(detected_embs, enrolled):
    results = []
    for emb in detected_embs:
        best_d, best_id = 1.0, None
        for pid, refs in enrolled.items():
            d = min(float(1.0 - np.dot(emb, e)) for e in refs)
            if d < best_d:
                best_d, best_id = d, pid
        results.append((best_id, best_d) if best_d <= THRESHOLD else (None, best_d))
    return results


# ─── НЭГ N-Н ТУРШИЛТ ─────────────────────────────────────────────────────────

def run_single(app, enrolled, test_faces, n, repeats=5):
    faces_for_grid  = [f for f, _ in test_faces[:n]]
    labels_for_grid = [l for _, l in test_faces[:n]]

    cols  = math.ceil(math.sqrt(n))
    rows  = math.ceil(n / cols)
    img_w, img_h = cols * FACE_SIZE, rows * FACE_SIZE

    grid = build_grid(faces_for_grid, FACE_SIZE, n)
    print(f"    Grid: {img_w}x{img_h} px")

    det_ms_list, rec_ms_list = [], []
    det_counts = []

    for _ in range(repeats):
        t0    = time.perf_counter()
        faces = app.get(grid)
        t1    = time.perf_counter()

        embs = [f.normed_embedding for f in faces]
        match_all(embs, enrolled)
        t2   = time.perf_counter()

        det_ms_list.append((t1 - t0) * 1000)
        rec_ms_list.append((t2 - t1) * 1000)
        det_counts.append(len(faces))

    detected_n = int(round(np.mean(det_counts)))
    det_rate   = round(detected_n / n * 100, 1)

    # Accuracy — сүүлийн repeat
    faces_last = app.get(grid)
    matches    = match_all([f.normed_embedding for f in faces_last], enrolled)
    matched_ids = [m[0] for m in matches if m[0] is not None]

    correct = 0
    remaining = list(matched_ids)
    for pid in labels_for_grid:
        if pid in remaining:
            correct += 1
            remaining.remove(pid)

    rec_rate = round(correct / n * 100, 1)

    det  = np.array(det_ms_list)
    rec  = np.array(rec_ms_list)
    tot  = det + rec

    return {
        "n_faces":          n,
        "grid_px":          f"{img_w}x{img_h}",
        "detected":         detected_n,
        "detection_rate":   det_rate,
        "recognition_rate": rec_rate,
        "correct":          correct,
        "detection_ms":  {"mean": round(float(det.mean()),1),  "p95": round(float(np.percentile(det,95)),1)},
        "recognition_ms":{"mean": round(float(rec.mean()),1),  "p95": round(float(np.percentile(rec,95)),1)},
        "total_ms":      {"mean": round(float(tot.mean()),1),  "p95": round(float(np.percentile(tot,95)),1)},
        "fps":           round(1000 / tot.mean(), 2),
    }


# ─── БҮГДИЙГ ХАМАРСАН ТУРШИЛТ ────────────────────────────────────────────────

def run_all():
    RESULTS_DIR.mkdir(exist_ok=True)

    print("Датасет ачаалж байна...")
    images, labels = load_olivetti()
    print(f"  {len(images)} зураг, {len(set(labels))} субъект.")

    # Enrollment (320x320 app)
    enrolled = build_enrollment(images, labels, enroll_n=5)
    if not enrolled:
        print("  Enrollment бүтэлгүйтлээ.")
        sys.exit(1)

    # Grid тест (1280x1280 app — том зургийн олон царай)
    print("\n  Grid тест app (det_size=1280) ачаалж байна...")
    test_app = make_app((1280, 1280))

    # Тест зургуудыг бэлдэнэ (6..10-р зураг)
    test_faces = []
    for pid in sorted(set(labels)):
        idxs = [i for i, l in enumerate(labels) if l == pid][5:]
        for idx in idxs:
            test_faces.append((images[idx], pid))

    # 200 хүрэхийн тулд давтах
    while len(test_faces) < max(TEST_COUNTS):
        test_faces = test_faces * 2
    test_faces = test_faces[:max(TEST_COUNTS)]

    all_results = []

    print("\n" + "=" * 74)
    print(f"  {'N':>5}  {'Илэрсэн%':>10}  {'Танилт%':>9}  "
          f"{'Det ms':>8}  {'Rec ms':>8}  {'Нийт ms':>9}  {'FPS':>6}")
    print("  " + "-" * 68)

    for n in TEST_COUNTS:
        print(f"\n  [{n} царай] туршиж байна...")
        res = run_single(test_app, enrolled, test_faces, n, repeats=5)
        all_results.append(res)

        print(f"  {n:>5}  "
              f"{res['detection_rate']:>9}%  "
              f"{res['recognition_rate']:>8}%  "
              f"{res['detection_ms']['mean']:>8}  "
              f"{res['recognition_ms']['mean']:>8}  "
              f"{res['total_ms']['mean']:>9}  "
              f"{res['fps']:>6}")

    # ── Нэгтгэсэн хүснэгт ─────────────────────────────────────────────────
    print("\n\n" + "=" * 74)
    print("  НЭГТГЭСЭН ДҮН  (InsightFace buffalo_sc ArcFace, CPU)")
    print("=" * 74)
    print(f"\n  {'Хүн тоо':>7} | {'Илэрсэн%':>9} | {'Танилт%':>8} | "
          f"{'Det ms':>8} | {'Rec ms':>8} | {'Нийт ms':>9} | {'FPS':>6}")
    print("  " + "-" * 66)
    for r in all_results:
        print(f"  {r['n_faces']:>7} | "
              f"{r['detection_rate']:>8}% | "
              f"{r['recognition_rate']:>7}% | "
              f"{r['detection_ms']['mean']:>8} | "
              f"{r['recognition_ms']['mean']:>8} | "
              f"{r['total_ms']['mean']:>9} | "
              f"{r['fps']:>6}")

    print(f"""
  Тайлбар:
    Det ms  — Зурган дахь N царайг нэгэн зэрэг илрүүлэх хугацаа (ms)
    Rec ms  — N embedding-ийг DB-тэй харьцуулан таних хугацаа (ms)
    Нийт ms — Det + Rec
    FPS     — 1000 / нийт_ms
    Загвар  — {MODEL_NAME} (ArcFace, CPU-only)
    Босго   — {THRESHOLD} (cosine distance)""")

    # JSON
    ts   = datetime.now().strftime("%Y%m%d_%H%M%S")
    path = RESULTS_DIR / f"scalability_{ts}.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump({
            "timestamp": ts, "model": MODEL_NAME,
            "threshold": THRESHOLD, "face_size_px": FACE_SIZE,
            "results": all_results,
        }, f, ensure_ascii=False, indent=2)

    print(f"\n  JSON: {path}")
    print("=" * 74)


if __name__ == "__main__":
    run_all()
