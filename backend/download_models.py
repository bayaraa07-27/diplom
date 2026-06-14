"""
Model татах script — Docker build үед ажиллана.
1. Liveness: MiniFASNet ONNX (~10MB)
2. InsightFace: ArcFace buffalo_sc (~20MB, buffalo_l-ээс 5x хурдан)
"""
import urllib.request
import os

MODEL_DIR = "/app/models"
os.makedirs(MODEL_DIR, exist_ok=True)

# ── 1. Liveness моделиуд ─────────────────────────────────────────────────────

LIVENESS_MODELS = [
    {
        "name": "MiniFASNetV2.onnx",
        "urls": [
            "https://raw.githubusercontent.com/minivision-ai/Silent-Face-Anti-Spoofing/master/resources/anti_spoof_models/2.7_80x80_MiniFASNetV2.onnx",
            "https://github.com/minivision-ai/Silent-Face-Anti-Spoofing/raw/master/resources/anti_spoof_models/2.7_80x80_MiniFASNetV2.onnx",
        ],
    },
    {
        "name": "MiniFASNetV1SE.onnx",
        "urls": [
            "https://raw.githubusercontent.com/minivision-ai/Silent-Face-Anti-Spoofing/master/resources/anti_spoof_models/4_0_0_80x80_MiniFASNetV1SE.onnx",
            "https://github.com/minivision-ai/Silent-Face-Anti-Spoofing/raw/master/resources/anti_spoof_models/4_0_0_80x80_MiniFASNetV1SE.onnx",
        ],
    },
]

print("── Liveness моделиуд ───────────────────────────────────")
for model in LIVENESS_MODELS:
    path = os.path.join(MODEL_DIR, model["name"])
    if os.path.exists(path) and os.path.getsize(path) > 100_000:
        print(f"✅ {model['name']} аль хэдийн байна")
        continue
    downloaded = False
    for url in model["urls"]:
        try:
            print(f"📥 Татаж байна: {model['name']} ...")
            urllib.request.urlretrieve(url, path)
            if os.path.exists(path) and os.path.getsize(path) > 100_000:
                size_mb = os.path.getsize(path) / 1024 / 1024
                print(f"✅ {model['name']} ({size_mb:.1f} MB)")
                downloaded = True
                break
            elif os.path.exists(path):
                os.remove(path)
        except Exception as e:
            print(f"⚠️  {url}: {e}")
            if os.path.exists(path):
                os.remove(path)
    if not downloaded:
        print(f"⚠️  {model['name']} татаж чадсангүй — runtime-д дахин оролдоно")

# ── 2. InsightFace buffalo_sc (~20MB, хурдан) ────────────────────────────────

print("\n── InsightFace ArcFace buffalo_sc (~20MB) ──────────────")
try:
    from insightface.app import FaceAnalysis
    insightface_root = os.environ.get("INSIGHTFACE_HOME", MODEL_DIR)
    app = FaceAnalysis(
        name="buffalo_sc",
        root=insightface_root,
        providers=["CPUExecutionProvider"],
    )
    app.prepare(ctx_id=-1, det_size=(320, 320))
    print("✅ InsightFace buffalo_sc бэлэн (det_size=320x320)")
except Exception as e:
    print(f"⚠️  InsightFace model татаж чадсангүй — эхний ажиллуулалтад дахин татна: {e}")

print("\n✅ Model татах дууслаа")
