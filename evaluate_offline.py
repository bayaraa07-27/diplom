"""
Офлайн царай танилтын үнэлгээний скрипт
=========================================
sklearn Olivetti faces датасет (= AT&T ORL, 40 хүн x 10 зураг).
InsightFace ArcFace buffalo_sc ашиглан шууд тест хийнэ.
Docker / MongoDB / интернэт линк шаардлагагүй.

Ажиллуулах:
  python evaluate_offline.py
"""

import sys, json, time
from pathlib import Path
from datetime import datetime
import numpy as np

# ─── ТОХИРГОО ────────────────────────────────────────────────────────────────
MODEL_NAME        = "buffalo_sc"
MODEL_ROOT        = Path("backend/models")
ENROLL_PER_PERSON = 5     # 1..10, тест = 10 - ENROLL_PER_PERSON
THRESHOLD         = 0.45  # face_utils.py-н TOLERANCE_DEFAULT
RESULTS_DIR       = Path("eval_output")

# ─── ДАТАСЕТ ─────────────────────────────────────────────────────────────────

def load_dataset():
    """sklearn Olivetti faces: 400 x (64x64) grayscale, 40 subject"""
    try:
        from sklearn.datasets import fetch_olivetti_faces
    except ImportError:
        print("scikit-learn суулгана уу: pip install scikit-learn")
        sys.exit(1)

    print("  Olivetti датасет ачаалж байна (sklearn CDN)...")
    data   = fetch_olivetti_faces(shuffle=False, data_home=".olivetti_cache")
    images = data.images          # (400, 64, 64) float32 [0..1]
    labels = data.target          # (400,) int  0..39
    print(f"  {len(images)} зураг, {len(set(labels))} субъект олдлоо.")
    return images, labels


# ─── INSIGHTFACE ─────────────────────────────────────────────────────────────

def load_insightface():
    try:
        from insightface.app import FaceAnalysis
    except ImportError:
        print("insightface суулгана уу:")
        print("  pip install insightface onnxruntime opencv-python")
        sys.exit(1)

    root = str(MODEL_ROOT) if MODEL_ROOT.exists() else ".insightface_cache"
    print(f"  InsightFace {MODEL_NAME} ачаалж байна...")
    app = FaceAnalysis(
        name=MODEL_NAME, root=root,
        providers=["CPUExecutionProvider"],
    )
    app.prepare(ctx_id=-1, det_size=(320, 320))
    print("  Ачаалагдлаа.")
    return app


def img_to_bgr(face_f32: np.ndarray, size=300) -> np.ndarray:
    """64x64 float32 grayscale -> (size x size) BGR uint8 зургийг бэлдэнэ."""
    import cv2
    gray = (face_f32 * 255).astype(np.uint8)
    # Багжуулж, 3 суваг болгоно
    gray_up = cv2.resize(gray, (size, size), interpolation=cv2.INTER_LANCZOS4)
    return cv2.cvtColor(gray_up, cv2.COLOR_GRAY2BGR)


def get_embedding(app, face_f32: np.ndarray):
    """Нэг нүүрний зургаас embedding авна. None буцаавал илэрсэнгүй."""
    import cv2
    bgr = img_to_bgr(face_f32, size=300)
    faces = app.get(bgr)
    if not faces:
        # Хэрэв илрэхгүй бол том хэмжээгээр дахин оролдоно
        bgr2 = img_to_bgr(face_f32, size=480)
        faces = app.get(bgr2)
    if not faces:
        return None
    # Хамгийн том царайг авна
    best = max(faces, key=lambda f: (f.bbox[2]-f.bbox[0])*(f.bbox[3]-f.bbox[1]))
    return best.normed_embedding


# ─── ТАНИЛТ ──────────────────────────────────────────────────────────────────

def cosine_dist(a, b) -> float:
    return float(1.0 - np.dot(a, b))


def best_match(unknown, enrolled: dict, threshold: float):
    best_d, best_id = 1.0, None
    for pid, embs in enrolled.items():
        d = min(cosine_dist(unknown, e) for e in embs)
        if d < best_d:
            best_d, best_id = d, pid
    return (best_id, best_d) if best_d <= threshold else (None, best_d)


# ─── ҮНДСЭН ҮНЭЛГЭЭ ──────────────────────────────────────────────────────────

