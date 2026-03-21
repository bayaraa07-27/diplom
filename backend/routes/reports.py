from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from database import get_db
import datetime
from collections import defaultdict

reports_bp = Blueprint("reports", __name__)

@reports_bp.route("/overview", methods=["GET"])
@jwt_required()
def overview():
    db    = get_db()
    today = datetime.date.today().isoformat()

    # Last 7 days attendance
    week_data = []
    for i in range(6, -1, -1):
        d     = (datetime.date.today() - datetime.timedelta(days=i)).isoformat()
        count = db.attendance.count_documents({"date": d, "status": "present"})
        week_data.append({"date": d, "count": count})

    total_students   = db.students.count_documents({})
    enrolled_faces   = db.students.count_documents({"face_enrolled": True})
    present_today    = db.attendance.count_documents({"date": today})
    total_attendance = db.attendance.count_documents({})

    return jsonify({
        "total_students":   total_students,
        "enrolled_faces":   enrolled_faces,
        "present_today":    present_today,
        "total_attendance": total_attendance,
        "week_data":        week_data,
        "attendance_rate":  round(present_today / total_students * 100, 1) if total_students else 0,
    })

@reports_bp.route("/student/<student_id>", methods=["GET"])
@jwt_required()
def student_report(student_id):
    db    = get_db()
    month = request.args.get("month", datetime.date.today().strftime("%Y-%m"))

    student = db.students.find_one({"student_id": student_id})
    if not student:
        return jsonify({"error": "Оюутан олдсонгүй"}), 404

    # Fetch month records
    records = list(db.attendance.find({"student_id": student_id, "date": {"$regex": f"^{month}"}}))
    present = len([r for r in records if r["status"] == "present"])
    late    = len([r for r in records if r.get("late")])

    # Working days in month (rough estimate)
    import calendar
    y, m   = map(int, month.split("-"))
    _, days = calendar.monthrange(y, m)
    work_days = sum(1 for d in range(1, days+1) if datetime.date(y, m, d).weekday() < 5)

    attendance_list = []
    for r in sorted(records, key=lambda x: x["date"]):
        attendance_list.append({
            "date":             r["date"],
            "check_in":         r["check_in"].isoformat() if r.get("check_in") else None,
            "check_out":        r["check_out"].isoformat() if r.get("check_out") else None,
            "status":           r["status"],
            "late":             r.get("late", False),
            "duration_minutes": r.get("duration_minutes"),
        })

    return jsonify({
        "student":         {"id": student_id, "name": student["name"], "department": student["department"]},
        "month":           month,
        "work_days":       work_days,
        "present":         present,
        "absent":          work_days - present,
        "late":            late,
        "rate":            round(present / work_days * 100, 1) if work_days else 0,
        "attendance_list": attendance_list,
    })

@reports_bp.route("/department", methods=["GET"])
@jwt_required()
def department_report():
    db    = get_db()
    month = request.args.get("month", datetime.date.today().strftime("%Y-%m"))

    departments = db.students.distinct("department")
    result = []
    for dept in departments:
        dept_students = list(db.students.find({"department": dept}))
        sids   = [s["student_id"] for s in dept_students]
        records = db.attendance.count_documents({"student_id": {"$in": sids}, "date": {"$regex": f"^{month}"}})
        result.append({
            "department":     dept,
            "total_students": len(dept_students),
            "total_present":  records,
            "rate":           round(records / (len(dept_students) * 22) * 100, 1) if dept_students else 0,
        })

    return jsonify({"departments": result, "month": month})

@reports_bp.route("/daily-trend", methods=["GET"])
@jwt_required()
def daily_trend():
    db   = get_db()
    days = int(request.args.get("days", 30))
    data = []
    for i in range(days-1, -1, -1):
        d       = (datetime.date.today() - datetime.timedelta(days=i)).isoformat()
        present = db.attendance.count_documents({"date": d, "status": "present"})
        late    = db.attendance.count_documents({"date": d, "late": True})
        data.append({"date": d, "present": present, "late": late})
    return jsonify({"trend": data})
