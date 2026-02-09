import io
import logging
import os
import re
from dataclasses import dataclass
from typing import Any

import fitz  # PyMuPDF
import numpy as np
import pytesseract
from PIL import Image, ImageEnhance, ImageFilter, ImageOps
from fastapi import FastAPI, Form, HTTPException, UploadFile

logger = logging.getLogger(__name__)

app = FastAPI(title="Docura OCR Service")

OCR_ENGINE = os.getenv("OCR_ENGINE", "tesseract").strip().lower()
OCR_DET_MODEL = os.getenv("OCR_DET_MODEL", "PP-OCRv5_mobile_det")
OCR_REC_MODEL = os.getenv("OCR_REC_MODEL", "PP-OCRv5_mobile_rec")
OCR_LANG = os.getenv("OCR_LANG", "de")
OCR_DEVICE = os.getenv("OCR_DEVICE", "cpu")
OCR_TESSERACT_LANG = os.getenv("OCR_TESSERACT_LANG", "deu")
OCR_TESSERACT_CONFIG = os.getenv("OCR_TESSERACT_CONFIG", "--oem 1 --psm 6")
OCR_MAX_IMAGE_SIDE = int(os.getenv("OCR_MAX_IMAGE_SIDE", "2200"))
OCR_SKIP_ROTATIONS = {
    int(r.strip())
    for r in os.getenv("OCR_SKIP_ROTATIONS", "90,270").split(",")
    if r.strip()
}

GERMAN_HINT_WORDS = {
    "der",
    "die",
    "das",
    "und",
    "ist",
    "nicht",
    "wir",
    "sie",
    "mit",
    "dass",
    "von",
    "für",
    "eine",
    "einen",
    "den",
    "dem",
    "des",
    "im",
    "in",
    "zu",
    "auf",
    "werden",
    "bitte",
    "danke",
}

NOISE_CHARS = set("|[]{}<>~^_`*")


@dataclass(frozen=True)
class OcrCandidate:
    variant: str
    rotation: int
    text: str
    score: float

ocr_engine: Any = None
if OCR_ENGINE == "paddle":
    from paddleocr import PaddleOCR

    ocr_engine = PaddleOCR(
        text_detection_model_name=OCR_DET_MODEL,
        text_recognition_model_name=OCR_REC_MODEL,
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
        use_textline_orientation=False,
        lang=OCR_LANG,
        device=OCR_DEVICE,
    )
    logger.info(
        "OCR engine initialized: paddle (det=%s, rec=%s, device=%s)",
        OCR_DET_MODEL,
        OCR_REC_MODEL,
        OCR_DEVICE,
    )
elif OCR_ENGINE == "tesseract":
    logger.info("OCR engine initialized: tesseract (lang=%s)", OCR_TESSERACT_LANG)
else:
    raise RuntimeError(
        f'Unsupported OCR_ENGINE "{OCR_ENGINE}". Use "tesseract" or "paddle".'
    )


def _extract_lines_from_result(result: Any) -> list[str]:
    if not result:
        return []

    # Legacy PaddleOCR output: [[ [box, [text, score]], ... ]]
    if isinstance(result, (list, tuple)) and result and isinstance(result[0], (list, tuple)):
        first_page = result[0]
        lines: list[str] = []
        for line in first_page:
            if not isinstance(line, (list, tuple)) or len(line) < 2:
                continue
            candidate = line[1]
            if isinstance(candidate, (list, tuple)) and candidate and isinstance(candidate[0], str):
                text = candidate[0].strip()
                if text:
                    lines.append(text)
        if lines:
            return lines

    # PaddleOCR pipeline variants can return dict/list structures with string fields.
    lines: list[str] = []
    seen: set[str] = set()

    def add_line(value: str) -> None:
        text = value.strip()
        if text and text not in seen:
            seen.add(text)
            lines.append(text)

    def walk(value: Any) -> None:
        if isinstance(value, str):
            add_line(value)
            return
        if isinstance(value, dict):
            for key in ("rec_texts", "texts", "text"):
                candidate = value.get(key)
                if isinstance(candidate, str):
                    add_line(candidate)
                elif isinstance(candidate, (list, tuple)):
                    for item in candidate:
                        if isinstance(item, str):
                            add_line(item)
                        else:
                            walk(item)
            for nested in value.values():
                walk(nested)
            return
        if isinstance(value, (list, tuple)):
            for item in value:
                if isinstance(item, str):
                    add_line(item)
                else:
                    walk(item)

    walk(result)
    return lines


