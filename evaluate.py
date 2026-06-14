"""
Царай танилт + Anti-spoofing үнэлгээний скрипт
================================================
Хандлага А  — Тест зургуудын хавтсаас API-д автоматаар дуудна
Хандлага Б  — test_results.csv файлаас тооцоолно (гараар бөглөсөн)

Ажиллуулах:
  python evaluate.py            # цэсээс сонгоно
  python evaluate.py --csv      # зөвхөн CSV тооцоо
  python evaluate.py --api      # зөвхөн API тест
"""

import argparse
import csv
import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path

import numpy as np

# ─── ТОХИРГОО ────────────────────────────────────────────────────────────────
API_BASE   = "http://localhost:5000/api"   # Docker ажиллаж байгаа үед
JWT_TOKEN  = "Javhaa_0727"# .env эсвэл гараар оруулна

# Тест зургуудын хавтас бүтэц:
#   test_images/
#     Бат/         ← хавтасны нэр = хүний нэр/ID
#       01_front.jpg
#       02_left.jpg
#     Дорж/
#       ...
#     spoof/       ← спуф зургууд (утас, хэвлэмэл, replay)
#       ...
TEST_IMAGES_DIR = Path("test_images")

# CSV файлын нэр (Хандлага Б)
CSV_FILE = Path("test_results.csv")


# ─── ТУСЛАХ ФУНКЦҮҮД ─────────────────────────────────────────────────────────

def _get_headers():
    if not JWT_TOKEN:
        print("  JWT токен байхгүй байна. API тест ажиллахгүй.")
        print("  JWT_TOKEN = '...' гэж тохируулна уу (evaluate.py-н дээд хэсэгт).")
        sys.exit(1)
    return {"Authorization": f"Bearer {JWT_TOKEN}", "Content-Type": "application/json"}


def _img_to_b64(path: Path) -> str:
    import base64
    return base64.b64encode(path.read_bytes()).decode()


def _call_recognize(b64: str) -> dict:
    import urllib.request
    import urllib.error
    payload = json.dumps({"image": f"data:image/jpeg;base64,{b64}"}).encode()
    req = urllib.request.Request(
        f"{API_BASE}/attendance/recognize",
        data=payload,
        headers=_get_headers(),
        method="POST",
    )
    try:
        t0 = time.perf_counter()
        with urllib.request.urlopen(req, timeout=10) as resp:
            ms  = round((time.perf_counter() - t0) * 1000, 1)
            data = json.loads(resp.read())
            data["_ms"] = ms
            return data
    except urllib.error.HTTPError as e:
        return {"recognized": False, "_error": str(e), "_ms": 0}
    except Exception as e:
        return {"recognized": False, "_error": str(e), "_ms": 0}


def _confusion_matrix_str(tp, fp, fn, tn):
    lines = [
        "  Confusion Matrix:",
        "              Actual+   Actual−",
        f"  Predicted+  TP={tp:<4}    FP={fp}",
        f"  Predicted−  FN={fn:<4}    TN={tn}",
    ]
    return "\n".join(lines)


def _compute_metrics(tp, fp, fn, tn):
    total     = tp + fp + fn + tn
    accuracy  = (tp + tn) / total           if total > 0          else 0.0
    precision = tp / (tp + fp)              if (tp + fp) > 0      else 0.0
    recall    = tp / (tp + fn)              if (tp + fn) > 0      else 0.0
    fpr       = fp / (fp + tn)              if (fp + tn) > 0      else 0.0
    fnr       = fn / (tp + fn)              if (tp + fn) > 0      else 0.0
    f1        = 2 * precision * recall / (precision + recall) \
                                            if (precision + recall) > 0 else 0.0
    apcer     = fpr
    bpcer     = fnr
    acer      = (apcer + bpcer) / 2
    return dict(
        accuracy=accuracy, precision=precision, recall=recall,
        fpr=fpr, fnr=fnr, f1=f1,
        apcer=apcer, bpcer=bpcer, acer=acer,
    )


# ─── ХАНДЛАГА А: API автомат тест ────────────────────────────────────────────

