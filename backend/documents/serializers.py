# documents/serializers.py
from __future__ import annotations
from typing import Any, Optional, Mapping, Iterable, List, Callable, Dict, cast
from datetime import datetime

from django.contrib.auth import get_user_model
from django.core.files.storage import default_storage
from django.db.models.query import QuerySet
from rest_framework import serializers
from rest_framework.request import Request
from rest_framework.utils.serializer_helpers import ReturnDict, ReturnList
from drf_spectacular.utils import extend_schema_field
from drf_spectacular.types import OpenApiTypes

from common.serializers import (
    TinyDictSerializer,
    CompactUserSerializer,
    TrimmedCharField,
    ServiceErrorToDRFMixin,
)
from accounts.models import Department
from accounts.models import Department
from catalog.models import (
    Field,
    DocumentType,
    UrgencyLevel,
    SecurityLevel,
    IssueLevel,
    DocumentStatus,
)

from documents.models import (
    Document,
    DocumentAttachment,
    DocumentAssignment,
    DocumentApproval,
    DocumentVersion,
    DocumentWorkflowLog,
    RegisterBook,
    NumberingRule,
    DocumentTemplate,
    Organization,
    OrgContact,
    DispatchOutbox,
)

from core.etag import build_etag

User = get_user_model()


# ----------------- helpers -----------------
def _created_at_key(obj: Any) -> float:
    val = getattr(obj, "created_at", None)
    if isinstance(val, datetime):
        try:
            return float(val.timestamp())
        except Exception:
            return 0.0
    return 0.0


def _to_plain_dict(data: Any) -> Optional[Dict[str, Any]]:
    if data is None:
        return None
    if isinstance(data, dict):
        return data
    if isinstance(data, ReturnDict):
        return dict(data)
    if isinstance(data, Mapping):
        return dict(data)
    return None


def _to_plain_list_of_dicts(data: Any) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    if data is None:
        return out
    if isinstance(data, ReturnList) or isinstance(data, list):
        seq = list(data)
        for item in seq:
            if isinstance(item, dict):
                out.append(item)
            elif isinstance(item, ReturnDict):
                out.append(dict(item))
            elif isinstance(item, Mapping):
                out.append(dict(item))
    return out


def _pick_dt(obj: Any, *names: str) -> Optional[datetime]:
    """Chọn field datetime đầu tiên tồn tại trong danh sách tên."""
    for n in names:
        v = getattr(obj, n, None)
        if isinstance(v, datetime):
            return v
    return None


# ========== Config Serializers (Register book / Numbering / Templates) ==========
class _OrgConfigSerializerMixin(serializers.ModelSerializer):
    department = serializers.SerializerMethodField()
    department_id = serializers.IntegerField(
        required=False, allow_null=True, write_only=True
    )
    created_by = CompactUserSerializer(read_only=True)
    updated_by = CompactUserSerializer(read_only=True)

    def _current_user(self):
        request = self.context.get("request") if isinstance(self.context, dict) else None
        user = getattr(request, "user", None)
        if user is not None and getattr(user, "is_authenticated", False):
            return user
        return None

    def _assign_department(self, validated_data: Dict[str, Any]) -> None:
        dept_id = validated_data.pop("department_id", None)
        if dept_id is None:
            if "department" in validated_data and validated_data["department"] is None:
                validated_data.pop("department", None)
            return
        try:
            validated_data["department"] = Department.objects.get(pk=dept_id)
        except Department.DoesNotExist as exc:  # pragma: no cover - defensive
            raise serializers.ValidationError(
                {"department_id": ["Phòng ban không hợp lệ."]}
            ) from exc

    def get_department(self, obj: Any) -> Optional[Dict[str, Any]]:
        return TinyDictSerializer.from_model(getattr(obj, "department", None))


class RegisterBookSerializer(_OrgConfigSerializerMixin):
    class Meta:
        model = RegisterBook
        fields = (
            "register_id",
            "name",
            "direction",
            "year",
            "prefix",
            "suffix",
            "padding",
            "next_sequence",
            "reset_policy",
            "description",
            "metadata",
            "is_active",
            "department_id",
            "department",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        )
        read_only_fields = (
            "register_id",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        )

    name = TrimmedCharField()

    def create(self, validated_data: Dict[str, Any]) -> RegisterBook:
        self._assign_department(validated_data)
        user = self._current_user()
        if user:
            validated_data.setdefault("created_by", user)
            validated_data.setdefault("updated_by", user)
        return super().create(validated_data)

    def update(
        self, instance: RegisterBook, validated_data: Dict[str, Any]
    ) -> RegisterBook:
        self._assign_department(validated_data)
        user = self._current_user()
        if user:
            validated_data.setdefault("updated_by", user)
        return super().update(instance, validated_data)


class NumberingRuleSerializer(_OrgConfigSerializerMixin):
    class Meta:
        model = NumberingRule
        fields = (
            "rule_id",
            "code",
            "name",
            "target",
            "prefix",
            "suffix",
            "padding",
            "start_sequence",
            "next_sequence",
            "reset_policy",
            "description",
            "metadata",
            "is_active",
            "department_id",
            "department",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        )
        read_only_fields = (
            "rule_id",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        )

    code = TrimmedCharField()
    name = TrimmedCharField()

    def create(self, validated_data: Dict[str, Any]) -> NumberingRule:
        self._assign_department(validated_data)
        user = self._current_user()
        if user:
            validated_data.setdefault("created_by", user)
            validated_data.setdefault("updated_by", user)
        return super().create(validated_data)

    def update(
        self, instance: NumberingRule, validated_data: Dict[str, Any]
    ) -> NumberingRule:
        self._assign_department(validated_data)
        user = self._current_user()
        if user:
            validated_data.setdefault("updated_by", user)
        return super().update(instance, validated_data)