def _normalize_tesseract_lines(text: str) -> list[str]:
    return [line.strip() for line in text.splitlines() if line.strip()]


def _run_tesseract_raw(image: Image.Image) -> str:
    text = pytesseract.image_to_string(
        image,
        lang=OCR_TESSERACT_LANG,
        config=OCR_TESSERACT_CONFIG,
    )
    return "\n".join(_normalize_tesseract_lines(text))


def _resize_if_needed(image: Image.Image) -> Image.Image:
    width, height = image.size
    max_side = max(width, height)
    if max_side <= OCR_MAX_IMAGE_SIDE:
        return image
    scale = OCR_MAX_IMAGE_SIDE / max_side
    target_size = (max(1, int(width * scale)), max(1, int(height * scale)))
    return image.resize(target_size, Image.Resampling.LANCZOS)


def _prepare_image_variants(image: Image.Image) -> dict[str, Image.Image]:
    image = ImageOps.exif_transpose(image).convert("L")
    image = _resize_if_needed(image)
    image = ImageOps.autocontrast(image, cutoff=1)
    image = image.filter(ImageFilter.MedianFilter(size=3))

    soft = ImageEnhance.Contrast(image).enhance(1.35)
    arr = np.array(soft, dtype=np.uint8)
    threshold_58 = int(np.percentile(arr, 58))
    threshold_68 = int(np.percentile(arr, 68))
    binary_low = Image.fromarray(np.where(arr > threshold_58, 255, 0).astype(np.uint8))
    binary_high = Image.fromarray(np.where(arr > threshold_68, 255, 0).astype(np.uint8))

    return {
        "soft": soft,
        "binary_low": binary_low,
        "binary_high": binary_high,
    }


