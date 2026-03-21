from pymongo import MongoClient
from pymongo.errors import ConnectionFailure, ConfigurationError
import os

_client = None
_db     = None

def init_db():
    global _client, _db

    uri = "mongodb+srv://bayarjavhlannatsgaa7_db_user:Javkhaa@diplom.e4wqqwu.mongodb.net/face_attendance"

    try:
        _client = MongoClient(uri, serverSelectionTimeoutMS=5000)
        _client.admin.command("ping")
    except (ConnectionFailure, ConfigurationError) as e:
        raise RuntimeError(f"❌ MongoDB connection failed: {e}")

    _db = _client["face_attendance"]

    _db.users.create_index("email", unique=True)
    _db.students.create_index("student_id", unique=True)
    _db.attendance.create_index([("student_id", 1), ("date", 1)])
    print("✅ MongoDB connected")

def get_db():
    if _db is None:
        raise RuntimeError("Database not initialized. Call init_db() first.")
    return _db