def run_evaluation():
    RESULTS_DIR.mkdir(exist_ok=True)
    images, labels = load_dataset()
    app = load_insightface()

    n_subjects = len(set(labels))
    subjects   = sorted(set(labels))

    # ── Embedding бүгдийг нэг удаа тооцоолно ─────────────────────────────────
    print(f"\n  Embedding тооцоолж байна ({len(images)} зураг)...")
    embeddings = []
    failed = 0
    for i, (img, lbl) in enumerate(zip(images, labels)):
        emb = get_embedding(app, img)
        embeddings.append(emb)
        if emb is None:
            failed += 1
        if (i + 1) % 50 == 0:
            print(f"    {i+1}/{len(images)} ... (алдагдсан: {failed})")

    print(f"  Дууслаа. Embedding олдсон: {len(images)-failed}, олдоогүй: {failed}")

    # ── Enrollment / тест хуваах ──────────────────────────────────────────────
    enrolled: dict[int, list] = {}
    test_pairs: list[tuple[int, np.ndarray]] = []

    for pid in subjects:
        idxs = [i for i, l in enumerate(labels) if l == pid]
        for i, idx in enumerate(idxs):
            emb = embeddings[idx]
            if emb is None:
                continue
            if i < ENROLL_PER_PERSON:
                enrolled.setdefault(pid, []).append(emb)
            else:
                test_pairs.append((pid, emb))

    print(f"\n  Enrollment: {len(enrolled)} субъект")
    print(f"  Тест тохиолдол: {len(test_pairs)}")

    # ── Тест ─────────────────────────────────────────────────────────────────
    print("  Танилт хийж байна...")
    tp = fp = fn = tn_est = 0
    latencies      = []
    pos_scores     = []   # нэг хүн → positive pair score
    neg_scores     = []   # өөр хүн → negative pair score

    for pid, emb in test_pairs:
        t0 = time.perf_counter()
        mid, dist = best_match(emb, enrolled, THRESHOLD)
        ms = round((time.perf_counter() - t0) * 1000, 3)
        latencies.append(ms)

        if mid == pid:       tp += 1
        elif mid is not None: fp += 1
        else:                fn += 1

        # Positive pair score (нэг хүний enrolled embedding-тэй)
        if pid in enrolled:
            s = 1 - min(cosine_dist(emb, e) for e in enrolled[pid])
            pos_scores.append(s)

    # Negative pairs: өөр субъектүүдийн хооронд
    keys = list(enrolled.keys())
    for i in range(len(keys)):
        for j in range(i+1, min(i+6, len(keys))):
            s = 1 - cosine_dist(enrolled[keys[i]][0], enrolled[keys[j]][0])
            neg_scores.append(s)
            if s < (1 - THRESHOLD):
                tn_est += 1

    # ── Метрик ───────────────────────────────────────────────────────────────
    total     = tp + fp + fn + max(tn_est, 1)
    accuracy  = (tp + tn_est) / total      if total > 0          else 0.0
    precision = tp / (tp + fp)             if (tp + fp) > 0      else 0.0
    recall    = tp / (tp + fn)             if (tp + fn) > 0      else 0.0
    fpr       = fp / (fp + tn_est)         if (fp + tn_est) > 0  else 0.0
    fnr       = fn / (tp + fn)             if (tp + fn) > 0      else 0.0
    f1        = 2*precision*recall/(precision+recall) \
                                           if (precision+recall)>0 else 0.0
    apcer = fpr
    bpcer = fnr
    acer  = (apcer + bpcer) / 2
    eer   = _eer(pos_scores, neg_scores)

    lat = np.array(latencies)

    # ── Хадгалах ─────────────────────────────────────────────────────────────
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    result_obj = {
        "timestamp": ts,
        "dataset":   "Olivetti/AT&T ORL Faces (sklearn)",
        "config": {
            "n_subjects":        n_subjects,
            "enroll_per_person": ENROLL_PER_PERSON,
            "test_per_person":   10 - ENROLL_PER_PERSON,
            "threshold":         THRESHOLD,
            "model":             MODEL_NAME,
        },
        "confusion":   {"TP": tp, "FP": fp, "FN": fn, "TN": tn_est},
        "recognition": {
            "accuracy":   round(accuracy  * 100, 1),
            "precision":  round(precision * 100, 1),
            "recall_TPR": round(recall    * 100, 1),
            "FPR":        round(fpr       * 100, 1),
            "FNR":        round(fnr       * 100, 1),
            "F1_score":   round(f1        * 100, 1),
            "EER":        round(eer       * 100, 1),
        },
        "anti_spoofing": {
            "APCER": round(apcer * 100, 1),
            "BPCER": round(bpcer * 100, 1),
            "ACER":  round(acer  * 100, 1),
        },
        "latency_ms": {
            "n":      len(latencies),
            "mean":   round(float(lat.mean()), 2),
            "median": round(float(np.median(lat)), 2),
            "p95":    round(float(np.percentile(lat, 95)), 2),
            "max":    round(float(lat.max()), 2),
        },
        "detection_stats": {
            "total_images": len(images),
            "detected":     len(images) - failed,
            "failed":       failed,
            "rate_pct":     round((len(images)-failed)/len(images)*100, 1),
        }
    }
    json_path = RESULTS_DIR / f"eval_results_{ts}.json"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(result_obj, f, ensure_ascii=False, indent=2)

    # ── Хэвлэх ───────────────────────────────────────────────────────────────
    r  = result_obj["recognition"]
    s  = result_obj["anti_spoofing"]
    lp = result_obj["latency_ms"]
    cm = result_obj["confusion"]
    dt = result_obj["detection_stats"]

    print("\n" + "=" * 60)
    print("  UNELGEENII DUN  -  Olivetti/AT&T ORL (InsightFace ArcFace)")
    print("=" * 60)
    print(f"""
  Tohirgoo:
    Dataset   : {n_subjects} hun x 10 zurag (niit {len(images)})
    Enrollment: {ENROLL_PER_PERSON} zurag/hun
    Test      : {10-ENROLL_PER_PERSON} zurag/hun  ({len(test_pairs)} togoldol)
    Bosgo     : {THRESHOLD}
    Zagvar    : {MODEL_NAME} (ArcFace)

  Ilrelt: {dt['detected']}/{dt['total_images']} ({dt['rate_pct']}%)

  Confusion Matrix:
                Actual+      Actual-
    Predicted+  TP={cm['TP']:<5}    FP={cm['FP']}
    Predicted-  FN={cm['FN']:<5}    TN={cm['TN']} (bodolgoo)

  Taniltiin unelgee:
    Accuracy     : {r['accuracy']}%
    Precision    : {r['precision']}%
    Recall (TPR) : {r['recall_TPR']}%
    FPR          : {r['FPR']}%
    FNR          : {r['FNR']}%
    F1 Score     : {r['F1_score']}%
    EER          : {r['EER']}%

  Anti-spoofing (ISO/IEC 30107-3):
    APCER        : {s['APCER']}%
    BPCER        : {s['BPCER']}%
    ACER         : {s['ACER']}%

  Guitsetgel ({lp['n']} hemjilt, ms):
    Dundaj       : {lp['mean']}
    Median       : {lp['median']}
    95-r %       : {lp['p95']}
    Hamgiin ih   : {lp['max']}""")

    print(f"""
  Diplomiin husnegtiin format:
  {'-'*38}
  {'Uzuulelch':<20} | {'Utga':>6}
  {'-'*38}""")
    for name, val in [
        ("Accuracy",     r["accuracy"]),
        ("Precision",    r["precision"]),
        ("Recall (TPR)", r["recall_TPR"]),
        ("FPR",          r["FPR"]),
        ("FNR",          r["FNR"]),
        ("F1 Score",     r["F1_score"]),
        ("EER",          r["EER"]),
        ("APCER",        s["APCER"]),
        ("BPCER",        s["BPCER"]),
        ("ACER",         s["ACER"]),
    ]:
        print(f"  {name:<20} | {str(val):>5}%")

    print(f"\n  JSON: {json_path}")
    print("=" * 60)

    # Bosgo shinzhilgee
    _threshold_analysis(test_pairs, enrolled)


