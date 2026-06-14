"""
Хуучин dlib encoding-уудыг устгаж InsightFace руу шилжихэд бэлтгэх script.

dlib (128-dim) → InsightFace ArcFace (512-dim) — encoding-ууд нийцэхгүй тул
бүх оюутны царайны бүртгэлийг устгаад дахин бүртгэх шаардлагатай.

Ажиллуулах:
  docker compose exec backend python reset_encodings.py
"""
import sys
from database import get_db, init_db

init_db()
db = get_db()

enc_count = db.face_encodings.count_documents({})
stu_count = db.students.count_documents({"face_enrolled": True})

print(f"Устгах encoding бичлэг: {enc_count}")
print(f"face_enrolled=True оюутан: {stu_count}")

if enc_count == 0 and stu_count == 0:
    print("Устгах зүйл алга.")
    sys.exit(0)

confirm = input("\nЦааш үргэлжлүүлэх үү? (yes/n): ").strip().lower()
if confirm != "yes":
    print("Цуцаллаа.")
    sys.exit(0)

result = db.face_encodings.delete_many({})
db.students.update_many(
    {},
    {"$set": {"face_enrolled": False}, "$unset": {"enrolled_at": ""}}
)

print(f"\n✅ {result.deleted_count} encoding устгагдлаа.")
print("✅ Бүх оюутны face_enrolled = False болгогдлоо.")
print("\nДараах алхам: Оюутнуудыг /enroll хуудсаар дахин бүртгэнэ үү.")