class DocumentTemplateSerializer(serializers.ModelSerializer):
    created_by = CompactUserSerializer(read_only=True)
    updated_by = CompactUserSerializer(read_only=True)

    class Meta:
        model = DocumentTemplate
        fields = (
            "template_id",
            "name",
            "doc_direction",
            "version",
            "description",
            "content",
            "format",
            "tags",
            "is_active",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        )
        read_only_fields = (
            "template_id",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        )

    name = TrimmedCharField()

    def _current_user(self):
        request = self.context.get("request") if isinstance(self.context, dict) else None
        user = getattr(request, "user", None)
        if user is not None and getattr(user, "is_authenticated", False):
            return user
        return None

    def create(self, validated_data: Dict[str, Any]) -> DocumentTemplate:
        user = self._current_user()
        if user:
            validated_data.setdefault("created_by", user)
            validated_data.setdefault("updated_by", user)
        return super().create(validated_data)

    def update(
        self, instance: DocumentTemplate, validated_data: Dict[str, Any]
    ) -> DocumentTemplate:
        user = self._current_user()
        if user:
            validated_data.setdefault("updated_by", user)
        return super().update(instance, validated_data)


# ========== Slim/List ==========
class DocumentSlimSerializer(serializers.ModelSerializer):
    """
    Dùng cho listing nhanh:
      - Trường gọn & đủ cho bảng danh sách
      - Alias: outgoing_number / incoming_number
      - Status/Department/Urgency/Security dạng tiny object
      - created_at/updated_at được map an toàn từ nhiều tên khả dĩ
    """
    id = serializers.SerializerMethodField()
    doc_direction = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()
    status_name = serializers.SerializerMethodField()
    department = serializers.SerializerMethodField()
    urgency = serializers.SerializerMethodField()
    security = serializers.SerializerMethodField()
    sender = serializers.SerializerMethodField()

    outgoing_number = serializers.SerializerMethodField()
    incoming_number = serializers.SerializerMethodField()

    issued_date = serializers.DateField(read_only=True, required=False, allow_null=True)
    received_date = serializers.DateField(read_only=True, required=False, allow_null=True)

    creator = serializers.SerializerMethodField()
    assignee_count = serializers.SerializerMethodField()
    has_attachments = serializers.SerializerMethodField()

    created_at = serializers.SerializerMethodField()
    updated_at = serializers.SerializerMethodField()
    etag = serializers.SerializerMethodField()

    class Meta:
        model = Document
        fields = (
            "id",
            "title",
            "doc_direction",
            "status",
            "status_name",
            "department",
            "urgency",
            "security",
            "sender",
            "outgoing_number",
            "incoming_number",
            "issued_date",
            "received_date",
            "creator",
            "assignee_count",
            "has_attachments",
            "created_at",
            "updated_at",
            "etag",
        )
        read_only_fields = fields

    @extend_schema_field(OpenApiTypes.STR)
    def get_etag(self, obj: Any) -> str:
        return build_etag(obj, prefix="Document")

    # -------- computed getters --------
    @extend_schema_field(OpenApiTypes.INT)
    def get_id(self, obj: Any) -> Optional[int]:
        pk = getattr(obj, "pk", None)
        if pk is None:
            return None
        try:
            return int(pk)
        except (TypeError, ValueError):
            # Trong schema hệ thống dùng INT; trong project hiện tại PK là INT nên nhánh này không xảy ra.
            # Giữ fallback để an toàn nếu môi trường khác.
            return pk  # type: ignore[return-value]

    @extend_schema_field(OpenApiTypes.STR)
    def get_doc_direction(self, obj: Any) -> Optional[str]:
        value = getattr(obj, "direction", None) or getattr(obj, "doc_direction", None)
        if value is None:
            return None
        return getattr(value, "value", value)

    @extend_schema_field(OpenApiTypes.OBJECT)
    def get_status(self, obj: Any) -> Optional[Dict[str, Any]]:
        return TinyDictSerializer.from_model(getattr(obj, "status", None))

    @extend_schema_field(OpenApiTypes.STR)
    def get_status_name(self, obj: Any) -> Optional[str]:
        st = getattr(obj, "status", None)
        if st is None:
            return None
        return getattr(st, "name", None) or getattr(st, "code", None)

    @extend_schema_field(OpenApiTypes.OBJECT)
    def get_department(self, obj: Any) -> Optional[Dict[str, Any]]:
        return TinyDictSerializer.from_model(getattr(obj, "department", None))

    @extend_schema_field(OpenApiTypes.OBJECT)
    def get_urgency(self, obj: Any) -> Optional[Dict[str, Any]]:
        return TinyDictSerializer.from_model(getattr(obj, "urgency", None))

    @extend_schema_field(OpenApiTypes.OBJECT)
    def get_security(self, obj: Any) -> Optional[Dict[str, Any]]:
        return TinyDictSerializer.from_model(getattr(obj, "security", None))

    @extend_schema_field(OpenApiTypes.STR)
    def get_sender(self, obj: Any) -> Optional[str]:
        value = getattr(obj, "sender", None)
        if value is None:
            return None
        return str(value)

    @extend_schema_field(OpenApiTypes.STR)
    def get_outgoing_number(self, obj: Any) -> Optional[str]:
        return getattr(obj, "issue_number", None)

    @extend_schema_field(OpenApiTypes.STR)
    def get_incoming_number(self, obj: Any) -> Optional[str]:
        return getattr(obj, "received_number", None)

    @extend_schema_field(OpenApiTypes.OBJECT)
    def get_creator(self, obj: Any) -> Optional[Dict[str, Any]]:
        user = getattr(obj, "created_by", None)
        if not user:
            return None
        data = CompactUserSerializer(user).data
        return _to_plain_dict(data)

    @extend_schema_field(OpenApiTypes.INT)
    def get_assignee_count(self, obj: Any) -> int:
        m2m = getattr(obj, "assignees", None)
        if m2m is None:
            return 0
        count_fn: Optional[Callable[[], int]] = getattr(m2m, "count", None)  # type: ignore[attr-defined]
        if callable(count_fn):
            try:
                return int(count_fn())
            except Exception:
                return 0
        return 0

    @extend_schema_field(OpenApiTypes.BOOL)
    def get_has_attachments(self, obj: Any) -> bool:
        rel = getattr(obj, "attachments", None)
        exists_fn: Optional[Callable[[], bool]] = getattr(rel, "exists", None) if rel is not None else None  # type: ignore[attr-defined]
        if callable(exists_fn):
            try:
                return bool(exists_fn())
            except Exception:
                return False
        try:
            return bool(
                DocumentAttachment.objects.filter(document_id=getattr(obj, "pk", None)).exists()
            )
        except Exception:
            return False

    @extend_schema_field(OpenApiTypes.DATETIME)
    def get_created_at(self, obj: Any) -> Optional[datetime]:
        return _pick_dt(obj, "created_at", "created_on", "created")

    @extend_schema_field(OpenApiTypes.DATETIME)
    def get_updated_at(self, obj: Any) -> Optional[datetime]:
        return _pick_dt(obj, "updated_at", "updated_on", "modified", "modified_at")


