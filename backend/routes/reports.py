from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from database import get_db
import datetime
from collections import defaultdict

reports_bp = Blueprint("reports", __name__)

def get_date_range():
    """Get start_date and end_date from query params, with 30-day default."""
    today = datetime.date.today().isoformat()
    start_date = request.args.get("start_date")
    end_date = request.args.get("end_date")

    if not start_date:
        start_date = (datetime.date.today() - datetime.timedelta(days=30)).isoformat()
    if not end_date:
        end_date = today

    return start_date, end_date

@reports_bp.route("/overview", methods=["GET"])
@jwt_required()
def overview():
    db = get_db()
    today = datetime.date.today().isoformat()

    # Last 7 days attendance
    week_data = []
    for i in range(6, -1, -1):
        d = (datetime.date.today() - datetime.timedelta(days=i)).isoformat()
        count = db.attendance.count_documents({"date": d, "status": "present"})
        week_data.append({"date": d, "count": count})

    total_students = db.students.count_documents({})
    enrolled_faces = db.students.count_documents({"face_encodings": {"$exists": True}})
    present_today = db.attendance.count_documents({"date": today, "status": "present"})
    total_attendance = db.attendance.count_documents({})

    return jsonify({
        "total_students": total_students,
        "enrolled_faces": enrolled_faces,
        "present_today": present_today,
        "total_attendance": total_attendance,
        "week_data": week_data,
        "attendance_rate": round(present_today / total_students * 100, 1) if total_students else 0,
    })

@reports_bp.route("/student/<student_id>", methods=["GET"])
@jwt_required()
def student_report(student_id):
    db = get_db()
    start_date, end_date = get_date_range()

    student = db.students.find_one({"student_id": student_id})
    if not student:
        return jsonify({"error": "Оюутан олдсонгүй"}), 404

    # Count work days (weekdays only)
    start = datetime.datetime.fromisoformat(start_date).date()
    end = datetime.datetime.fromisoformat(end_date).date()
    work_days = sum(1 for d in range((end - start).days + 1)
                    if (start + datetime.timedelta(days=d)).weekday() < 5)

    # Fetch month records
    records = list(db.attendance.find({
        "student_id": student_id,
        "date": {"$gte": start_date, "$lte": end_date}
    }))
    present = len([r for r in records if r["status"] == "present"])
    late = len([r for r in records if r.get("status") == "present" and r.get("late")])
    sick = len([r for r in records if r.get("status") == "sick"])
    excused = len([r for r in records if r.get("status") == "excused"])
    absent = max(work_days - present - sick - excused, 0)

    attendance_list = []
    for r in sorted(records, key=lambda x: x["date"]):
        attendance_list.append({
            "date": r["date"],
            "check_in": r.get("check_in"),
            "check_out": r.get("check_out"),
            "status": r["status"],
            "late": r.get("late", False),
            "duration_minutes": r.get("duration_minutes"),
        })

    return jsonify({
        "student": {"id": student_id, "name": student["name"], "department": student["department"]},
        "start_date": start_date,
        "end_date": end_date,
        "work_days": work_days,
        "present": present,
        "absent": absent,
        "late": late,
        "sick": sick,
        "excused": excused,
        "rate": round(present / work_days * 100, 1) if work_days else 0,
        "attendance_list": attendance_list,
    })

@reports_bp.route("/department", methods=["GET"])
@jwt_required()
def department_report():
    db = get_db()
    start_date, end_date = get_date_range()

    start = datetime.datetime.fromisoformat(start_date).date()
    end = datetime.datetime.fromisoformat(end_date).date()
    work_days = sum(1 for d in range((end - start).days + 1)
                    if (start + datetime.timedelta(days=d)).weekday() < 5)

    departments = db.students.distinct("department")
    result = []
    for dept in departments:
        dept_students = list(db.students.find({"department": dept}))
        sids = [s["student_id"] for s in dept_students]
        present = db.attendance.count_documents({
            "student_id": {"$in": sids},
            "date": {"$gte": start_date, "$lte": end_date},
            "status": "present",
        })
        denom = len(dept_students) * work_days
        result.append({
            "department": dept,
            "total_students": len(dept_students),
            "total_present": present,
            "rate": round(present / denom * 100, 1) if denom else 0,
        })

    return jsonify({"departments": result, "start_date": start_date, "end_date": end_date})