def run_api_test():
    """
    test_images/ хавтсаас зургуудыг унших, API-д дуудаж, үр дүн хадгалах.

    Хавтасны дүрэм:
      - Нэр нь student_id (DB-д бүртгэлтэй) → recognized=True хүлээнэ
      - Нэр нь 'spoof'                       → recognized=False хүлээнэ
      - Нэр нь 'unknown'                     → recognized=False хүлээнэ
    """
    if not TEST_IMAGES_DIR.exists():
        print(f"\n  '{TEST_IMAGES_DIR}' хавтас олдсонгүй.")
        print("  Бүтэц:")
        print("    test_images/")
        print("      <student_id>/  ← зураг бүр нэг туршилт")
        print("      spoof/")
        print("      unknown/")
        return

    extensions = {".jpg", ".jpeg", ".png", ".bmp"}
    tp = fp = fn = tn = 0
    latencies = []
    rows = []

    persons = [p for p in sorted(TEST_IMAGES_DIR.iterdir()) if p.is_dir()]
    print(f"\n  {len(persons)} хавтас олдлоо.")

    for person_dir in persons:
        expected_sid = person_dir.name
        is_spoof     = expected_sid.lower() in ("spoof", "unknown", "fake")

        images = [f for f in sorted(person_dir.iterdir()) if f.suffix.lower() in extensions]
        print(f"\n  [{expected_sid}] — {len(images)} зураг", end="", flush=True)

        for img_path in images:
            b64  = _img_to_b64(img_path)
            resp = _call_recognize(b64)
            ms   = resp.get("_ms", 0)
            latencies.append(ms)

            recognized = resp.get("recognized", False)
            got_sid    = resp.get("student_id", "")
            confidence = resp.get("confidence", 0)

            if is_spoof:
                # Спуф: recognized=False байх ёстой
                if not recognized:
                    tn += 1; result = "TN"
                else:
                    fp += 1; result = "FP"
            else:
                # Бүртгэлтэй хүн: recognized=True, student_id тохирох ёстой
                correct = recognized and (got_sid == expected_sid)
                if correct:
                    tp += 1; result = "TP"
                else:
                    fn += 1; result = "FN"

            print(".", end="", flush=True)
            rows.append({
                "image":      str(img_path),
                "expected":   expected_sid,
                "got_id":     got_sid,
                "recognized": recognized,
                "confidence": confidence,
                "latency_ms": ms,
                "result":     result,
            })

    print()

    # CSV хадгалах
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_csv = f"api_test_raw_{ts}.csv"
    with open(out_csv, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=rows[0].keys())
        w.writeheader()
        w.writerows(rows)

    _print_and_save_results(tp, fp, fn, tn, latencies, source="API тест", raw_csv=out_csv)


# ─── ХАНДЛАГА Б: CSV-ээс тооцоо ─────────────────────────────────────────────

