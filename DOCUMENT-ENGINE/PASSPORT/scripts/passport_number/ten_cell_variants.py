"""Safe 10-cell crop and preprocess variants (cells 0–9 only)."""

from __future__ import annotations

import cv2


def generate_ten_cell_preprocess_variants(crop10_bgr: np.ndarray) -> list[tuple[str, np.ndarray]]:
    """Controlled variants on the same 10-cell corridor image."""
    h, w = crop10_bgr.shape[:2]
    out: list[tuple[str, np.ndarray]] = [("original", crop10_bgr)]

    m = max(1, int(w * 0.02))
    if w > m * 2:
        out.append(("tight_h_2pct", crop10_bgr[:, m : w - m].copy()))

    out.append(
        (
            "pad_v_2px",
            cv2.copyMakeBorder(crop10_bgr, 2, 2, 0, 0, cv2.BORDER_CONSTANT, value=(255, 255, 255)),
        )
    )

    for scale in (2.0, 3.0, 4.0):
        out.append(
            (
                f"upscale_{int(scale)}x",
                cv2.resize(
                    crop10_bgr,
                    (max(1, int(w * scale)), max(1, int(h * scale))),
                    interpolation=cv2.INTER_CUBIC,
                ),
            )
        )

    gray = cv2.cvtColor(crop10_bgr, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(4, 4))
    out.append(("gray_clahe", cv2.cvtColor(clahe.apply(gray), cv2.COLOR_GRAY2BGR)))
    out.append(("mild_contrast", cv2.convertScaleAbs(crop10_bgr, alpha=1.15, beta=8)))

    return out


def split_ten_cells(crop10_bgr: np.ndarray) -> list[np.ndarray]:
    w = crop10_bgr.shape[1]
    cw = w / 10.0
    cells = []
    for i in range(10):
        x0 = int(round(i * cw))
        x1 = int(round((i + 1) * cw))
        cells.append(crop10_bgr[:, x0:x1].copy())
    return cells
