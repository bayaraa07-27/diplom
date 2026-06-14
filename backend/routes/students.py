from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from database import get_db
from bson import ObjectId
from utils.face_utils import encode_face_from_base64, save_face_encoding
import datetime

students_bp = Blueprint("students", __name__)

def serialize(s):
    if "_id" in s:
        s["id"] = str(s.pop("_id"))
    s.pop("face_encoding", None)
    # datetime → string
    for k, v in list(s.items()):
        if isinstance(v, datetime.datetime):
            s[k] = v.isoformat()
    return s

@students_bp.route("/", methods=["GET"])
@jwt_required()
def get_students():
    db     = get_db()
    page   = int(request.args.get("page", 1))
    limit  = int(request.args.get("limit", 20))
    search = request.args.get("search", "")
    query  = {
        "$or": [
            {"name":       {"$regex": search, "$options": "i"}},
            {"student_id": {"$regex": search, "$options": "i"}},
        ]
    } if search else {}
    total    = db.students.count_documents(query)
    students = list(db.students.find(query).skip((page - 1) * limit).limit(limit))
    return jsonify({
        "students": [serialize(s) for s in students],
        "total":    total,
        "page":     page,
        "pages":    (total + limit - 1) // limit,
    })

@students_bp.route("/<student_id>", methods=["GET"])
@jwt_required()
def get_student(student_id):
    db = get_db()
    s  = db.students.find_one({"student_id": student_id})
    if not s:
        return jsonify({"error": "Оюутан олдсонгүй"}), 404
    return jsonify(serialize(s))

@students_bp.route("/", methods=["POST"])
@jwt_required()
def create_student():
    data     = request.get_json()
    db       = get_db()
    required = ["student_id", "name", "department", "year"]
    if not all(k in data for k in required):
        return jsonify({"error": "Бүх талбарыг бөглөнө үү"}), 400
    if db.students.find_one({"student_id": data["student_id"]}):
        return jsonify({"error": "Оюутны дугаар аль хэдийн бүртгэгдсэн"}), 409
    student = {
        "student_id":    data["student_id"],
        "name":          data["name"],
        "department":    data["department"],
        "year":          data["year"],
        "email":         data.get("email", ""),
        "phone":         data.get("phone", ""),
        "face_enrolled": False,
        "created_at":    datetime.datetime.utcnow(),
    }
    result = db.students.insert_one(student)
    student["id"]  = str(result.inserted_id)
    student["created_at"] = student["created_at"].isoformat()
    student.pop("_id", None)
    return jsonify(student), 201

@students_bp.route("/<student_id>", methods=["PUT"])
@jwt_required()
def update_student(student_id):
    data    = request.get_json()
    db      = get_db()
    allowed = ["name", "department", "year", "email", "phone"]
    update  = {k: data[k] for k in allowed if k in data}
    result  = db.students.update_one({"student_id": student_id}, {"$set": update})
    if result.matched_count == 0:
        return jsonify({"error": "Оюутан олдсонгүй"}), 404
    return jsonify({"message": "Амжилттай шинэчлэгдлээ"})

@students_bp.route("/<student_id>", methods=["DELETE"])
@jwt_required()
def delete_student(student_id):
    db = get_db()
    result = db.students.delete_one({"student_id": student_id})
    if result.deleted_count == 0:
        return jsonify({"error": "Оюутан олдсонгүй"}), 404
    db.attendance.delete_many({"student_id": student_id})
    db.face_encodings.delete_one({"student_id": student_id})
    return jsonify({"message": "Амжилттай устгагдлаа"})


@students_bp.route("/<student_id>/enroll-face", methods=["DELETE"])
@jwt_required()
def reset_face(student_id):
    db = get_db()
    student = db.students.find_one({"student_id": student_id})
    if not student:
        return jsonify({"error": "Оюутан олдсонгүй"}), 404
    db.face_encodings.delete_one({"student_id": student_id})
    db.students.update_one(
        {"student_id": student_id},
        {"$set": {"face_enrolled": False}, "$unset": {"enrolled_at": ""}}
    )
    return jsonify({"message": "Царайны бүртгэл устгагдлаа"})

