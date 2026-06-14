from sklearn.datasets import fetch_olivetti_faces
import cv2
import numpy as np

data   = fetch_olivetti_faces(data_home=".olivetti_cache")
images = data.images   # (400, 64, 64) float32

FACE = 80   # нэг царайн харагдах хэмжээ
COLS = 40   # нэг мөрт хэдэн зураг (40 хүн)
ROWS = 10   # мөрийн тоо (10 зураг/хүн)

canvas = np.zeros((ROWS * FACE, COLS * FACE), dtype=np.uint8)

for i, img in enumerate(images):
    gray = (img * 255).astype(np.uint8)
    big  = cv2.resize(gray, (FACE, FACE))
    r, c = divmod(i, COLS)
    canvas[r*FACE:(r+1)*FACE, c*FACE:(c+1)*FACE] = big

cv2.imwrite("olivetti_all_faces.png", canvas)
print(f"Хадгалагдлаа: olivetti_all_faces.png  ({COLS*FACE}x{ROWS*FACE} px)")
print(f"  {COLS} хүн  x  {ROWS} зураг  =  {len(images)} нийт зураг")
