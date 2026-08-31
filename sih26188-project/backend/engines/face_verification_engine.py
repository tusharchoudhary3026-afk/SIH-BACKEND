"""
Engine 5: Face Verification

Compares a consented document-portrait image against a consented selfie
using pretrained InsightFace (buffalo_l) to produce:

    MATCH
    MISMATCH
    INCONCLUSIVE

Demo-only data.
Does NOT use synthetic mock-ID photo placeholders or face_ref values.
"""

import json
import sys
from pathlib import Path

import cv2
import numpy as np
from insightface.app import FaceAnalysis


# ============================================================
# PATHS
# ============================================================

BACKEND_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BACKEND_DIR / "data"

CASES_PATH = DATA_DIR / "face_verification_cases.json"
REPORT_PATH = DATA_DIR / "face_verification_report.json"


# ============================================================
# DECISION THRESHOLDS
# ============================================================

# Cosine similarity thresholds
MATCH_THRESHOLD = 0.65
MISMATCH_THRESHOLD = 0.45


# ============================================================
# FACE / IMAGE QUALITY THRESHOLDS
# ============================================================

# Minimum detector confidence for a face to be considered
# a credible face.
MIN_DET_SCORE = 0.60

# Minimum face crop dimensions in pixels
MIN_FACE_WIDTH = 60
MIN_FACE_HEIGHT = 60

# Laplacian variance threshold for blur detection
BLUR_THRESHOLD = 60.0

# Acceptable brightness range
MIN_BRIGHTNESS = 40.0
MAX_BRIGHTNESS = 220.0

# Minimum overall quality score required for a confident
# MATCH or MISMATCH decision.
QUALITY_THRESHOLD = 0.50


# ============================================================
# LOAD CASES
# ============================================================

def load_cases():
    """Load face-verification cases from the manifest."""

    if not CASES_PATH.exists():
        print(f"ERROR: cases file not found at {CASES_PATH}")
        sys.exit(1)

    try:
        with open(CASES_PATH, "r", encoding="utf-8") as f:
            cases = json.load(f)

    except json.JSONDecodeError as exc:
        print(f"ERROR: invalid JSON in {CASES_PATH}")
        print(exc)
        sys.exit(1)

    if not isinstance(cases, list):
        print(
            "ERROR: face_verification_cases.json "
            "must contain a JSON list."
        )
        sys.exit(1)

    return cases


# ============================================================
# IMAGE QUALITY FUNCTIONS
# ============================================================

def compute_blur_score(gray_crop):
    """
    Calculate blur/sharpness using Laplacian variance.

    Higher value = sharper image.
    Lower value = more blurred image.
    """

    return float(
        cv2.Laplacian(
            gray_crop,
            cv2.CV_64F
        ).var()
    )


def compute_brightness(gray_crop):
    """Calculate average grayscale brightness."""

    return float(np.mean(gray_crop))


def quality_score(face, image_bgr):
    """
    Calculate a basic face-image quality score between 0 and 1.

    Signals:
        - face width
        - face height
        - detection confidence
        - blur
        - brightness
    """

    x1, y1, x2, y2 = [
        int(v)
        for v in face.bbox
    ]

    # --------------------------------------------------------
    # Clamp coordinates to image boundaries
    # --------------------------------------------------------

    x1 = max(0, x1)
    y1 = max(0, y1)

    x2 = min(
        image_bgr.shape[1],
        x2
    )

    y2 = min(
        image_bgr.shape[0],
        y2
    )

    crop = image_bgr[
        y1:y2,
        x1:x2
    ]

    # --------------------------------------------------------
    # Invalid crop
    # --------------------------------------------------------

    if crop.size == 0:
        return (
            0.0,
            {
                "width": 0,
                "height": 0,
                "blur": 0.0,
                "brightness": 0.0,
                "detection_confidence": 0.0,
            },
        )

    # --------------------------------------------------------
    # Calculate quality signals
    # --------------------------------------------------------

    gray = cv2.cvtColor(
        crop,
        cv2.COLOR_BGR2GRAY
    )

    width = x2 - x1
    height = y2 - y1

    blur = compute_blur_score(gray)
    brightness = compute_brightness(gray)

    detection_confidence = float(
        face.det_score
    )

    # --------------------------------------------------------
    # Start with perfect quality
    # --------------------------------------------------------

    score = 1.0

    # Small face penalty
    if (
        width < MIN_FACE_WIDTH
        or height < MIN_FACE_HEIGHT
    ):
        score *= 0.4

    # Detection confidence penalty
    if detection_confidence < MIN_DET_SCORE:
        score *= 0.5

    # Blur penalty
    if blur < BLUR_THRESHOLD:
        score *= 0.5

    # Brightness penalty
    if (
        brightness < MIN_BRIGHTNESS
        or brightness > MAX_BRIGHTNESS
    ):
        score *= 0.6

    # Incorporate detector confidence
    score *= detection_confidence

    score = max(
        0.0,
        min(1.0, score)
    )

    return (
        score,
        {
            "width": width,
            "height": height,
            "blur": round(float(blur), 2),
            "brightness": round(float(brightness), 2),
            "detection_confidence": round(
                detection_confidence,
                4
            ),
        },
    )


