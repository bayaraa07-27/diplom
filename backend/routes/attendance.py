from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from database import get_db
from utils.face_utils import recognize_face_from_base64, recognize_multiple_faces
import datetime

attendance_bp = Blueprint("attendance", __name__)

def fmt(a):
    a["id"] = str(a.pop("_id"))
    return a

# ── Single recognize ─────────────────────────────────────────────────────────

@attendance_bp.route("/recognize", methods=["POST"])
@jwt_required()
def recognize():
    data = request.get_json()
    if "image" not in data:
        return jsonify({"error": "Зураг илгээнэ үү"}), 400
    db = get_db()
    result, error = recognize_face_from_base64(data["image"])
    if error:
        return jsonify({"error": error}), 400
    if not result:
        return jsonify({"recognized": False, "message": "Царай танигдсангүй"})
    student = db.students.find_one({"student_id": result["student_id"]})
    if not student:
        return jsonify({"recognized": False, "message": "Оюутан олдсонгүй"})
    return jsonify({
        "recognized": True,
        "student_id": result["student_id"],
        "name":       student["name"],
        "department": student["department"],
        "confidence": round(result["confidence"], 3),
    })

# ── ✅ Multi-face real-time recognize + auto checkin ─────────────────────────

@attendance_bp.route("/recognize-multi", methods=["POST"])
@jwt_required()
def recognize_multi():
    """
    Нэг кадрт олон царай зэрэг таньж, автоматаар ирц бүртгэнэ.
    already_registered_ids: урьд нь бүртгэгдсэн IDs (давхардахгүйн тулд)
    """
    data = request.get_json()
    if "image" not in data:
        return jsonify({"error": "Зураг илгээнэ үү"}), 400

    db             = get_db()
    schedule_id    = data.get("schedule_id")
    already_ids    = set(data.get("already_registered", []))
    now            = datetime.datetime.utcnow()
    today          = now.date().isoformat()

    # Хичээлийн мэдээлэл авах
    subject = "Ерөнхий"
    is_late = False
    if schedule_id:
        from bson import ObjectId
        schedule = db.schedules.find_one({"_id": ObjectId(schedule_id)})
        if schedule:
            subject = schedule["subject"]
            now_str = now.strftime("%H:%M")
            late_deadline = _add_minutes(schedule["start_time"], schedule.get("late_after_minutes", 15))
            is_late = now_str > late_deadline

    faces, error = recognize_multiple_faces(data["image"], check_liveness=False)
    if error and not faces:
        return jsonify({"error": error, "faces": []}), 400

    new_registrations = []
    face_results      = []

    for face in faces:
        if not face["recognized"] or face["student_id"] is None:
            face_results.append({**face, "status": "unknown"})
            continue

        sid = face["student_id"]

        # Аль хэдийн энэ session-д бүртгэгдсэн
        if sid in already_ids:
            student = db.students.find_one({"student_id": sid})
            face_results.append({
                **face,
                "status": "already",
                "name":   student["name"] if student else sid,
            })
            continue

        # DB-д өнөөдөр бүртгэлтэй эсэх
        query = {"student_id": sid, "date": today}
        if schedule_id:
            query["schedule_id"] = schedule_id

        existing = db.attendance.find_one(query)
        if existing:
            student = db.students.find_one({"student_id": sid})
            already_ids.add(sid)
            face_results.append({
                **face,
                "status": "already",
                "name":   student["name"] if student else sid,
            })
            continue

        # Шинэ бүртгэл
        student = db.students.find_one({"student_id": sid})
        if not student:
            face_results.append({**face, "status": "unknown"})
            continue

        record = {
            "student_id":  sid,
            "date":        today,
            "check_in":    now,
            "check_out":   None,
            "subject":     subject,
            "status":      "present",
            "late":        is_late,
            "late_minutes": 0,
        }
        if schedule_id:
            record["schedule_id"] = schedule_id

        db.attendance.insert_one(record)
        already_ids.add(sid)

        new_registrations.append({
            "student_id": sid,
            "name":       student["name"],
            "department": student["department"],
            "confidence": face["confidence"],
            "late":       is_late,
        })
        face_results.append({
            **face,
            "status": "new",
            "name":   student["name"],
        })

    return jsonify({
        "faces":              face_results,
        "new_registrations":  new_registrations,
        "total_faces":        len(faces),
        "new_count":          len(new_registrations),
        "already_registered": list(already_ids),
    })

