# documents/filters.py
from __future__ import annotations

from typing import Optional, List
import django_filters
from django.db.models import Q, QuerySet
from django.db.models.fields import DateTimeField
from documents.models import Document


class DocumentFilterSet(django_filters.FilterSet):
    """
    Tham số hỗ trợ:
      - q: tìm kiếm nhanh (title, summary, content, numbers, sender, recipient) — chỉ add field nếu tồn tại
      - status: id hoặc code trạng thái (vd: 3 hoặc 'PUBLISHED')
      - doc_direction: 'di' | 'den' (viewset đã cố định nhưng vẫn hỗ trợ)
      - department, urgency, security: id (urgency/security tự map sang urgency_level/security_level nếu có)
      - creator: id người tạo (created_by)
      - assignee: id người được phân công
      - has_attachments: true/false
      - date_from/date_to: phạm vi ngày (issued_date cho outbound, received_date cho inbound)
      - mine: true → lọc theo assignees chứa request.user
      - ordering: created_at, updated_at, issued_date, received_date (tiền tố '-' để giảm dần)
    """

    q = django_filters.CharFilter(method="filter_q")
    status = django_filters.CharFilter(method="filter_status")
    doc_direction = django_filters.CharFilter(method="filter_doc_direction")

    # department/creator để nguyên theo tên phổ biến
    department = django_filters.NumberFilter(field_name="department_id")
    creator = django_filters.NumberFilter(field_name="created_by_id")

    # urgency/security map an toàn theo schema
    urgency = django_filters.NumberFilter(method="filter_urgency")
    security = django_filters.NumberFilter(method="filter_security")

    assignee = django_filters.NumberFilter(method="filter_assignee")
    has_attachments = django_filters.BooleanFilter(method="filter_has_attachments")
    date_from = django_filters.DateFilter(method="filter_date_from")
    date_to = django_filters.DateFilter(method="filter_date_to")
    mine = django_filters.BooleanFilter(method="filter_mine")

    ordering = django_filters.CharFilter(method="filter_ordering")

    class Meta:
        model = Document
        fields = [
            "q",
            "status",
            "doc_direction",
            "department",
            "urgency",
            "security",
            "creator",
            "assignee",
            "has_attachments",
            "date_from",
            "date_to",
            "mine",
            "ordering",
        ]

    # ================= Helpers =================
    @staticmethod
    def _has_field(field_name: str) -> bool:
        try:
            Document._meta.get_field(field_name)  # type: ignore[attr-defined]
            return True
        except Exception:
            return False

    @staticmethod
    def _is_datetime_field(field_name: str) -> bool:
        try:
            f = Document._meta.get_field(field_name)  # type: ignore[attr-defined]
            return isinstance(f, DateTimeField)
        except Exception:
            return False

    def _date_field_name(self) -> str:
        """
        Outbound view: issued_date; Inbound view: received_date; fallback: created_at → id.
        """
        data = getattr(self, "data", None)
        direction = None
        if data:
            direction = data.get("doc_direction")

        if not direction:
            req = getattr(self, "request", None)
            direction = getattr(req, "doc_direction_hint", None)

        if direction == "di" and self._has_field("issued_date"):
            return "issued_date"
        if direction == "den" and self._has_field("received_date"):
            return "received_date"

        if self._has_field("created_at"):
            return "created_at"
        return "id"

    def _map_order_field(self, name: str) -> str:
        """
        Map nhãn order bên ngoài → field thật trong DB (tồn tại).
        """
        candidate_map = {
            "created_at": ["created_at", "created_on", "created"],
            "updated_at": ["updated_at", "modified_at", "updated", "modified", "created_at"],
            "issued_date": ["issued_date", "created_at"],
            "received_date": ["received_date", "created_at"],
        }
        for cand in candidate_map.get(name, [name]):
            if self._has_field(cand):
                return cand
        return "created_at" if self._has_field("created_at") else "id"

    # ================= Implementations =================
    def filter_q(self, qs: QuerySet[Document], name: str, value: Optional[str]) -> QuerySet[Document]:
        if not value:
            return qs

        # Chỉ add điều kiện cho những field thực sự tồn tại
        cond = Q()
        for field in (
            "title",
            "summary",
            "content",
            "issue_number",
            "received_number",
            "sender",
            "recipient",
        ):
            if self._has_field(field):
                cond |= Q(**{f"{field}__icontains": value})

        # Nếu không field nào tồn tại, giữ nguyên qs (không raise lỗi)
        if cond == Q():
            return qs
        try:
            return qs.filter(cond)
        except Exception:
            # Trong trường hợp schema đặc biệt vẫn sinh lỗi, trả về qs để an toàn
            return qs

    def filter_status(self, qs: QuerySet[Document], name: str, value: Optional[str]) -> QuerySet[Document]:
        if value is None or value == "":
            return qs
        s = str(value)
        try:
            if s.isdigit():
                return qs.filter(status_id=int(s))
            # Nếu quan hệ status có field code
            return qs.filter(status__code__iexact=s)
        except Exception:
            # Schema không hỗ trợ code → thử status__name
            try:
                return qs.filter(status__name__iexact=s)
            except Exception:
                return qs.none()

    def filter_doc_direction(self, qs: QuerySet[Document], name: str, value: Optional[str]) -> QuerySet[Document]:
        """
        Hỗ trợ cả field "doc_direction" và "direction" trong model.
        """
        if not value:
            return qs
        v = str(value).strip().lower()
        try:
            if self._has_field("doc_direction"):
                return qs.filter(doc_direction__iexact=v)
            if self._has_field("direction"):
                return qs.filter(direction__iexact=v)
        except Exception:
            return qs
        return qs

    def filter_urgency(self, qs: QuerySet[Document], name: str, value) -> QuerySet[Document]:
        if value in (None, ""):
            return qs
        try:
            if self._has_field("urgency"):
                return qs.filter(urgency_id=value)
            if self._has_field("urgency_level"):
                return qs.filter(urgency_level_id=value)
        except Exception:
            return qs.none()
        return qs

    def filter_security(self, qs: QuerySet[Document], name: str, value) -> QuerySet[Document]:
        if value in (None, ""):
            return qs
        try:
            if self._has_field("security"):
                return qs.filter(security_id=value)
            if self._has_field("security_level"):
                return qs.filter(security_level_id=value)
        except Exception:
            return qs.none()
        return qs

    def filter_assignee(self, qs: QuerySet[Document], name: str, value) -> QuerySet[Document]:
        try:
            return qs.filter(assignees__id=value).distinct()
        except Exception:
            return qs.none()

    def filter_has_attachments(self, qs: QuerySet[Document], name: str, value: Optional[bool]) -> QuerySet[Document]:
        if value is None:
            return qs
        try:
            if value:
                return qs.filter(attachments__isnull=False).distinct()
            return qs.filter(attachments__isnull=True)
        except Exception:
            return qs.none()

    def filter_date_from(self, qs: QuerySet[Document], name: str, value) -> QuerySet[Document]:
        field = self._date_field_name()
        try:
            lookup = f"{field}__date__gte" if self._is_datetime_field(field) else f"{field}__gte"
            return qs.filter(**{lookup: value})
        except Exception:
            return qs

    def filter_date_to(self, qs: QuerySet[Document], name: str, value) -> QuerySet[Document]:
        field = self._date_field_name()
        try:
            lookup = f"{field}__date__lte" if self._is_datetime_field(field) else f"{field}__lte"
            return qs.filter(**{lookup: value})
        except Exception:
            return qs

    def filter_mine(self, qs: QuerySet[Document], name: str, value: Optional[bool]) -> QuerySet[Document]:
        if not value:
            return qs
        req = getattr(self, "request", None)
        user = getattr(req, "user", None)
        if user and getattr(user, "is_authenticated", False):
            try:
                return qs.filter(assignees__id=user.id).distinct()
            except Exception:
                return qs.none()
        return qs.none()

    def filter_ordering(self, qs: QuerySet[Document], name: str, value: Optional[str]) -> QuerySet[Document]:
        """
        Hỗ trợ: created_at, updated_at, issued_date, received_date (có thể nhiều, phân tách bởi ',').
        Tự map sang field thực tế có tồn tại trong model để tránh lỗi.
        """
        if not value:
            return qs

        parts = [p.strip() for p in str(value).split(",") if p.strip()]
        order_by_fields: List[str] = []

        for p in parts:
            desc = p.startswith("-")
            key = p[1:] if desc else p
            mapped = self._map_order_field(key)
            if mapped:
                order_by_fields.append(f"-{mapped}" if desc else mapped)

        if not order_by_fields:
            return qs
        try:
            return qs.order_by(*order_by_fields)
        except Exception:
            return qs