@students_bp.route("/<student_id>/enroll-face", methods=["POST"])
@jwt_required()
def enroll_face(student_id):
    db   = get_db()
    data = request.get_json()
    if "image" not in data:
        return jsonify({"error": "Зураг илгээнэ үү"}), 400
    student = db.students.find_one({"student_id": student_id})
    if not student:
        return jsonify({"error": "Оюутан олдсонгүй"}), 404
    encoding, error = encode_face_from_base64(data["image"])
    if error:
        return jsonify({"error": error}), 400
    save_face_encoding(student_id, encoding)
    db.students.update_one(
        {"student_id": student_id},
        {"$set": {"face_enrolled": True, "enrolled_at": datetime.datetime.utcnow()}}
    )
    return jsonify({"message": "Царай амжилттай бүртгэгдлээ"})

@students_bp.route("/<student_id>/face-status", methods=["GET"])
@jwt_required()
def face_status(student_id):
    db      = get_db()
    student = db.students.find_one({"student_id": student_id})
    if not student:
        return jsonify({"error": "Оюутан олдсонгүй"}), 404
    enrolled_at  = student.get("enrolled_at")
    enc_doc      = db.face_encodings.find_one({"student_id": student_id})
    sample_count = enc_doc.get("sample_count", 0) if enc_doc else 0
    return jsonify({
        "face_enrolled": student.get("face_enrolled", False),
        "enrolled_at":   enrolled_at.isoformat() if enrolled_at else None,
        "sample_count":  sample_count,
    })

@students_bp.route("/<student_id>/schedules", methods=["GET"])
@jwt_required()
def get_student_schedules(student_id):
    db      = get_db()
    student = db.students.find_one({"student_id": student_id}, {"schedule_ids": 1})
    if not student:
        return jsonify({"error": "Оюутан олдсонгүй"}), 404
    schedule_ids = student.get("schedule_ids", [])
    if not schedule_ids:
        return jsonify({"schedule_ids": [], "schedules": []})
    oids = []
    for sid in schedule_ids:
        try:
            oids.append(ObjectId(sid))
        except Exception:
            pass
    schedules = list(db.schedules.find({"_id": {"$in": oids}}))
    for s in schedules:
        s["id"] = str(s.pop("_id"))
    return jsonify({"schedule_ids": schedule_ids, "schedules": schedules})

@students_bp.route("/<student_id>/schedules", methods=["PUT"])
@jwt_required()
def update_student_schedules(student_id):
    db   = get_db()
    data = request.get_json()
    if "schedule_ids" not in data or not isinstance(data["schedule_ids"], list):
        return jsonify({"error": "schedule_ids массив шаардлагатай"}), 400
    student = db.students.find_one({"student_id": student_id}, {"_id": 1})
    if not student:
        return jsonify({"error": "Оюутан олдсонгүй"}), 404
    valid_ids = []
    for sid in data["schedule_ids"]:
        try:
            oid = ObjectId(sid)
            if db.schedules.find_one({"_id": oid}, {"_id": 1}):
                valid_ids.append(str(oid))
        except Exception:
            pass
    db.students.update_one(
        {"student_id": student_id},
        {"$set": {"schedule_ids": valid_ids}}
    )
    return jsonify({"message": "Хичээлийн бүртгэл шинэчлэгдлээ", "schedule_ids": valid_ids})

@students_bp.route("/by-schedule/<schedule_id>", methods=["GET"])
@jwt_required()
def students_by_schedule(schedule_id):
    db = get_db()
    try:
        oid = ObjectId(schedule_id)
    except Exception:
        return jsonify({"error": "Буруу schedule_id формат"}), 400
    schedule = db.schedules.find_one({"_id": oid})
    if not schedule:
        return jsonify({"error": "Хуваарь олдсонгүй"}), 404
    enrolled = list(db.students.find({"schedule_ids": schedule_id}, {"face_encoding": 0}))
    if enrolled:
        return jsonify({
            "students":        [serialize(s) for s in enrolled],
            "total":           len(enrolled),
            "enrollment_type": "explicit",
        })
    fallback = list(db.students.find(
        {"department": schedule["department"], "year": schedule["year"]},
        {"face_encoding": 0}
    ))
    return jsonify({
        "students":        [serialize(s) for s in fallback],
        "total":           len(fallback),
        "enrollment_type": "implicit",
    })