#!/usr/bin/env python3
"""
.pkl файлаас MongoDB-д face encoding шилжүүлэх нэг удаагийн script.

Ажиллуулах:
    docker compose exec backend python migrate_encodings.py
    эсвэл
    cd backend && python migrate_encodings.py
"""
import pickle
import os
import sys
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv
load_dotenv()

from database import init_db, get_db

PKL_PATH = os.path.join(os.path.dirname(__file__), "face_data", "encodings.pkl")


def migrate():
    print("=" * 50)
    print("Face Encoding Migration: .pkl → MongoDB")
    print("=" * 50)

    if not os.path.exists(PKL_PATH):
        print(f"\n❌ .pkl файл олдсонгүй: {PKL_PATH}")
        print("   face_data/encodings.pkl байхгүй бол шилжүүлэх зүйл алга.")
        return

    with open(PKL_PATH, "rb") as f:
        data = pickle.load(f)

    if not isinstance(data, dict):
        print(f"❌ .pkl файлын формат буруу байна: {type(data)}")
        return

    print(f"\n📦 .pkl файлд {len(data)} оюутны encoding олдлоо")

    init_db()
    db = get_db()

    migrated = 0
    skipped = 0

    for student_id, value in data.items():
        # Формат 1: {dlib: ndarray, arcface: ndarray}
        # Формат 2: ndarray (шууд 128-dim дlib encoding)
        if isinstance(value, dict):
            enc_array = value.get("dlib") or value.get("arcface")
        elif isinstance(value, np.ndarray):
            enc_array = value
        else:
            try:
                enc_array = np.array(value)
            except Exception:
                enc_array = None

        if enc_array is None or (hasattr(enc_array, "size") and enc_array.size == 0):
            print(f"  ⚠️  {student_id}: encoding хоосон байна, алгасав")
            skipped += 1
            continue

        enc_array = np.array(enc_array, dtype=np.float64)

        result = db.face_encodings.update_one(
            {"student_id": str(student_id)},
            {"$set": {"encoding": enc_array.tolist()}},
            upsert=True,
        )

        if result.upserted_id:
            print(f"  ✅ {student_id}: шинэ бичлэг үүслээ ({enc_array.shape})")
        else:
            print(f"  ♻️  {student_id}: шинэчлэгдлээ ({enc_array.shape})")
        migrated += 1

    print(f"\n{'=' * 50}")
    print(f"✅ Нийт {migrated} encoding MongoDB-д хадгалагдлаа")
    if skipped:
        print(f"⚠️  {skipped} encoding алгасагдлаа (хоосон/буруу формат)")
    print(f"Collection: face_attendance.face_encodings")
    print("=" * 50)

    # Verification
    count = db.face_encodings.count_documents({})
    print(f"\n🔍 MongoDB-д одоо {count} encoding байна")


if __name__ == "__main__":
    migrate()
