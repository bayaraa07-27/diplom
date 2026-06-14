from flask import Flask
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from dotenv import load_dotenv
import os
from datetime import timedelta
import logging

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

from extensions import limiter

from routes.auth import auth_bp
from routes.students import students_bp
from routes.attendance import attendance_bp
from routes.reports import reports_bp
from routes.schedules import schedules_bp
from database import init_db
from utils.json_utils import MongoJSONProvider

def create_app():
    app = Flask(__name__)
    app.url_map.strict_slashes = False

    # MongoDB datetime/ObjectId-г автоматаар JSON болгох
    app.json_provider_class = MongoJSONProvider
    app.json = MongoJSONProvider(app)

    app.config["JWT_SECRET_KEY"] = os.getenv("JWT_SECRET_KEY", "dev-secret-key")
    app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(hours=1)

    CORS(app,
         origins=[os.getenv("CORS_ORIGINS", "http://localhost:3000")],
         methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
         allow_headers=["Content-Type", "Authorization"])

    limiter.init_app(app)

    JWTManager(app)
    init_db()

    app.register_blueprint(auth_bp,       url_prefix="/api/auth")
    app.register_blueprint(students_bp,   url_prefix="/api/students")
    app.register_blueprint(attendance_bp, url_prefix="/api/attendance")
    app.register_blueprint(reports_bp,    url_prefix="/api/reports")
    app.register_blueprint(schedules_bp,  url_prefix="/api/schedules")

    # Царай танилтын загварыг background-д урьдчилан ачаална
    import threading
    def _warmup():
        try:
            from utils.face_utils import warmup
            warmup()
        except Exception as e:
            logger.warning(f"Face model warm-up алдаа: {e}")
    threading.Thread(target=_warmup, daemon=True).start()

    @app.route("/api/health")
    @limiter.exempt          # healthcheck-ийг rate limit-аас хасна (15сек тутамд дуудагддаг)
    def health():
        return {"status": "ok", "message": "Face Attendance API running"}

    return app

if __name__ == "__main__":
    app = create_app()
    port = int(os.getenv("FLASK_PORT", 5000))
    app.run(debug=False, host="0.0.0.0", port=port)