# ============================================================
# FACE DETECTION
# ============================================================

def analyze_image(app, image_path):
    """
    Load an image, detect faces, filter low-confidence detections,
    calculate image quality, and return the best credible face.

    Returns:

        face
        quality_score
        quality_details
        credible_face_count
        reason_codes
    """

    reasons = []

    full_path = BACKEND_DIR / image_path

    # --------------------------------------------------------
    # Check image exists
    # --------------------------------------------------------

    if not full_path.exists():
        return (
            None,
            0.0,
            {},
            0,
            ["IMAGE_NOT_FOUND"],
        )

    # --------------------------------------------------------
    # Read image
    # --------------------------------------------------------

    img = cv2.imread(
        str(full_path)
    )

    if img is None:
        return (
            None,
            0.0,
            {},
            0,
            ["IMAGE_UNREADABLE"],
        )

    # --------------------------------------------------------
    # Detect all faces
    # --------------------------------------------------------

    all_faces = app.get(img)

    raw_face_count = len(all_faces)

    # --------------------------------------------------------
    # Filter low-confidence detections
    # --------------------------------------------------------

    credible_faces = [
        face
        for face in all_faces
        if (
            face.det_score is not None
            and float(face.det_score)
            >= MIN_DET_SCORE
        )
    ]

    credible_face_count = len(
        credible_faces
    )

    print(
        f"  {image_path}: "
        f"{raw_face_count} raw face(s), "
        f"{credible_face_count} credible face(s)"
    )

    # --------------------------------------------------------
    # No credible face
    # --------------------------------------------------------

    if credible_face_count == 0:
        return (
            None,
            0.0,
            {},
            0,
            ["NO_FACE_DETECTED"],
        )

    # --------------------------------------------------------
    # Multiple credible faces
    # --------------------------------------------------------

    if credible_face_count > 1:
        reasons.append(
            "MULTIPLE_FACES_DETECTED"
        )

    # --------------------------------------------------------
    # Select highest-confidence credible face
    # --------------------------------------------------------

    face = max(
        credible_faces,
        key=lambda f: float(f.det_score)
    )

    # --------------------------------------------------------
    # Calculate quality
    # --------------------------------------------------------

    q_score, q_details = quality_score(
        face,
        img
    )

    if q_score < QUALITY_THRESHOLD:
        reasons.append(
            "LOW_IMAGE_QUALITY"
        )

    return (
        face,
        q_score,
        q_details,
        credible_face_count,
        reasons,
    )


# ============================================================
# COSINE SIMILARITY
# ============================================================

def cosine_similarity(a, b):
    """
    Calculate cosine similarity between two face embeddings.
    """

    a = np.asarray(
        a,
        dtype=np.float32
    )

    b = np.asarray(
        b,
        dtype=np.float32
    )

    a_norm = np.linalg.norm(a)
    b_norm = np.linalg.norm(b)

    if (
        a_norm == 0
        or b_norm == 0
    ):
        return 0.0

    a = a / a_norm
    b = b / b_norm

    return float(
        np.dot(a, b)
    )


# ============================================================
# DECISION LOGIC
# ============================================================