# ========== Detail ==========
class DocumentAttachmentSerializer(serializers.ModelSerializer):
    attachment_id = serializers.SerializerMethodField()
    id = serializers.SerializerMethodField()
    file_url = serializers.SerializerMethodField()
    size = serializers.SerializerMethodField()
    uploaded_by = CompactUserSerializer(read_only=True)

    class Meta:
        model = DocumentAttachment
        fields = (
            "attachment_id",
            "id",
            "file_name",
            "attachment_type",
            "note",
            "file_url",
            "size",
            "uploaded_at",
            "uploaded_by",
        )
        read_only_fields = fields

    @extend_schema_field(OpenApiTypes.STR)
    def get_attachment_id(self, obj: Any) -> Optional[str]:
        pk = getattr(obj, "pk", None)
        return None if pk is None else str(pk)

    @extend_schema_field(OpenApiTypes.STR)
    def get_id(self, obj: Any) -> Optional[str]:
        return self.get_attachment_id(obj)

    @extend_schema_field(OpenApiTypes.STR)
    def get_file_url(self, obj: Any) -> Optional[str]:
        f = getattr(obj, "file", None)
        if f is not None and hasattr(f, "url"):
            try:
                return cast(str, f.url)
            except Exception:
                return None
        storage_path = getattr(obj, "storage_path", None)
        if storage_path:
            try:
                return default_storage.url(storage_path)
            except Exception:
                return storage_path
        return None

    @extend_schema_field(OpenApiTypes.INT)
    def get_size(self, obj: Any) -> Optional[int]:
        v = getattr(obj, "size", None)
        if isinstance(v, int):
            return v
        f = getattr(obj, "file", None)
        if f is not None:
            s = getattr(f, "size", None)
            if isinstance(s, int):
                return s
        try:
            return int(v) if v is not None else None
        except Exception:
            return None


class DocumentWorkflowLogSerializer(serializers.ModelSerializer):
    actor = CompactUserSerializer(source="acted_by", read_only=True)
    meta = serializers.JSONField(source="meta_json", read_only=True)
    from_status = serializers.SerializerMethodField()
    to_status = serializers.SerializerMethodField()

    class Meta:
        model = DocumentWorkflowLog
        fields = (
            "log_id",
            "action",
            "comment",
            "meta",
            "from_status",
            "to_status",
            "actor",
            "acted_at",
        )
        read_only_fields = fields

    def _status_tiny(self, obj: Any) -> Optional[Dict[str, Any]]:
        if obj is None:
            return None
        return {
            "id": getattr(obj, "id", None),
            "name": getattr(obj, "name", None) or getattr(obj, "code", None),
        }

    @extend_schema_field(OpenApiTypes.OBJECT)
    def get_from_status(self, instance: Any) -> Optional[Dict[str, Any]]:
        return self._status_tiny(getattr(instance, "from_status", None))

    @extend_schema_field(OpenApiTypes.OBJECT)
    def get_to_status(self, instance: Any) -> Optional[Dict[str, Any]]:
        return self._status_tiny(getattr(instance, "to_status", None))