# ── Check-in / out ────────────────────────────────────────────────────────────

@attendance_bp.route("/checkin", methods=["POST"])
@jwt_required()
def checkin():
    data    = request.get_json()
    db      = get_db()
    sid     = data.get("student_id")
    subject = data.get("subject", "Ерөнхий")
    now     = datetime.datetime.utcnow()
    today   = now.date().isoformat()
    existing = db.attendance.find_one({"student_id": sid, "date": today, "check_out": None})
    if existing:
        return jsonify({"error": "Өнөөдөр аль хэдийн ирц бүртгэсэн байна"}), 409
    record = {
        "student_id": sid, "date": today, "check_in": now,
        "check_out": None, "subject": subject, "status": "present",
        "late": _is_late(now),
    }
    result = db.attendance.insert_one(record)
    return jsonify({"message": "Ирц бүртгэгдлээ", "record_id": str(result.inserted_id),
                    "check_in": now.isoformat(), "late": record["late"]}), 201

@attendance_bp.route("/checkout", methods=["POST"])
@jwt_required()
def checkout():
    data  = request.get_json()
    db    = get_db()
    sid   = data.get("student_id")
    now   = datetime.datetime.utcnow()
    today = now.date().isoformat()
    record = db.attendance.find_one({"student_id": sid, "date": today, "check_out": None})
    if not record:
        return jsonify({"error": "Ирц бүртгэл олдсонгүй"}), 404
    duration = int((now - record["check_in"]).total_seconds() / 60)
    db.attendance.update_one({"_id": record["_id"]}, {"$set": {"check_out": now, "duration_minutes": duration}})
    return jsonify({"message": "Гарах цаг бүртгэгдлээ", "check_out": now.isoformat(), "duration_minutes": duration})

@attendance_bp.route("/", methods=["GET"])
@jwt_required()
def list_attendance():
    db    = get_db()
    page  = int(request.args.get("page", 1))
    limit = int(request.args.get("limit", 50))
    date  = request.args.get("date")
    sid   = request.args.get("student_id")
    query = {}
    if date: query["date"]       = date
    if sid:  query["student_id"] = sid
    total   = db.attendance.count_documents(query)
    records = list(db.attendance.find(query).sort("check_in", -1).skip((page-1)*limit).limit(limit))
    sids    = list({r["student_id"] for r in records})
    names   = {s["student_id"]: s["name"] for s in db.students.find({"student_id": {"$in": sids}})}
    for r in records:
        r["student_name"] = names.get(r["student_id"], "—")
        fmt(r)
    return jsonify({"records": records, "total": total})

@attendance_bp.route("/today-summary", methods=["GET"])
@jwt_required()
def today_summary():
    db    = get_db()
    today = datetime.date.today().isoformat()
    total_students = db.students.count_documents({})
    present_today  = db.attendance.count_documents({"date": today, "status": "present"})
    late_today     = db.attendance.count_documents({"date": today, "late": True})
    return jsonify({
        "date": today, "total_students": total_students,
        "present": present_today, "absent": total_students - present_today,
        "late": late_today,
        "rate": round(present_today / total_students * 100, 1) if total_students else 0,
    })

def _is_late(dt: datetime.datetime) -> bool:
    return dt.hour >= 9 and dt.minute > 0

def _add_minutes(time_str: str, minutes: int) -> str:
    h, m  = map(int, time_str.split(":"))
    total = h * 60 + m + minutes
    return f"{total // 60:02d}:{total % 60:02d}"

# ── Liveness шалгах endpoint ─────────────────────────────────────────────────

@attendance_bp.route("/check-liveness", methods=["POST"])
@jwt_required()
def check_liveness():
    """Нэг кадраас liveness шалгана — ирц бүртгэхийн өмнө дуудаж болно."""
    data = request.get_json()
    if "image" not in data:
        return jsonify({"error": "Зураг илгээнэ үү"}), 400
    try:
        from utils.liveness import check_liveness_from_b64
        result = check_liveness_from_b64(data["image"], threshold=float(data.get("threshold", 0.7)))
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@attendance_bp.route("/liveness-status", methods=["GET"])
@jwt_required()
def liveness_status():
    """Liveness model суулгагдсан эсэхийг шалгана."""
    try:
        from utils.liveness import get_status
        return jsonify(get_status())
    except Exception as e:
        return jsonify({"initialized": False, "error": str(e)}), 500