def decide(
    similarity,
    doc_face,
    selfie_face,
    doc_face_count,
    selfie_face_count,
    doc_q,
    selfie_q,
    extra_reasons,
):
    """
    Apply Engine 5 decision rules.

    MATCH:
        Exactly one credible face in each image
        AND similarity >= 0.65
        AND acceptable image quality.

    MISMATCH:
        Exactly one credible face in each image
        AND similarity < 0.45
        AND acceptable image quality.

    INCONCLUSIVE:
        No face
        Multiple faces
        Poor image quality
        OR similarity between 0.45 and 0.64.

    Important:
        A high similarity score with poor image quality is
        INCONCLUSIVE because the biometric evidence cannot
        be trusted confidently.

        In that situation we report LOW_IMAGE_QUALITY,
        NOT SIMILARITY_IN_UNCERTAIN_RANGE.
    """

    # --------------------------------------------------------
    # Remove duplicate reason codes while preserving order
    # --------------------------------------------------------

    reason_codes = list(
        dict.fromkeys(extra_reasons)
    )

    # --------------------------------------------------------
    # No usable document face
    # --------------------------------------------------------

    if doc_face_count == 0:
        if (
            "NO_DOCUMENT_FACE"
            not in reason_codes
        ):
            reason_codes.append(
                "NO_DOCUMENT_FACE"
            )

    # --------------------------------------------------------
    # No usable selfie face
    # --------------------------------------------------------

    if selfie_face_count == 0:
        if (
            "NO_SELFIE_FACE"
            not in reason_codes
        ):
            reason_codes.append(
                "NO_SELFIE_FACE"
            )

    # --------------------------------------------------------
    # Cannot perform comparison
    # --------------------------------------------------------

    if (
        doc_face_count == 0
        or selfie_face_count == 0
    ):
        return (
            "INCONCLUSIVE",
            80,
            reason_codes
            or ["FACE_NOT_DETECTED"],
        )

    # --------------------------------------------------------
    # Multiple credible document faces
    # --------------------------------------------------------

    if doc_face_count > 1:
        if (
            "MULTIPLE_DOCUMENT_FACES"
            not in reason_codes
        ):
            reason_codes.append(
                "MULTIPLE_DOCUMENT_FACES"
            )

    # --------------------------------------------------------
    # Multiple credible selfie faces
    # --------------------------------------------------------

    if selfie_face_count > 1:
        if (
            "MULTIPLE_SELFIE_FACES"
            not in reason_codes
        ):
            reason_codes.append(
                "MULTIPLE_SELFIE_FACES"
            )

    # --------------------------------------------------------
    # Multiple credible faces means comparison is unsafe
    # --------------------------------------------------------

    if (
        doc_face_count > 1
        or selfie_face_count > 1
    ):
        if (
            "MULTIPLE_FACES_DETECTED"
            not in reason_codes
        ):
            reason_codes.append(
                "MULTIPLE_FACES_DETECTED"
            )

        return (
            "INCONCLUSIVE",
            70,
            reason_codes,
        )

    # --------------------------------------------------------
    # Safety check
    # --------------------------------------------------------

    if (
        doc_face is None
        or selfie_face is None
    ):
        return (
            "INCONCLUSIVE",
            80,
            reason_codes
            or ["FACE_NOT_DETECTED"],
        )

    # --------------------------------------------------------
    # Determine image quality
    # --------------------------------------------------------

    poor_document_quality = (
        doc_q < QUALITY_THRESHOLD
    )

    poor_selfie_quality = (
        selfie_q < QUALITY_THRESHOLD
    )

    poor_quality = (
        poor_document_quality
        or poor_selfie_quality
    )

    # --------------------------------------------------------
    # Strong MATCH
    # --------------------------------------------------------

    if (
        similarity >= MATCH_THRESHOLD
        and not poor_quality
    ):

        if (
            "FACE_MATCH_CONFIDENT"
            not in reason_codes
        ):
            reason_codes.append(
                "FACE_MATCH_CONFIDENT"
            )

        risk = max(
            5,
            int(
                (1.0 - similarity)
                * 40
            ),
        )

        return (
            "MATCH",
            risk,
            reason_codes,
        )

    # --------------------------------------------------------
    # Strong MISMATCH
    # --------------------------------------------------------

    if (
        similarity < MISMATCH_THRESHOLD
        and not poor_quality
    ):

        if (
            "FACE_MISMATCH_CONFIDENT"
            not in reason_codes
        ):
            reason_codes.append(
                "FACE_MISMATCH_CONFIDENT"
            )

        return (
            "MISMATCH",
            90,
            reason_codes,
        )

    # ========================================================
    # INCONCLUSIVE CASES
    # ========================================================

    # --------------------------------------------------------
    # Case A:
    # High similarity but poor image quality
    #
    # Example:
    # similarity = 0.7727
    # selfie quality = 0.3835
    #
    # Correct explanation:
    # LOW_IMAGE_QUALITY
    #
    # Do NOT say similarity was uncertain.
    # --------------------------------------------------------

    if poor_quality:

        if (
            "LOW_IMAGE_QUALITY"
            not in reason_codes
        ):
            reason_codes.append(
                "LOW_IMAGE_QUALITY"
            )

        return (
            "INCONCLUSIVE",
            60,
            reason_codes,
        )

    # --------------------------------------------------------
    # Case B:
    # Both images have acceptable quality, but similarity
    # is genuinely between the MATCH and MISMATCH thresholds.
    # --------------------------------------------------------

    if (
        MISMATCH_THRESHOLD
        <= similarity
        < MATCH_THRESHOLD
    ):

        if (
            "SIMILARITY_IN_UNCERTAIN_RANGE"
            not in reason_codes
        ):
            reason_codes.append(
                "SIMILARITY_IN_UNCERTAIN_RANGE"
            )

        return (
            "INCONCLUSIVE",
            60,
            reason_codes,
        )

    # --------------------------------------------------------
    # Defensive fallback
    # --------------------------------------------------------

    if poor_quality:
        return (
            "INCONCLUSIVE",
            60,
            reason_codes
            or ["LOW_IMAGE_QUALITY"],
        )

    return (
        "INCONCLUSIVE",
        60,
        reason_codes
        or ["INSUFFICIENT_EVIDENCE"],
    )


