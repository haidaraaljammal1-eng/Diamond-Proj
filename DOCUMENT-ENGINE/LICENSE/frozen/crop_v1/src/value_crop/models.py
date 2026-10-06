"""Data models for value cropping."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple


class BoundaryStatus(str, Enum):
    FOUND = "FOUND"
    AMBIGUOUS = "AMBIGUOUS"
    NOT_FOUND = "NOT_FOUND"


class FieldStatus(str, Enum):
    VALUE_OK = "VALUE_OK"
    VALUE_BOUNDARY_UNCERTAIN = "VALUE_BOUNDARY_UNCERTAIN"
    LABEL_BOUNDARY_CONFLICT = "LABEL_BOUNDARY_CONFLICT"
    EN_LABEL_VALUE_BLEED = "EN_LABEL_VALUE_BLEED"
    VALUE_GEOMETRY_CONFLICT = "VALUE_GEOMETRY_CONFLICT"
    TYPE2_ARABIC_BLEED = "TYPE2_ARABIC_BLEED"
    TRANSLATION_SPLIT_CONFLICT = "TRANSLATION_SPLIT_CONFLICT"
    VALUE_REGION_EMPTY_OR_INVALID = "VALUE_REGION_EMPTY_OR_INVALID"


@dataclass
class LabelDetection:
    template_name: str
    bbox: Tuple[int, int, int, int]
    match_score: float
    geometry_score: float
    final_confidence: float
    status: BoundaryStatus
    right_edge: int = 0
    left_edge: int = 0
    template_match_bbox: Tuple[int, int, int, int] = (0, 0, 0, 0)
    ink_bbox: Tuple[int, int, int, int] = (0, 0, 0, 0)
    match_scale: float = 1.0
    template_ink_width: int = 0
    detected_width_ratio: float = 0.0
    en_bleed_check: str = ""
    next_value_component_x: Optional[int] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "template_name": self.template_name,
            "bbox": list(self.bbox),
            "template_match_bbox": list(self.template_match_bbox),
            "ink_bbox": list(self.ink_bbox),
            "match_score": round(self.match_score, 4),
            "geometry_score": round(self.geometry_score, 4),
            "final_confidence": round(self.final_confidence, 4),
            "status": self.status.value,
            "right_edge": self.right_edge,
            "left_edge": self.left_edge,
            "match_scale": round(self.match_scale, 4),
            "template_ink_width": self.template_ink_width,
            "detected_width_ratio": round(self.detected_width_ratio, 4),
            "en_bleed_check": self.en_bleed_check,
            "next_value_component_x": self.next_value_component_x,
        }


@dataclass
class Type2Diagnostics:
    english_label_right: int
    arabic_field_label_left: int
    internal_x1: int
    internal_x2: int
    arabic_value_full_bbox: Tuple[int, int, int, int]
    arabic_value_left_edge: int
    arabic_value_left_edge_confidence: float
    arabic_phrase_status: str
    arabic_component_count: int
    projection_split_x: Optional[int]
    translation_split_x: Optional[int]
    split_raw_score: float
    normalized_confidence: float
    split_status: BoundaryStatus
    support_mode: str
    estimates_agree: Optional[bool]
    english_value_full_bbox: Tuple[int, int, int, int] = (0, 0, 0, 0)
    english_front_x2: int = 0
    arabic_front_x1: int = 0
    failure_code: Optional[str] = None
    ordered_islands: List[Dict[str, Any]] = field(default_factory=list)
    gap_score_table: List[Dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        agree_out: Any = self.estimates_agree
        if self.estimates_agree is None:
            agree_out = "N/A"
        split_ok = self.split_status == BoundaryStatus.FOUND
        split_conf: Any = (
            round(self.normalized_confidence, 4) if split_ok else "UNSUPPORTED"
        )
        return {
            "english_label_right": self.english_label_right,
            "arabic_field_label_left": self.arabic_field_label_left,
            "internal_x1": self.internal_x1,
            "internal_x2": self.internal_x2,
            "arabic_value_full_bbox": list(self.arabic_value_full_bbox),
            "arabic_value_bbox": list(self.arabic_value_full_bbox),
            "english_value_full_bbox": list(self.english_value_full_bbox),
            "english_phrase_bbox": list(self.english_value_full_bbox),
            "english_front_x2": self.english_front_x2,
            "arabic_front_x1": self.arabic_front_x1,
            "failure_code": self.failure_code,
            "ordered_islands": self.ordered_islands,
            "gap_score_table": self.gap_score_table,
            "arabic_value_left_edge": self.arabic_value_left_edge,
            "arabic_value_left_edge_confidence": round(
                self.arabic_value_left_edge_confidence, 4
            ),
            "arabic_phrase_status": self.arabic_phrase_status,
            "arabic_component_count": self.arabic_component_count,
            "projection_split_x": self.projection_split_x,
            "translation_split_x": self.translation_split_x,
            "split_raw_score": round(self.split_raw_score, 4),
            "normalized_confidence": round(self.normalized_confidence, 4),
            "split_status": self.split_status.value,
            "support_mode": self.support_mode,
            "estimates_agree": agree_out,
            "projection_valley_x": self.projection_split_x,
            "split_display_confidence": split_conf,
            "split_confidence": split_conf,
        }


@dataclass
class ValueCropResult:
    semantic: str
    structure_type: str
    field_status: FieldStatus
    value_bbox: Optional[Tuple[int, int, int, int]]
    value_bbox_canonical: Optional[Tuple[int, int, int, int]]
    english_label: Optional[LabelDetection] = None
    arabic_label: Optional[LabelDetection] = None
    type2: Optional[Type2Diagnostics] = None
    geometry_assertion: str = ""
    message: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "semantic": self.semantic,
            "structure_type": self.structure_type,
            "field_status": self.field_status.value,
            "value_bbox": list(self.value_bbox) if self.value_bbox else None,
            "value_bbox_canonical": (
                list(self.value_bbox_canonical) if self.value_bbox_canonical else None
            ),
            "english_label": self.english_label.to_dict() if self.english_label else None,
            "arabic_label": self.arabic_label.to_dict() if self.arabic_label else None,
            "type2": self.type2.to_dict() if self.type2 else None,
            "geometry_assertion": self.geometry_assertion,
            "message": self.message,
        }


@dataclass
class ValueCropPipelineResult:
    canonical_width: int
    scale_x: float
    tiny_gap_px: int
    tiny_outer_inset_px: int
    fields: List[ValueCropResult] = field(default_factory=list)
    template_dir: str = ""
    template_ink_bboxes: Dict[str, Tuple[int, int, int, int]] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "canonical_width": self.canonical_width,
            "scale_x": round(self.scale_x, 6),
            "tiny_gap_px": self.tiny_gap_px,
            "tiny_outer_inset_px": self.tiny_outer_inset_px,
            "template_dir": self.template_dir,
            "template_ink_bboxes": {
                k: list(v) for k, v in self.template_ink_bboxes.items()
            },
            "fields": [f.to_dict() for f in self.fields],
        }
