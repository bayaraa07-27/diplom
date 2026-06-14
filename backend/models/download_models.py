"""Liveness model татах script — Docker build үед ажиллана."""
import urllib.request
import os
import sys

MODEL_DIR = "/app/models"
os.makedirs(MODEL_DIR, exist_ok=True)

MODELS = [
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

for model in MODELS:
    path = os.path.join(MODEL_DIR, model["name"])

    if os.path.exists(path) and os.path.getsize(path) > 100_000:
        print(f"✅ {model['name']} аль хэдийн байна")
        continue

    downloaded = False
    for url in model["urls"]:
        try:
            print(f"📥 Татаж байна: {model['name']} ...")
            urllib.request.urlretrieve(url, path)
            size = os.path.getsize(path)
            if size > 100_000:
                print(f"✅ Амжилттай: {model['name']} ({size / 1024 / 1024:.1f} MB)")
                downloaded = True
                break
            else:
                os.remove(path)
        except Exception as e:
            print(f"⚠️ Алдаа ({url}): {e}")
            if os.path.exists(path):
                os.remove(path)

    if not downloaded:
        print(f"⚠️ {model['name']} татаж чадсангүй — runtime-д дахин оролдоно")

print("✅ Model татах дууслаа")