from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity
import bcrypt
from database import get_db
from bson import ObjectId

auth_bp = Blueprint("auth", __name__)

@auth_bp.route("/register", methods=["POST"])
def register():
    data = request.get_json()
    db   = get_db()

    required = ["name", "email", "password"]
    if not all(k in data for k in required):
        return jsonify({"error": "Бүх талбарыг бөглөнө үү"}), 400

    if db.users.find_one({"email": data["email"]}):
        return jsonify({"error": "Имэйл аль хэдийн бүртгэгдсэн"}), 409

    hashed = bcrypt.hashpw(data["password"].encode(), bcrypt.gensalt())
    user = {
        "name":     data["name"],
        "email":    data["email"],
        "password": hashed,
        "role":     data.get("role", "teacher"),
    }
    result = db.users.insert_one(user)
    token  = create_access_token(identity=str(result.inserted_id))
    return jsonify({"token": token, "user": {"id": str(result.inserted_id), "name": user["name"], "email": user["email"], "role": user["role"]}}), 201

@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json()
    db   = get_db()

    user = db.users.find_one({"email": data.get("email")})
    if not user or not bcrypt.checkpw(data.get("password", "").encode(), user["password"]):
        return jsonify({"error": "Имэйл эсвэл нууц үг буруу"}), 401

    token = create_access_token(identity=str(user["_id"]))
    return jsonify({
        "token": token,
        "user":  {"id": str(user["_id"]), "name": user["name"], "email": user["email"], "role": user["role"]}
    })

@auth_bp.route("/me", methods=["GET"])
@jwt_required()
def me():
    db      = get_db()
    user_id = get_jwt_identity()
    user    = db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        return jsonify({"error": "Хэрэглэгч олдсонгүй"}), 404
    return jsonify({"id": str(user["_id"]), "name": user["name"], "email": user["email"], "role": user["role"]})