class DocumentDetailSerializer(DocumentSlimSerializer):
    """
    Mở rộng từ Slim: thêm mô tả, nội dung, tham chiếu, logs.
    Tất cả READ-ONLY (ghi/chuyển trạng thái phải qua Action Serializer + Service).
    """
    summary = TrimmedCharField(required=False, allow_blank=True)
    content = TrimmedCharField(required=False, allow_blank=True)
    sender = TrimmedCharField(required=False, allow_blank=True, allow_null=True)
    recipient = TrimmedCharField(required=False, allow_blank=True, allow_null=True)

    assignees = serializers.SerializerMethodField()
    approvals = serializers.SerializerMethodField()  # nếu có bảng approvals
    attachments = serializers.SerializerMethodField()
    logs = serializers.SerializerMethodField()

    class Meta(DocumentSlimSerializer.Meta):
        model = Document
        fields = DocumentSlimSerializer.Meta.fields + (
            "summary",
            "content",
            "sender",
            "recipient",
            "assignees",
            "approvals",
            "attachments",
            "logs",
        )
        read_only_fields = fields

    @extend_schema_field(serializers.ListField(child=serializers.JSONField()))
    def get_assignees(self, obj: Any) -> List[Dict[str, Any]]:
        rel = getattr(obj, "assignees", None)
        if rel is None:
            return []
        all_fn: Optional[Callable[[], Any]] = getattr(rel, "all", None)  # type: ignore[attr-defined]
        if callable(all_fn):
            try:
                items = all_fn()
                iterable_items = cast(Iterable[Any], items) if not isinstance(items, list) else items
                data = CompactUserSerializer(iterable_items, many=True).data
                return _to_plain_list_of_dicts(data)
            except Exception:
                return []
        return []

    @extend_schema_field(serializers.ListField(child=serializers.JSONField()))
    def get_approvals(self, obj: Any) -> List[Dict[str, Any]]:
        rel = getattr(obj, "approvals", None)
        if rel is None:
            return []
        all_fn: Optional[Callable[[], Any]] = getattr(rel, "all", None)  # type: ignore[attr-defined]
        if not callable(all_fn):
            return []
        try:
            items = all_fn()
            iterable_items: Iterable[Any]
            if isinstance(items, list):
                iterable_items = items
            else:
                iterable_items = cast(Iterable[Any], items)
            out: List[Dict[str, Any]] = []
            for ap in iterable_items:
                out.append(
                    {
                        "id": getattr(ap, "id", None),
                        "step": getattr(ap, "step", None),
                        "status": getattr(ap, "status", None),
                        "actor": _to_plain_dict(CompactUserSerializer(getattr(ap, "actor", None)).data),
                    }
                )
            return out
        except Exception:
            return []

    @extend_schema_field(serializers.ListField(child=serializers.JSONField()))
    def get_attachments(self, obj: Any) -> List[Dict[str, Any]]:
        rel = getattr(obj, "attachments", None)
        all_fn: Optional[Callable[[], Any]] = getattr(rel, "all", None) if rel is not None else None  # type: ignore[attr-defined]
        try:
            if callable(all_fn):
                items = all_fn()
                iterable_items = items if isinstance(items, list) else cast(Iterable[DocumentAttachment], items)
                data = DocumentAttachmentSerializer(iterable_items, many=True).data
                return _to_plain_list_of_dicts(data)
            qs = DocumentAttachment.objects.filter(document_id=getattr(obj, "pk", None))
            data = DocumentAttachmentSerializer(qs, many=True).data
            return _to_plain_list_of_dicts(data)
        except Exception:
            return []

    @extend_schema_field(serializers.ListField(child=serializers.JSONField()))
    def get_logs(self, obj: Any) -> List[Dict[str, Any]]:
        rel = getattr(obj, "workflow_logs", None)
        all_fn: Optional[Callable[[], Any]] = getattr(rel, "all", None) if rel is not None else None  # type: ignore[attr-defined]
        try:
            if callable(all_fn):
                items = all_fn()
                if isinstance(items, QuerySet):
                    ordered = items.order_by("-acted_at")
                    data = DocumentWorkflowLogSerializer(ordered, many=True).data
                    return _to_plain_list_of_dicts(data)
                else:
                    seq = list(cast(Iterable[Any], items))
                    ordered_list = sorted(seq, key=lambda x: getattr(x, "acted_at", None) or getattr(x, "created_at", None) or datetime.min, reverse=True)
                    data = DocumentWorkflowLogSerializer(ordered_list, many=True).data
                    return _to_plain_list_of_dicts(data)
            qs = DocumentWorkflowLog.objects.filter(document_id=getattr(obj, "pk", None)).order_by("-acted_at")
            data = DocumentWorkflowLogSerializer(qs, many=True).data
            return _to_plain_list_of_dicts(data)
        except Exception:
            return []

    def validate(self, attrs: Dict[str, Any]) -> Dict[str, Any]:
        instance_dir = getattr(self.instance, "doc_direction", None) if self.instance else None
        if instance_dir is None and self.instance is not None:
            instance_dir = getattr(self.instance, "direction", None)
        direction = attrs.get("doc_direction") or instance_dir
        direction = getattr(direction, "value", direction)
        direction = str(direction or "").lower()
        raw = getattr(self, "initial_data", None)
        if raw is None:
            raw = attrs
        if direction == Document.Direction.DI and raw.get("incoming_number") is not None:
            raise serializers.ValidationError({"incoming_number": ["CAN_NOT_SET_FOR_OUTBOUND"]})
        if direction == Document.Direction.DEN and raw.get("outgoing_number") is not None:
            raise serializers.ValidationError({"outgoing_number": ["CAN_NOT_SET_FOR_INBOUND"]})
        return attrs