# ============================================================
# MAIN ENGINE
# ============================================================

def run():

    print(
        "Loading InsightFace buffalo_l model..."
    )

    # --------------------------------------------------------
    # Initialize InsightFace
    #
    # CPUExecutionProvider is intentional for the current
    # environment. If CUDAExecutionProvider becomes available,
    # it can be added later.
    # --------------------------------------------------------

    app = FaceAnalysis(
        name="buffalo_l",
        providers=[
            "CPUExecutionProvider"
        ],
    )

    app.prepare(
        ctx_id=0,
        det_size=(640, 640),
    )

    # --------------------------------------------------------
    # Load cases
    # --------------------------------------------------------

    cases = load_cases()

    results = []

    # --------------------------------------------------------
    # Process every case
    # --------------------------------------------------------

    for case in cases:

        case_id = case["case_id"]

        print(
            f"Processing {case_id}..."
        )

        # ----------------------------------------------------
        # Document portrait
        # ----------------------------------------------------

        (
            doc_face,
            doc_q,
            doc_details,
            doc_face_count,
            doc_reasons,
        ) = analyze_image(
            app,
            case[
                "document_portrait_path"
            ],
        )

        # ----------------------------------------------------
        # Selfie
        # ----------------------------------------------------

        (
            selfie_face,
            selfie_q,
            selfie_details,
            selfie_face_count,
            selfie_reasons,
        ) = analyze_image(
            app,
            case["selfie_path"],
        )

        # ----------------------------------------------------
        # Combine reason codes
        # ----------------------------------------------------

        all_reasons = (
            doc_reasons
            + selfie_reasons
        )

        all_reasons = list(
            dict.fromkeys(
                all_reasons
            )
        )

        # ----------------------------------------------------
        # Calculate similarity
        #
        # Only calculate a biometric comparison when exactly
        # one credible face exists in both images.
        # ----------------------------------------------------

        if (
            doc_face is not None
            and selfie_face is not None
            and doc_face_count == 1
            and selfie_face_count == 1
        ):

            similarity = cosine_similarity(
                doc_face.embedding,
                selfie_face.embedding,
            )

        else:
            similarity = 0.0

        # ----------------------------------------------------
        # Decision
        # ----------------------------------------------------

        (
            decision,
            risk_score,
            reason_codes,
        ) = decide(
            similarity,
            doc_face,
            selfie_face,
            doc_face_count,
            selfie_face_count,
            doc_q,
            selfie_q,
            all_reasons,
        )

        # ----------------------------------------------------
        # Build result
        # ----------------------------------------------------

        result = {
            "case_id": case_id,

            "person_id": case.get(
                "person_id"
            ),

            "document_id": case.get(
                "document_id"
            ),

            # Face counts
            "document_face_count":
                doc_face_count,

            "selfie_face_count":
                selfie_face_count,

            # Detection confidence
            "document_face_confidence":
                round(
                    float(
                        doc_details.get(
                            "detection_confidence",
                            0.0,
                        )
                    ),
                    4,
                ),

            "selfie_face_confidence":
                round(
                    float(
                        selfie_details.get(
                            "detection_confidence",
                            0.0,
                        )
                    ),
                    4,
                ),

            # Similarity
            "similarity_score":
                round(
                    similarity,
                    4,
                ),

            # Overall quality
            "document_quality_score":
                round(
                    doc_q,
                    4,
                ),

            "selfie_quality_score":
                round(
                    selfie_q,
                    4,
                ),

            # Detailed quality evidence
            "document_quality_details":
                doc_details,

            "selfie_quality_details":
                selfie_details,

            # Final decision
            "decision":
                decision,

            "risk_score":
                risk_score,

            # Explainability
            "reason_codes":
                reason_codes,
        }

        results.append(result)

        print(
            f"  -> {decision} "
            f"(similarity={similarity:.4f}, "
            f"risk={risk_score})"
        )

    # --------------------------------------------------------
    # Write report
    # --------------------------------------------------------

    with open(
        REPORT_PATH,
        "w",
        encoding="utf-8",
    ) as f:

        json.dump(
            results,
            f,
            indent=2,
        )

    print(
        f"\nWrote {len(results)} result(s) "
        f"to {REPORT_PATH}"
    )


# ============================================================
# ENTRY POINT
# ============================================================

if __name__ == "__main__":
    run()