def run_csv_analysis():
    """
    test_results.csv-ийг уншиж метрик тооцоолно.

    CSV баганын дараалал:
      result  — TP / FP / FN / TN (гараар бөглөнө)
      confidence — итгэлийн оноо (сонголтоор)
      latency_ms — хугацаа ms (сонголтоор)
    """
    if not CSV_FILE.exists():
        _create_csv_template()
        print(f"\n  '{CSV_FILE}' загварыг үүсгэлээ.")
        print("  'result' баганыг TP/FP/FN/TN-ээр бөглөөд дахин ажиллуулна уу.")
        return

    tp = fp = fn = tn = 0
    latencies = []
    confidences = []

    with open(CSV_FILE, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for i, row in enumerate(reader, 1):
            r = row.get("result", "").strip().upper()
            if r == "TP":   tp += 1
            elif r == "FP": fp += 1
            elif r == "FN": fn += 1
            elif r == "TN": tn += 1
            else:
                print(f"  Мөр {i}: result='{r}' — алгасав (TP/FP/FN/TN байх ёстой)")
                continue
            if row.get("latency_ms"):
                try: latencies.append(float(row["latency_ms"]))
                except ValueError: pass
            if row.get("confidence"):
                try: confidences.append(float(row["confidence"]))
                except ValueError: pass

    if tp + fp + fn + tn == 0:
        print("  CSV-д боломжтой өгөгдөл олдсонгүй.")
        return

    _print_and_save_results(tp, fp, fn, tn, latencies, source="CSV шинжилгээ")


def _create_csv_template():
    """Гараар бөглөх CSV загвар."""
    headers = ["no", "person", "condition", "result", "confidence", "latency_ms", "note"]
    examples = [
        ["1",  "Бат",   "frontal",        "TP", "87.3", "145", ""],
        ["2",  "Бат",   "left_45",        "TP", "82.1", "138", ""],
        ["3",  "Бат",   "right_45",       "FN", "0",    "130", "гэрэлтүүлэг муу"],
        ["4",  "Дорж",  "frontal",        "TP", "91.0", "142", ""],
        ["5",  "spoof", "phone_screen",   "TN", "0",    "136", ""],
        ["6",  "spoof", "printed_photo",  "FP", "65.2", "140", "хэвлэмэл алдагдсан"],
        ["7",  "spoof", "replay_video",   "TN", "0",    "139", ""],
    ]
    with open(CSV_FILE, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(headers)
        w.writerows(examples)


# ─── ҮР ДҮН ХЭВЛЭХ + ХАДГАЛАХ ───────────────────────────────────────────────

def _print_and_save_results(tp, fp, fn, tn, latencies, source="", raw_csv=""):
    m  = _compute_metrics(tp, fp, fn, tn)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")

    lat_stats = {}
    if latencies:
        lat_stats = {
            "n":      len(latencies),
            "mean":   round(float(np.mean(latencies)), 1),
            "median": round(float(np.median(latencies)), 1),
            "p95":    round(float(np.percentile(latencies, 95)), 1),
            "max":    round(float(np.max(latencies)), 1),
        }

    out = {
        "source":         source,
        "timestamp":      ts,
        "confusion":      {"TP": tp, "FP": fp, "FN": fn, "TN": tn},
        "recognition":    {k: round(v * 100, 1) for k, v in m.items()},
        "latency_ms":     lat_stats,
    }

    json_file = f"eval_results_{ts}.json"
    with open(json_file, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    # ─── Хэвлэх ─────────────────────────────────────────────────────────────
    print("\n" + "=" * 56)
    print(f"  ҮНЭЛГЭЭНИЙ ДҮН  [{source}]")
    print("=" * 56)
    print(_confusion_matrix_str(tp, fp, fn, tn))

    r = out["recognition"]
    print(f"""
  Танилтын үнэлгээ:
    Accuracy     : {r['accuracy']}%
    Precision    : {r['precision']}%
    Recall (TPR) : {r['recall']}%
    FPR          : {r['fpr']}%
    FNR          : {r['fnr']}%
    F1 Score     : {r['f1']}%

  Anti-spoofing (ISO/IEC 30107-3):
    APCER        : {r['apcer']}%
    BPCER        : {r['bpcer']}%
    ACER         : {r['acer']}%""")

    if lat_stats:
        print(f"""
  Гүйцэтгэл ({lat_stats['n']} хэмжилт):
    Дундаж       : {lat_stats['mean']} ms
    Медиан       : {lat_stats['median']} ms
    95-р %       : {lat_stats['p95']} ms
    Хамгийн их  : {lat_stats['max']} ms""")

    # Дипломын хүснэгт
    print(f"""
  Дипломын хүснэгтийн формат:
  {"─"*38}
  {"Үзүүлэлт":<20} | {"Утга":>6}
  {"─"*38}""")
    rows_tbl = [
        ("Accuracy",     r["accuracy"]),
        ("Precision",    r["precision"]),
        ("Recall (TPR)", r["recall"]),
        ("FPR",          r["fpr"]),
        ("FNR",          r["fnr"]),
        ("F1 Score",     r["f1"]),
        ("APCER",        r["apcer"]),
        ("BPCER",        r["bpcer"]),
        ("ACER",         r["acer"]),
    ]
    for name, val in rows_tbl:
        print(f"  {name:<20} | {val:>5}%")

    print(f"\n  JSON хадгалагдлаа: {json_file}")
    if raw_csv:
        print(f"  Дэлгэрэнгүй CSV : {raw_csv}")
    print("=" * 56)


# ─── ҮНДСЭН ──────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Үнэлгээний скрипт")
    parser.add_argument("--api", action="store_true", help="API тест (Хандлага А)")
    parser.add_argument("--csv", action="store_true", help="CSV тооцоо (Хандлага Б)")
    args = parser.parse_args()

    print("=" * 56)
    print("   Төгсөлтийн ажлын үнэлгээний скрипт")
    print("=" * 56)

    if args.api:
        run_api_test()
    elif args.csv:
        run_csv_analysis()
    else:
        print("\nЮу хийх вэ?")
        print("  [1] API автомат тест  (Docker ажиллаж байх ёстой)")
        print("  [2] CSV-ээс тооцоо    (test_results.csv файлаас)")
        choice = input("Сонголт (1/2): ").strip()
        if choice == "1":
            run_api_test()
        elif choice == "2":
            run_csv_analysis()
        else:
            print("Буруу сонголт.")


if __name__ == "__main__":
    main()