class DocumentUpsertSerializer(serializers.ModelSerializer):
    field_id = serializers.PrimaryKeyRelatedField(
        queryset=Field.objects.all(), source="field", required=False, allow_null=True
    )
    document_type_id = serializers.PrimaryKeyRelatedField(
        queryset=DocumentType.objects.all(),
        source="document_type",
        required=False,
        allow_null=True,
    )
    urgency_level_id = serializers.PrimaryKeyRelatedField(
        queryset=UrgencyLevel.objects.all(),
        source="urgency_level",
        required=False,
        allow_null=True,
    )
    security_level_id = serializers.PrimaryKeyRelatedField(
        queryset=SecurityLevel.objects.all(),
        source="security_level",
        required=False,
        allow_null=True,
    )
    issue_level_id = serializers.PrimaryKeyRelatedField(
        queryset=IssueLevel.objects.all(),
        source="issue_level",
        required=False,
        allow_null=True,
    )
    department_id = serializers.PrimaryKeyRelatedField(
        queryset=Department.objects.all(),
        source="department",
        required=False,
        allow_null=True,
    )
    status_id = serializers.PrimaryKeyRelatedField(
        queryset=DocumentStatus.objects.all(),
        source="status",
        required=False,
        allow_null=True,
    )

    class Meta:
        model = Document
        fields = (
            "document_id",
            "doc_direction",
            "document_code",
            "issue_number",
            "title",
            "field_id",
            "document_type_id",
            "urgency_level_id",
            "security_level_id",
            "issue_level_id",
            "is_legal_doc",
            "signing_method",
            "signer_position",
            "issued_date",
            "received_number",
            "received_date",
            "sender",
            "department_id",
            "status_id",
        )
        read_only_fields = ("document_id",)

    def validate(self, attrs: Dict[str, Any]) -> Dict[str, Any]:
        instance = getattr(self, "instance", None)
        direction = attrs.get(
            "doc_direction",
            getattr(instance, "doc_direction", None),
        )
        if not direction:
            raise serializers.ValidationError({"doc_direction": "Bắt buộc chọn hướng văn bản."})

        def _ensure(field: str, message: str):
            if attrs.get(field) is None and not (instance and getattr(instance, field, None)):
                raise serializers.ValidationError({field: message})

        if direction == Document.Direction.DI:
            _ensure("issue_number", "Văn bản đi phải có số đi.")
            _ensure("issued_date", "Văn bản đi phải có ngày phát hành.")
            issued_date = attrs.get("issued_date") or getattr(instance, "issued_date", None)
            if issued_date:
                attrs["issue_year"] = issued_date.year
        elif direction == Document.Direction.DEN:
            _ensure("received_number", "Văn bản đến phải có số đến.")
            _ensure("received_date", "Văn bản đến phải có ngày đến.")
            _ensure("sender", "Văn bản đến phải có nơi gửi.")
        elif direction == Document.Direction.DU_THAO:
            _ensure("document_code", "Dự thảo phải có mã hồ sơ.")
            attrs["issue_year"] = None
        else:
            attrs["issue_year"] = None

        if instance and "doc_direction" in attrs and attrs["doc_direction"] != instance.doc_direction:
            raise serializers.ValidationError({"doc_direction": "Không thể đổi hướng văn bản hiện có."})

        return attrs


class DocumentAssignmentSerializer(serializers.ModelSerializer):
    user = CompactUserSerializer(read_only=True)
    assigned_by = CompactUserSerializer(read_only=True)

    class Meta:
        model = DocumentAssignment
        fields = (
            "id",
            "role_on_doc",
            "due_at",
            "assigned_at",
            "is_owner",
            "user",
            "assigned_by",
        )
        read_only_fields = fields


class _AssignmentItemSerializer(serializers.Serializer):
    user_id = serializers.UUIDField(format="hex")
    role = serializers.ChoiceField(choices=DocumentAssignment.RoleOnDoc.choices)
    due_at = serializers.DateTimeField(required=False, allow_null=True)
    is_owner = serializers.BooleanField(required=False, default=False)


class DocumentAssignmentUpsertSerializer(serializers.Serializer):
    assignments = _AssignmentItemSerializer(many=True, allow_empty=True)

    def validate_assignments(self, value):
        seen = set()
        for item in value:
            uid = item["user_id"]
            if uid in seen:
                raise serializers.ValidationError("Trùng user_id trong danh sách.")
            seen.add(uid)
        return value

    def save(self, *, document: Document, assigned_by) -> List[DocumentAssignment]:
        validated = self.validated_data.get("assignments", [])
        user_pk = getattr(User._meta.pk, "attname", "id")
        user_ids = [item["user_id"] for item in validated]
        users = {
            getattr(u, user_pk): u
            for u in User.objects.filter(**{f"{user_pk}__in": user_ids})
        }
        missing = [uid for uid in user_ids if uid not in users]
        if missing:
            raise serializers.ValidationError(
                {"assignments": [f"Không tìm thấy user_id {uid}" for uid in map(str, missing)]}
            )

        DocumentAssignment.objects.filter(document=document).delete()
        rows: List[DocumentAssignment] = []
        for item in validated:
            user = users[item["user_id"]]
            rows.append(
                DocumentAssignment(
                    document=document,
                    user=user,
                    role_on_doc=item["role"],
                    due_at=item.get("due_at"),
                    is_owner=item.get("is_owner", False),
                    assigned_by=assigned_by,
                )
            )
        if rows:
            DocumentAssignment.objects.bulk_create(rows)
        return list(
            DocumentAssignment.objects.filter(document=document)
            .select_related("user", "assigned_by")
            .order_by("-assigned_at")
        )


