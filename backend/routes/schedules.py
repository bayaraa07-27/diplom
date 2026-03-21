from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from database import get_db
from bson import ObjectId
import datetime

schedules_bp = Blueprint("schedules", __name__)

def serialize(s):
    s["id"] = str(s.pop("_id"))
    return s

# ── Хуваарь үүсгэх ──────────────────────────────────────────────────────────

@schedules_bp.route("/", methods=["GET"])
@jwt_required()
def get_schedules():
    db         = get_db()
    department = request.args.get("department")
    year       = request.args.get("year")
    day        = request.args.get("day")           # Mon, Tue ...
    query      = {}
    if department: query["department"] = department
    if year:       query["year"]       = int(year)
    if day:        query["day"]        = day
    schedules = list(db.schedules.find(query).sort("start_time", 1))
    return jsonify({"schedules": [serialize(s) for s in schedules]})

@schedules_bp.route("/<schedule_id>", methods=["GET"])
@jwt_required()
def get_schedule(schedule_id):
    db = get_db()
    s  = db.schedules.find_one({"_id": ObjectId(schedule_id)})
    if not s:
        return jsonify({"error": "Хуваарь олдсонгүй"}), 404
    return jsonify(serialize(s))

@schedules_bp.route("/", methods=["POST"])
@jwt_required()
def create_schedule():
    data     = request.get_json()
    db       = get_db()
    user_id  = get_jwt_identity()
    required = ["subject", "start_time", "end_time", "day", "room", "department", "year"]
    if not all(k in data for k in required):
        return jsonify({"error": "Бүх талбарыг бөглөнө үү"}), 400

    late_minutes = int(data.get("late_after_minutes", 15))

    schedule = {
        "subject":           data["subject"],
        "start_time":        data["start_time"],       # "08:00"
        "end_time":          data["end_time"],         # "09:30"
        "day":               data["day"],              # "Mon"
        "room":              data["room"],
        "department":        data["department"],
        "year":              int(data["year"]),
        "late_after_minutes": late_minutes,
        "created_by":        user_id,
        "created_at":        datetime.datetime.utcnow(),
        "is_active":         True,
    }
    result = db.schedules.insert_one(schedule)
    schedule["id"] = str(result.inserted_id)
    schedule.pop("_id", None)
    return jsonify(schedule), 201

@schedules_bp.route("/<schedule_id>", methods=["PUT"])
@jwt_required()
def update_schedule(schedule_id):
    data    = request.get_json()
    db      = get_db()
    allowed = ["subject", "start_time", "end_time", "day", "room",
               "department", "year", "late_after_minutes", "is_active"]
    update  = {k: data[k] for k in allowed if k in data}
    result  = db.schedules.update_one({"_id": ObjectId(schedule_id)}, {"$set": update})
    if result.matched_count == 0:
        return jsonify({"error": "Хуваарь олдсонгүй"}), 404
    return jsonify({"message": "Амжилттай шинэчлэгдлээ"})

@schedules_bp.route("/<schedule_id>", methods=["DELETE"])
@jwt_required()
def delete_schedule(schedule_id):
    db = get_db()
    db.schedules.delete_one({"_id": ObjectId(schedule_id)})
    return jsonify({"message": "Амжилттай устгагдлаа"})

# ── Өнөөдрийн хуваарь ───────────────────────────────────────────────────────

@schedules_bp.route("/today", methods=["GET"])
@jwt_required()
def today_schedules():
    db       = get_db()
    days_map = {0: "Mon", 1: "Tue", 2: "Wed", 3: "Thu", 4: "Fri", 5: "Sat", 6: "Sun"}
    today    = days_map[datetime.datetime.utcnow().weekday()]
    schedules = list(db.schedules.find({"day": today, "is_active": True}).sort("start_time", 1))

    now_str  = datetime.datetime.utcnow().strftime("%H:%M")
    result   = []
    for s in schedules:
        s["id"] = str(s.pop("_id"))
        # Хичээлийн төлөв тооцох
        start = s["start_time"]
        end   = s["end_time"]
        late_deadline = _add_minutes(start, s.get("late_after_minutes", 15))

        if now_str < start:
            s["status"] = "upcoming"
        elif start <= now_str <= end:
            s["status"] = "ongoing"
            s["is_late_window"] = now_str <= late_deadline
        else:
            s["status"] = "finished"

        result.append(s)
    return jsonify({"schedules": result, "day": today})

# ── Хичээлд ирц бүртгэх (царай танилттай) ───────────────────────────────────

@schedules_bp.route("/<schedule_id>/checkin", methods=["POST"])
@jwt_required()
def schedule_checkin(schedule_id):
    db   = get_db()
    data = request.get_json()
    sid  = data.get("student_id")
    now  = datetime.datetime.utcnow()

    schedule = db.schedules.find_one({"_id": ObjectId(schedule_id)})
    if not schedule:
        return jsonify({"error": "Хуваарь олдсонгүй"}), 404

    today     = now.date().isoformat()
    days_map  = {0: "Mon", 1: "Tue", 2: "Wed", 3: "Thu", 4: "Fri", 5: "Sat", 6: "Sun"}
    today_day = days_map[now.weekday()]

    if schedule["day"] != today_day:
        return jsonify({"error": f"Өнөөдөр {schedule['subject']} хичээл байхгүй"}), 400

    # Хоцорсон эсэх тооцох
    now_str      = now.strftime("%H:%M")
    late_deadline = _add_minutes(schedule["start_time"], schedule.get("late_after_minutes", 15))
    is_late      = now_str > late_deadline

    # Хичээл дуусаагүй байх ёстой
    if now_str > schedule["end_time"]:
        return jsonify({"error": "Хичээл аль хэдийн дууссан байна"}), 400

    # Давхардсан бүртгэл шалгах
    existing = db.attendance.find_one({
        "student_id":  sid,
        "date":        today,
        "schedule_id": schedule_id,
    })
    if existing:
        return jsonify({"error": "Энэ хичээлд аль хэдийн ирц бүртгэсэн"}), 409

    record = {
        "student_id":  sid,
        "schedule_id": schedule_id,
        "subject":     schedule["subject"],
        "date":        today,
        "check_in":    now,
        "check_out":   None,
        "status":      "present",
        "late":        is_late,
        "late_minutes": _minutes_diff(schedule["start_time"], now_str) if is_late else 0,
    }
    result = db.attendance.insert_one(record)
    return jsonify({
        "message":     "Ирц бүртгэгдлээ",
        "record_id":   str(result.inserted_id),
        "subject":     schedule["subject"],
        "check_in":    now.isoformat(),
        "late":        is_late,
        "late_minutes": record["late_minutes"],
    }), 201

# ── Helper functions ─────────────────────────────────────────────────────────

def _add_minutes(time_str: str, minutes: int) -> str:
    h, m  = map(int, time_str.split(":"))
    total = h * 60 + m + minutes
    return f"{total // 60:02d}:{total % 60:02d}"

def _minutes_diff(start_str: str, now_str: str) -> int:
    sh, sm = map(int, start_str.split(":"))
    nh, nm = map(int, now_str.split(":"))
    return max(0, (nh * 60 + nm) - (sh * 60 + sm))