@reports_bp.route("/schedules", methods=["GET"])
@jwt_required()
def schedule_report():
    db = get_db()
    start_date, end_date = get_date_range()

    schedules = list(db.schedules.find({}))
    result = []
    for s in schedules:
        sch_id = str(s["_id"])

        # Unique students attended this schedule in date range
        attended_ids = db.attendance.distinct("student_id", {
            "schedule_id": sch_id,
            "date": {"$gte": start_date, "$lte": end_date},
            "status": "present",
        })

        # Enrolled students for this schedule
        enrolled = db.students.count_documents({"schedule_ids": sch_id})
        if enrolled == 0:
            enrolled = db.students.count_documents({
                "department": s["department"],
                "year": s["year"],
            })

        attended = len(attended_ids)
        result.append({
            "id": sch_id,
            "subject": s["subject"],
            "day": s["day"],
            "start_time": s["start_time"],
            "end_time": s["end_time"],
            "room": s["room"],
            "department": s["department"],
            "year": int(s.get("year", 0)),
            "is_active": s.get("is_active", True),
            "enrolled": enrolled,
            "attended": attended,
            "rate": round(attended / enrolled * 100, 1) if enrolled else 0,
        })

    result.sort(key=lambda x: (x["department"], x["day"], x["start_time"]))
    return jsonify({"schedules": result, "start_date": start_date, "end_date": end_date})

@reports_bp.route("/schedule/<schedule_id>/students", methods=["GET"])
@jwt_required()
def schedule_student_report(schedule_id):
    """Student attendance breakdown for a specific schedule."""
    db = get_db()
    start_date, end_date = get_date_range()

    from bson import ObjectId
    schedule = db.schedules.find_one({"_id": ObjectId(schedule_id)})
    if not schedule:
        return jsonify({"error": "Хуваарь олдсонгүй"}), 404

    # All attendance records for this schedule in date range
    records = list(db.attendance.find({
        "schedule_id": schedule_id,
        "date": {"$gte": start_date, "$lte": end_date},
    }))

    # Unique session dates
    session_dates = sorted(set(r["date"] for r in records))
    total_sessions = len(session_dates)

    # Count attendance per student
    counts = defaultdict(lambda: {"attended": 0, "late": 0})
    for r in records:
        if r.get("status") == "present":
            sid = r["student_id"]
            counts[sid]["attended"] += 1
            if r.get("late"):
                counts[sid]["late"] += 1

    # Enrolled students
    enrolled = list(db.students.find(
        {"schedule_ids": schedule_id},
        {"student_id": 1, "name": 1, "department": 1},
    ))
    if not enrolled:
        enrolled = list(db.students.find(
            {"department": schedule["department"], "year": schedule["year"]},
            {"student_id": 1, "name": 1, "department": 1},
        ))

    students = []
    for s in enrolled:
        sid = s["student_id"]
        c = counts.get(sid, {"attended": 0, "late": 0})
        students.append({
            "student_id": sid,
            "name": s["name"],
            "department": s["department"],
            "attended": c["attended"],
            "late": c["late"],
            "rate": round(c["attended"] / total_sessions * 100, 1) if total_sessions else 0,
        })

    students.sort(key=lambda x: (-x["attended"], x["name"]))

    return jsonify({
        "schedule": {
            "id": schedule_id,
            "subject": schedule["subject"],
            "day": schedule["day"],
            "room": schedule["room"],
        },
        "start_date": start_date,
        "end_date": end_date,
        "total_sessions": total_sessions,
        "session_dates": session_dates,
        "enrolled": len(enrolled),
        "students": students,
    })


@reports_bp.route("/daily-trend", methods=["GET"])
@jwt_required()
def daily_trend():
    db = get_db()
    days = int(request.args.get("days", 30))
    data = []
    for i in range(days - 1, -1, -1):
        d = (datetime.date.today() - datetime.timedelta(days=i)).isoformat()
        present = db.attendance.count_documents({"date": d, "status": "present", "late": False})
        late = db.attendance.count_documents({"date": d, "status": "present", "late": True})
        data.append({"date": d, "present": present, "late": late})
    return jsonify({"trend": data})