class DocumentApprovalSerializer(serializers.ModelSerializer):
    approver = CompactUserSerializer(read_only=True)

    class Meta:
        model = DocumentApproval
        fields = (
            "approval_id",
            "step_no",
            "approver",
            "decision",
            "decided_at",
            "sign_hash",
            "sign_meta",
        )
        read_only_fields = fields


class _ApprovalItemSerializer(serializers.Serializer):
    step_no = serializers.IntegerField(min_value=1)
    approver_id = serializers.UUIDField(format="hex")


class DocumentApprovalUpsertSerializer(serializers.Serializer):
    approvals = _ApprovalItemSerializer(many=True, allow_empty=True)

    def validate_approvals(self, value):
        steps = set()
        for item in value:
            step = item["step_no"]
            if step in steps:
                raise serializers.ValidationError("Trùng step_no trong danh sách.")
            steps.add(step)
        return value

    def save(self, *, document: Document) -> List[DocumentApproval]:
        validated = self.validated_data.get("approvals", [])
        user_pk = getattr(User._meta.pk, "attname", "id")
        approver_ids = [item["approver_id"] for item in validated]
        users = {
            getattr(u, user_pk): u
            for u in User.objects.filter(**{f"{user_pk}__in": approver_ids})
        }
        missing = [uid for uid in approver_ids if uid not in users]
        if missing:
            raise serializers.ValidationError(
                {"approvals": [f"Không tìm thấy approver_id {uid}" for uid in map(str, missing)]}
            )

        DocumentApproval.objects.filter(document=document).delete()
        rows: List[DocumentApproval] = []
        for item in validated:
            approver = users[item["approver_id"]]
            rows.append(
                DocumentApproval(
                    document=document,
                    step_no=item["step_no"],
                    approver=approver,
                    decision=DocumentApproval.Decision.PENDING,
                )
            )
        if rows:
            DocumentApproval.objects.bulk_create(rows)
        return list(
            DocumentApproval.objects.filter(document=document)
            .select_related("approver")
            .order_by("step_no")
        )


class DocumentApprovalDecisionSerializer(serializers.Serializer):
    decision = serializers.ChoiceField(
        choices=[
            DocumentApproval.Decision.APPROVE,
            DocumentApproval.Decision.REJECT,
        ]
    )
    note = serializers.CharField(required=False, allow_blank=True, allow_null=True)


class DocumentVersionSerializer(serializers.ModelSerializer):
    changed_by = CompactUserSerializer(read_only=True)

    class Meta:
        model = DocumentVersion
        fields = (
            "version_id",
            "version_no",
            "file_name",
            "storage_path",
            "changed_by",
            "changed_at",
        )
        read_only_fields = fields


class DocumentVersionCreateSerializer(serializers.Serializer):
    version_no = serializers.IntegerField(min_value=1)
    note = serializers.CharField(required=False, allow_blank=True, allow_null=True)


class OrganizationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organization
        fields = (
            "organization_id",
            "name",
            "address",
            "email",
            "phone",
            "tax_code",
            "is_active",
        )
        read_only_fields = ("organization_id",)


class OrgContactSerializer(serializers.ModelSerializer):
    organization_id = serializers.IntegerField(write_only=True, required=False)

    class Meta:
        model = OrgContact
        fields = (
            "contact_id",
            "organization_id",
            "full_name",
            "email",
            "phone",
            "position",
        )
        read_only_fields = ("contact_id",)


class DocumentDispatchSerializer(serializers.ModelSerializer):
    organization = OrganizationSerializer(read_only=True)
    contact = OrgContactSerializer(read_only=True)

    class Meta:
        model = DispatchOutbox
        fields = (
            "dispatch_id",
            "document_id",
            "organization",
            "contact",
            "method",
            "sent_at",
            "status",
            "tracking_no",
            "note",
        )
        read_only_fields = ("dispatch_id", "document_id", "sent_at")


class DocumentDispatchCreateSerializer(serializers.Serializer):
    organization_id = serializers.IntegerField(required=False, allow_null=True)
    contact_id = serializers.IntegerField(required=False, allow_null=True)
    method = serializers.ChoiceField(choices=DispatchOutbox.Method.choices)
    note = serializers.CharField(required=False, allow_blank=True, allow_null=True)


class DocumentDispatchUpdateSerializer(serializers.Serializer):
    status = serializers.ChoiceField(
        choices=DispatchOutbox.Status.choices, required=False
    )
    tracking_no = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    note = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    # ------------------ VALIDATION (đầu vào thô) ------------------
    def validate(self, attrs: Dict[str, Any]) -> Dict[str, Any]:
        direction = self._extract_direction()
        incoming = attrs.get("incoming_number")
        outgoing = attrs.get("outgoing_number")

        if incoming and direction == "di":
            raise serializers.ValidationError({"incoming_number": ["CAN_NOT_SET_FOR_OUTBOUND"]})
        if outgoing and direction == "den":
            raise serializers.ValidationError({"outgoing_number": ["CAN_NOT_SET_FOR_INBOUND"]})
        return attrs

    def _extract_direction(self) -> Optional[str]:
        if getattr(self, "instance", None) is not None:
            if hasattr(self.instance, "direction"):
                val = getattr(self.instance, "direction")
                return getattr(val, "value", val)
        data = getattr(self, "initial_data", None)
        if isinstance(data, Mapping):
            dd = data.get("doc_direction")
            if dd is not None:
                return str(dd)
        return None