def _score_ocr_text(text: str) -> float:
    stripped = text.strip()
    if not stripped:
        return -100.0

    length = len(stripped)
    alpha_chars = sum(char.isalpha() for char in stripped)
    digit_chars = sum(char.isdigit() for char in stripped)
    whitespace_chars = sum(char.isspace() for char in stripped)
    noise_chars = sum(char in NOISE_CHARS for char in stripped)
    alpha_ratio = alpha_chars / max(length, 1)

    tokens = re.findall(r"[A-Za-zÄÖÜäöüß]{2,}", stripped)
    token_count = len(tokens)
    german_hits = sum(1 for token in tokens if token.lower() in GERMAN_HINT_WORDS)
    avg_word_length = (
        sum(len(token) for token in tokens) / token_count if token_count > 0 else 0.0
    )

    score = 0.0
    score += alpha_ratio * 60.0
    score += min(token_count, 80) * 0.9
    score += german_hits * 4.0
    score -= noise_chars * 2.5

    if token_count == 0:
        score -= 12.0
    if whitespace_chars < max(2, token_count // 8):
        score -= 5.0
    if digit_chars > alpha_chars * 0.8:
        score -= 6.0
    if avg_word_length > 12 or (token_count > 4 and avg_word_length < 2.5):
        score -= 8.0

    return score


def _run_tesseract_best(image: Image.Image) -> list[str]:
    variants = _prepare_image_variants(image)
    candidates: list[OcrCandidate] = []

    for variant_name, variant in variants.items():
        for rotation in (0, 90, 180, 270):
            if rotation in OCR_SKIP_ROTATIONS:
                continue
            candidate_image = (
                variant
                if rotation == 0
                else variant.rotate(rotation, expand=True, fillcolor=255)
            )
            text = _run_tesseract_raw(candidate_image)
            score = _score_ocr_text(text)
            candidates.append(
                OcrCandidate(
                    variant=variant_name,
                    rotation=rotation,
                    text=text,
                    score=score,
                )
            )

    if not candidates:
        return []

    best = max(candidates, key=lambda candidate: candidate.score)
    logger.info(
        "Best OCR candidate selected: variant=%s rotation=%d score=%.2f chars=%d",
        best.variant,
        best.rotation,
        best.score,
        len(best.text),
    )

    if logger.isEnabledFor(logging.DEBUG):
        logger.debug(
            "OCR candidates: %s",
            ", ".join(
                f"{candidate.variant}@{candidate.rotation}:{candidate.score:.2f}"
                for candidate in candidates
            ),
        )

    if best.score < 8.0 and len(best.text) < 24:
        return []

    return _normalize_tesseract_lines(best.text)


def _run_tesseract(img_array: np.ndarray) -> list[str]:
    image = Image.fromarray(img_array).convert("L")
    image = ImageOps.autocontrast(image, cutoff=1)
    text = _run_tesseract_raw(image)
    return _normalize_tesseract_lines(text)


def _run_ocr(img_array: np.ndarray) -> list[str]:
    if OCR_ENGINE == "tesseract":
        return _run_tesseract(img_array)

    if ocr_engine is None:
        raise RuntimeError("Paddle OCR engine is not initialized")

    try:
        result = ocr_engine.ocr(img_array)
    except TypeError as error:
        # Keep compatibility with PaddleOCR variants where .ocr delegates differently.
        if hasattr(ocr_engine, "predict"):
            result = ocr_engine.predict(img_array)
        else:
            raise error
    return _extract_lines_from_result(result)


def _ocr_page(page: fitz.Page) -> str:
    """Render a PDF page at 300 DPI and run OCR on it."""
    pixmap = page.get_pixmap(dpi=300)
    img = Image.frombytes("RGB", [pixmap.width, pixmap.height], pixmap.samples)
    img_array = np.array(img)
    lines = _run_ocr(img_array)
    return "\n".join(lines)


@app.post("/extract/image")
async def extract_image(file: UploadFile):
    try:
        contents = await file.read()
        with Image.open(io.BytesIO(contents)) as img:
            if OCR_ENGINE == "tesseract":
                lines = _run_tesseract_best(img)
            else:
                img_array = np.array(ImageOps.exif_transpose(img).convert("RGB"))
                lines = _run_ocr(img_array)
        return {"text": "\n".join(lines)}
    except Exception as error:
        logger.exception("Image OCR failed")
        raise HTTPException(status_code=500, detail="OCR image extraction failed") from error


VALID_PDF_MODES = {"text", "ocr", "auto"}


@app.post("/extract/pdf")
async def extract_pdf(file: UploadFile, mode: str = Form(default="auto")):
    if mode not in VALID_PDF_MODES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid mode '{mode}'. Must be one of: {', '.join(sorted(VALID_PDF_MODES))}",
        )
    try:
        contents = await file.read()
        pages = []
        with fitz.open(stream=contents, filetype="pdf") as doc:
            for page in doc:
                if mode == "text":
                    pages.append(page.get_text())
                elif mode == "ocr":
                    pages.append(_ocr_page(page))
                else:  # auto
                    text = page.get_text()
                    if len(text.strip()) < 20:
                        text = _ocr_page(page)
                    pages.append(text)
        return {"text": "\n\n".join(pages)}
    except Exception as error:
        logger.exception("PDF OCR failed")
        raise HTTPException(status_code=500, detail="OCR pdf extraction failed") from error


@app.get("/health")
async def health():
    return {"status": "ok"}