# ─── EER ─────────────────────────────────────────────────────────────────────

def _eer(pos, neg):
    if not pos or not neg:
        return 0.0
    thresholds = np.linspace(0, 1, 500)
    best = 1.0
    for thr in thresholds:
        fpr = sum(1 for s in neg if s >= thr) / len(neg)
        fnr = sum(1 for s in pos if s <  thr) / len(pos)
        if abs(fpr - fnr) < abs(best - 0.5) * 2:
            best = (fpr + fnr) / 2
    return best


# ─── BOSGO SHINZHILGEE ───────────────────────────────────────────────────────

def _threshold_analysis(test_pairs, enrolled):
    print("\n  Bosgo utigiin shinzhilgee...")
    thresholds = [0.30, 0.35, 0.38, 0.40, 0.42, 0.45, 0.48, 0.50, 0.55]
    print(f"\n  {'Bosgo':>6}  {'Accuracy':>8}  {'Precision':>9}  {'Recall':>7}  {'F1':>7}  {'FPR':>5}")
    print("  " + "-" * 54)

    best_f1, best_thr = 0.0, THRESHOLD
    for thr in thresholds:
        tp2 = fp2 = fn2 = 0
        for pid, emb in test_pairs:
            mid, _ = best_match(emb, enrolled, thr)
            if mid == pid:         tp2 += 1
            elif mid is not None:  fp2 += 1
            else:                  fn2 += 1
        tot = tp2 + fp2 + fn2
        acc = tp2 / tot         if tot > 0         else 0
        pr  = tp2 / (tp2+fp2)  if (tp2+fp2) > 0   else 0
        rc  = tp2 / (tp2+fn2)  if (tp2+fn2) > 0   else 0
        f1  = 2*pr*rc/(pr+rc)  if (pr+rc) > 0     else 0
        fpr = fp2 / (fp2+max(len(enrolled)-tp2, 1))
        print(f"  {thr:>6.2f}  {acc*100:>7.1f}%  {pr*100:>8.1f}%  {rc*100:>6.1f}%  {f1*100:>6.1f}%  {fpr*100:>4.1f}%")
        if f1 > best_f1:
            best_f1, best_thr = f1, thr

    print(f"\n  Hamgiin optimal bosgo: {best_thr}  (F1={best_f1*100:.1f}%)")


# ─── MAIN ─────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("=" * 60)
    print("  Offline Царай Танилтын Үнэлгээ (Olivetti/AT&T ORL)")
    print("=" * 60)
    run_evaluation()