# ==================== ACTION SERIALIZERS ====================
try:
    from workflow.services import outbound_service as _outbound_svc  # type: ignore
    outbound_svc = cast(Any, _outbound_svc)
except Exception:
    outbound_svc = cast(Any, object())


class _BaseDocumentActionSerializer(ServiceErrorToDRFMixin, serializers.Serializer):
    comment = TrimmedCharField(required=False, allow_blank=True)
    meta = serializers.DictField(required=False, default=dict)

    def _get_instance(self) -> Document:
        inst = getattr(self, "instance", None)
        if inst is None:
            raise AssertionError("Action serializer requires 'instance=Document' at initialization.")
        return cast(Document, inst)

    def _get_user(self):
        ctx = cast(Dict[str, Any], getattr(self, "context", {}) or {})
        req = cast(Optional[Request], ctx.get("request"))
        return getattr(req, "user", None)


class TouchDraftActionSerializer(_BaseDocumentActionSerializer):
    def save(self, **kwargs) -> Document:
        doc = self._get_instance()
        user = self._get_user()
        data = cast(Dict[str, Any], self.validated_data)
        try:
            result = outbound_svc.touch_draft(
                user, doc,
                comment=data.get("comment"),
                meta=data.get("meta"),
            )
            return cast(Document, result or doc)
        except Exception as e:
            self.raise_from_service(e)


class SubmitActionSerializer(_BaseDocumentActionSerializer):
    def save(self, **kwargs) -> Document:
        doc = self._get_instance()
        user = self._get_user()
        data = cast(Dict[str, Any], self.validated_data)
        try:
            result = outbound_svc.submit(
                user, doc,
                comment=data.get("comment"),
                meta=data.get("meta"),
            )
            return cast(Document, result or doc)
        except Exception as e:
            self.raise_from_service(e)


class ReturnForFixActionSerializer(_BaseDocumentActionSerializer):
    comment = TrimmedCharField(required=True, allow_blank=False)

    def save(self, **kwargs) -> Document:
        doc = self._get_instance()
        user = self._get_user()
        data = cast(Dict[str, Any], self.validated_data)
        try:
            result = outbound_svc.return_for_fix(
                user, doc,
                comment=data.get("comment"),
                meta=data.get("meta"),
            )
            return cast(Document, result or doc)
        except Exception as e:
            self.raise_from_service(e)


class ApproveActionSerializer(_BaseDocumentActionSerializer):
    def save(self, **kwargs) -> Document:
        doc = self._get_instance()
        user = self._get_user()
        data = cast(Dict[str, Any], self.validated_data)
        try:
            result = outbound_svc.approve(
                user, doc,
                comment=data.get("comment"),
                meta=data.get("meta"),
            )
            return cast(Document, result or doc)
        except Exception as e:
            self.raise_from_service(e)


class SignActionSerializer(_BaseDocumentActionSerializer):
    SIGNING_METHOD_CHOICES = ("digital", "wet", "stamp")
    signing_method = serializers.ChoiceField(choices=SIGNING_METHOD_CHOICES, required=True)

    def save(self, **kwargs) -> Document:
        doc = self._get_instance()
        user = self._get_user()
        data = cast(Dict[str, Any], self.validated_data)
        try:
            result = outbound_svc.sign(
                user, doc,
                signing_method=data.get("signing_method"),
                comment=data.get("comment"),
                meta=data.get("meta"),
            )
            return cast(Document, result or doc)
        except Exception as e:
            self.raise_from_service(e)


