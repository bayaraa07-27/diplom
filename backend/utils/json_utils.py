"""MongoDB-ийн datetime, ObjectId-г JSON-д хувиргах helper."""
from bson import ObjectId
import datetime
from flask.json.provider import DefaultJSONProvider

class MongoJSONProvider(DefaultJSONProvider):
    def default(self, obj):
        if isinstance(obj, datetime.datetime):
            # Z дагавар нэмэх → JavaScript UTC-р зөв тайлбарлана
            return obj.isoformat() + "Z"
        if isinstance(obj, ObjectId):
            return str(obj)
        return super().default(obj)