from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity
import bcrypt
from database import get_db
from bson import ObjectId
from marshmallow import Schema, fields, ValidationError, validate
import logging

logger = logging.getLogger(__name__)

auth_bp = Blueprint("auth", __name__)

class RegisterSchema(Schema):
    name = fields.Str(required=True)
    email = fields.Email(required=True)
    password = fields.Str(required=True, validate=lambda p: len(p) >= 6)
    role = fields.Str(missing="teacher", validate=validate.OneOf(["teacher", "admin"]))

class LoginSchema(Schema):
    email = fields.Email(required=True)
    password = fields.Str(required=True)

@auth_bp.route("/register", methods=["POST"])
def register():
    try:
        schema = RegisterSchema()
        data = schema.load(request.get_json())
        db = get_db()

        if db.users.find_one({"email": data["email"]}):
            logger.warning(f"Registration attempt with existing email: {data['email']}")
            return jsonify({"error": "Имэйл аль хэдийн бүртгэгдсэн"}), 409

        hashed = bcrypt.hashpw(data["password"].encode("utf-8"), bcrypt.gensalt())
        user = {
            "name": data["name"],
            "email": data["email"],
            "password": hashed.decode("utf-8"),
            "role": data["role"],
        }
        result = db.users.insert_one(user)
        token = create_access_token(identity=str(result.inserted_id))
        logger.info(f"User registered: {data['email']}")
        return jsonify({"token": token, "user": {"id": str(result.inserted_id), "name": user["name"], "email": user["email"], "role": user["role"]}}), 201
    except ValidationError as err:
        logger.error(f"Validation error in register: {err.messages}")
        return jsonify({"error": "Оролт буруу", "details": err.messages}), 400
    except Exception as e:
        logger.error(f"Error in register: {str(e)}")
        return jsonify({"error": "Дотоод алдаа"}), 500

@auth_bp.route("/login", methods=["POST"])
def login():
    try:
        schema = LoginSchema()
        data = schema.load(request.get_json())
        db = get_db()

        user = db.users.find_one({"email": data["email"]})
        stored_password = user.get("password") if user else None
        password_bytes = stored_password.encode("utf-8") if isinstance(stored_password, str) else stored_password
        if not user or not bcrypt.checkpw(data["password"].encode("utf-8"), password_bytes):
            logger.warning(f"Failed login attempt for email: {data['email']}")
            return jsonify({"error": "Имэйл эсвэл нууц үг буруу"}), 401

        token = create_access_token(identity=str(user["_id"]))
        logger.info(f"User logged in: {data['email']}")
        return jsonify({
            "token": token,
            "user": {"id": str(user["_id"]), "name": user["name"], "email": user["email"], "role": user["role"]}
        })
    except ValidationError as err:
        logger.error(f"Validation error in login: {err.messages}")
        return jsonify({"error": "Оролт буруу", "details": err.messages}), 400
    except Exception as e:
        logger.error(f"Error in login: {str(e)}")
        return jsonify({"error": "Дотоод алдаа"}), 500

@auth_bp.route("/me", methods=["GET"])
@jwt_required()
def me():
    try:
        db = get_db()
        user_id = get_jwt_identity()
        user = db.users.find_one({"_id": ObjectId(user_id)})
        if not user:
            logger.warning(f"User not found for ID: {user_id}")
            return jsonify({"error": "Хэрэглэгч олдсонгүй"}), 404
        return jsonify({"id": str(user["_id"]), "name": user["name"], "email": user["email"], "role": user["role"]})
    except Exception as e:
        logger.error(f"Error in me: {str(e)}")
        return jsonify({"error": "Дотоод алдаа"}), 500