class PublishActionSerializer(_BaseDocumentActionSerializer):
    SERVICE_CODE_FIELD_MAP: Dict[str, str] = {}
    SERVICE_CODE_FIELD_MAP.update(getattr(_BaseDocumentActionSerializer, "SERVICE_CODE_FIELD_MAP", {}))
    SERVICE_CODE_FIELD_MAP.update({"DUPLICATE_ISSUE_NUMBER": "issue_number"})

    issue_number = TrimmedCharField(required=False, allow_blank=True, allow_null=True)
    issued_date = serializers.DateField(required=False, allow_null=True)
    channels = serializers.ListField(child=TrimmedCharField(), required=False, allow_empty=True)
    prefix = TrimmedCharField(required=False, allow_blank=True, allow_null=True)
    postfix = TrimmedCharField(required=False, allow_blank=True, allow_null=True)
    year = serializers.IntegerField(required=False, allow_null=True, min_value=1900)

    def validate_issue_number(self, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        vv = v.strip()
        return vv or None

    def save(self, **kwargs) -> Document:
        doc = self._get_instance()
        user = self._get_user()
        data = cast(Dict[str, Any], self.validated_data)
        try:
            result = outbound_svc.publish(
                user, doc,
                issue_number=data.get("issue_number"),
                issued_date=data.get("issued_date"),
                channels=data.get("channels"),
                prefix=data.get("prefix"),
                postfix=data.get("postfix"),
                year=data.get("year"),
                comment=data.get("comment"),
                meta=data.get("meta"),
            )
            if isinstance(result, tuple) and len(result) == 2:
                doc_result, numbering = result
            else:
                doc_result = result
                numbering = None
            return {"document": doc_result or doc, "numbering": numbering}
        except Exception as e:
            self.raise_from_service(e)


class WithdrawPublishActionSerializer(_BaseDocumentActionSerializer):
    def save(self, **kwargs) -> Document:
        doc = self._get_instance()
        user = self._get_user()
        data = cast(Dict[str, Any], self.validated_data)
        try:
            result = outbound_svc.withdraw_publish(
                user, doc,
                comment=data.get("comment"),
                meta=data.get("meta"),
            )
            return cast(Document, result or doc)
        except Exception as e:
            self.raise_from_service(e)


class ArchiveActionSerializer(_BaseDocumentActionSerializer):
    def save(self, **kwargs) -> Document:
        doc = self._get_instance()
        user = self._get_user()
        data = cast(Dict[str, Any], self.validated_data)
        try:
            result = outbound_svc.archive(
                user, doc,
                comment=data.get("comment"),
                meta=data.get("meta"),
            )
            return cast(Document, result or doc)
        except Exception as e:
            self.raise_from_service(e)


# ==== OpenAPI schema-only serializers (shared across views) ====
from rest_framework import serializers as drf_serializers  # alias để phân biệt, vẫn dùng được song song


class APIErrorSerializer(drf_serializers.Serializer):
    detail = drf_serializers.CharField()
    extra = drf_serializers.JSONField(required=False)


class StatusOnlyResponseSerializer(drf_serializers.Serializer):
    status_id = drf_serializers.IntegerField()


class DraftInitResponseSerializer(StatusOnlyResponseSerializer):
    doc_direction = drf_serializers.CharField(allow_null=True, required=False)


class PublishResponseSerializer(StatusOnlyResponseSerializer):
    issue_number = drf_serializers.CharField(allow_null=True, required=False)
    issued_date = drf_serializers.DateField(allow_null=True, required=False)


class RegisterImportSerializer(drf_serializers.Serializer):
    register_id = drf_serializers.IntegerField(required=True, min_value=1)
    items = drf_serializers.ListField(
        child=drf_serializers.DictField(), required=False, allow_empty=True
    )
    file = drf_serializers.FileField(required=False, allow_empty_file=False)


class RegisterImportResponseSerializer(drf_serializers.Serializer):
    accepted = drf_serializers.IntegerField()
    skipped = drf_serializers.IntegerField()
    job_id = drf_serializers.CharField(required=False, allow_null=True)


class RegisterExportQuerySerializer(drf_serializers.Serializer):
    register_id = drf_serializers.IntegerField(required=False, min_value=1)
    year = drf_serializers.IntegerField(required=False, min_value=2000)
    direction = drf_serializers.CharField(required=False, allow_blank=True)


class RegisterExportResponseSerializer(drf_serializers.Serializer):
    download_url = drf_serializers.CharField()
    total_rows = drf_serializers.IntegerField(required=False)


class DocumentImportSerializer(drf_serializers.Serializer):
    direction = drf_serializers.CharField(required=False, allow_blank=True)
    items = drf_serializers.ListField(
        child=drf_serializers.DictField(), required=False, allow_empty=True
    )
    file = drf_serializers.FileField(required=False, allow_empty_file=False)


class DocumentImportResponseSerializer(drf_serializers.Serializer):
    accepted = drf_serializers.IntegerField()
    skipped = drf_serializers.IntegerField()
    job_id = drf_serializers.CharField(required=False, allow_null=True)


class DocumentExportQuerySerializer(drf_serializers.Serializer):
    direction = drf_serializers.CharField(required=False, allow_blank=True)
    status = drf_serializers.CharField(required=False, allow_blank=True)
    level = drf_serializers.CharField(required=False, allow_blank=True)
    keyword = drf_serializers.CharField(required=False, allow_blank=True)
    page_size = drf_serializers.IntegerField(required=False, min_value=1, max_value=2000)
    ordering = drf_serializers.CharField(required=False, allow_blank=True)


class DocumentExportResponseSerializer(drf_serializers.Serializer):
    download_url = drf_serializers.CharField()
    total_rows = drf_serializers.IntegerField(required=False)


# ------- Inbound action request payloads (schema-only) --------
class ReceiveInboundActionSerializer(drf_serializers.Serializer):
    note = drf_serializers.CharField(required=False, allow_blank=True)


class RegisterInboundActionSerializer(drf_serializers.Serializer):
    received_number = drf_serializers.IntegerField()
    received_date = drf_serializers.DateField()
    sender = drf_serializers.CharField()


class AssignInboundActionSerializer(drf_serializers.Serializer):
    assignees = drf_serializers.ListField(
        child=drf_serializers.IntegerField(min_value=1),
        required=True,
        allow_empty=False,
        help_text="Danh sách user_id được phân công",
    )
    due_at = drf_serializers.DateTimeField(required=False, allow_null=True)
    instruction = drf_serializers.CharField(required=False, allow_blank=True, allow_null=True)


class StartInboundActionSerializer(drf_serializers.Serializer):
    pass


class CompleteInboundActionSerializer(drf_serializers.Serializer):
    note = drf_serializers.CharField(required=False, allow_blank=True)


class ArchiveInboundActionSerializer(drf_serializers.Serializer):
    reason = drf_serializers.CharField(required=False, allow_blank=True, allow_null=True)


class WithdrawInboundActionSerializer(drf_serializers.Serializer):
    reason = drf_serializers.CharField(required=False, allow_blank=True, allow_null=True)


class DocumentSerializer(DocumentDetailSerializer):
    """
    Bridge serializer để tương thích với views_outbound.py.
    Kế thừa DocumentDetailSerializer để trả full-detail cho cả list & retrieve.
    """
    pass
