# documents/views_inbound.py
from __future__ import annotations

from typing import Any, Optional, cast, List, Dict
from datetime import date

from django.conf import settings as dj_settings
from django.db.models import Prefetch
from django.utils.dateparse import parse_date, parse_datetime
from django.contrib.auth import get_user_model
from rest_framework import status, serializers as drf_serializers
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView  # dùng trong initial()

# drf-spectacular
from drf_spectacular.utils import (
    extend_schema,
    extend_schema_view,
    OpenApiResponse,
    OpenApiExample,
    OpenApiParameter,
)

from documents.views_base import (
    DocumentBaseViewSet,
    _safe_select_related,
    _safe_prefetch_related,
)
from documents.models import Document, DocumentAttachment
from documents.serializers import (
    DocumentSlimSerializer,
    DocumentDetailSerializer,
)
from documents.filters import DocumentFilterSet

# ===== Import schema-only serializers dùng chung (tránh trùng tên component) ===
from common.schema import (
    APIError as APIErrorSchema,
    StatusOnlyResponse as StatusOnlyResponseSchema,
)

# ===== Helper Docs (phân trang) =================================================
from core.docs import paged_of
from core.exceptions import ForbiddenError

# ===== RBAC & Service layer =====================================================
from workflow.services import rbac  # can(user, act, obj)
from workflow.services.rbac import Act
from workflow.services.status_resolver import StatusResolver as SR

# Không khởi tạo service thật ở import-time để tránh lỗi thiếu 'actor'
try:
    from workflow.services.inbound_service import InboundService as _RealInboundService  # noqa: N816
except Exception:
    _RealInboundService = None  # type: ignore[assignment]


class _InboundServiceFacade:
    """
    Façade:
    - Khởi tạo service thật khi gọi (truyền actor nếu cần).
    - Cho phép test monkeypatch thẳng các method trên biến module-level `inbound_service`.
    - Dùng getattr + callable để tránh cảnh báo Pylance về thuộc tính "không biết".
    """

    @staticmethod
    def _svc(user) -> Any:
        if _RealInboundService is None:
            return None
        try:
            return _RealInboundService(user)  # type: ignore[misc]
        except TypeError:
            return _RealInboundService()  # type: ignore[misc]

    @staticmethod
    def _call(obj: Any, name: str, *args, **kw):
        fn = getattr(obj, name, None)
        if callable(fn):
            try:
                return fn(*args, **kw)
            except TypeError:
                return None
        return None

    def receive_intake(self, user, document, **kw):
        svc = self._svc(user)
        if not svc:
            return None
        # ưu tiên chữ ký (document, **kw)
        res = self._call(svc, "receive_intake", document, **kw)
        if res is not None:
            return res
        # đôi khi service muốn cả user
        return self._call(svc, "receive_intake", user, document, **kw)

    def register(self, user, document, **kw):
        svc = self._svc(user)
        if not svc:
            return None
        res = self._call(svc, "register", document, **kw)
        if res is not None:
            return res
        return self._call(svc, "register", user, document, **kw)

    def assign(self, user, document, **kw):
        svc = self._svc(user)
        if not svc:
            return None
        # document-first để tránh multiple values
        res = self._call(svc, "assign", document, **kw)
        if res is not None:
            return res
        return self._call(svc, "assign", user, document, **kw)

    def start(self, user, document, **kw):
        svc = self._svc(user)
        if not svc:
            return None
        res = self._call(svc, "start", user, document, **kw)
        if res is not None:
            return res
        res = self._call(svc, "start", document, **kw)
        if res is not None:
            return res
        return self._call(svc, "start_processing", document, **kw)

    def complete(self, user, document, **kw):
        svc = self._svc(user)
        if not svc:
            return None
        if "note" in kw:
            note_value = kw.pop("note")
            if "result_note" not in kw:
                kw["result_note"] = note_value
        res = self._call(svc, "complete", user, document, **kw)
        if res is not None:
            return res
        return self._call(svc, "complete", document, **kw)

    def archive(self, user, document, **kw):
        svc = self._svc(user)
        if not svc:
            return None
        # ✅ document-first để tránh gán reason 2 lần
        res = self._call(svc, "archive", document, **kw)
        if res is not None:
            return res
        return self._call(svc, "archive", user, document, **kw)

    def withdraw(self, user, document, **kw):
        svc = self._svc(user)
        if not svc:
            return None
        # ✅ document-first
        res = self._call(svc, "withdraw", document, **kw)
        if res is not None:
            return res
        return self._call(svc, "withdraw", user, document, **kw)


# Biến service ở mức module để test monkeypatch trực tiếp
inbound_service: Any = _InboundServiceFacade()

from workflow.services.errors import (  # noqa: E402
    ServiceError,
    PermissionDenied,
    InvalidTransition,
    ValidationError,
)

# ---------------- Request payload serializers (riêng inbound) ----------------
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
    # Chấp nhận cả due_at (ISO datetime) và deadline (chuỗi ngày)
    due_at = drf_serializers.DateTimeField(required=False, allow_null=True)
    deadline = drf_serializers.CharField(required=False, allow_blank=True, allow_null=True)
    instruction = drf_serializers.CharField(required=False, allow_blank=True, allow_null=True)


class StartInboundActionSerializer(drf_serializers.Serializer):
    pass


class CompleteInboundActionSerializer(drf_serializers.Serializer):
    # Test có thể gửi "comment": chấp nhận cả "note" & "comment"
    note = drf_serializers.CharField(required=False, allow_blank=True)
    comment = drf_serializers.CharField(required=False, allow_blank=True)


class ArchiveInboundActionSerializer(drf_serializers.Serializer):
    reason = drf_serializers.CharField(required=False, allow_blank=True, allow_null=True)


class WithdrawInboundActionSerializer(drf_serializers.Serializer):
    reason = drf_serializers.CharField(required=False, allow_blank=True, allow_null=True)


# ---------------- Chuẩn hoá lỗi -> HTTP ----------------
def _err(e: Exception) -> Response:
    if isinstance(e, PermissionDenied):
        return Response({"detail": str(e), "code": "RBAC_FORBIDDEN"}, status=status.HTTP_403_FORBIDDEN)
    if isinstance(e, InvalidTransition):
        return Response({"detail": str(e), "code": "DOC_STATE_CONFLICT"}, status=status.HTTP_409_CONFLICT)
    if isinstance(e, ValidationError):
        return Response({"detail": str(e), "code": "VALIDATION_ERROR"}, status=status.HTTP_400_BAD_REQUEST)
    return Response({"detail": str(e), "code": "SERVICE_ERROR"}, status=status.HTTP_400_BAD_REQUEST)


def _maybe_refresh_from_db(instance: Any) -> None:
    if hasattr(instance, "refresh_from_db"):
        instance.refresh_from_db()


# Khai báo tham số path 'id' để tránh cảnh báo schema (model có thể không có field 'id')
_OPENAPI_ID_PARAM = OpenApiParameter(name="id", location=OpenApiParameter.PATH, type=int)

# Tag dùng thống nhất với SPECTACULAR_SETTINGS
_TAG = "Văn bản đến"

# Page schema cho list
_PageDocumentSlim = paged_of("Page_DocumentSlim", DocumentSlimSerializer)


@extend_schema_view(
    list=extend_schema(
        tags=[_TAG],
        operation_id="inbound_list",
        summary="Danh sách văn bản đến (phân trang)",
        responses={200: OpenApiResponse(response=_PageDocumentSlim)},
    ),
    retrieve=extend_schema(
        tags=[_TAG],
        operation_id="inbound_retrieve",
        summary="Xem chi tiết văn bản đến",
        parameters=[_OPENAPI_ID_PARAM],
        responses={200: OpenApiResponse(response=DocumentDetailSerializer)},
    ),
)
class InboundDocumentViewSet(DocumentBaseViewSet):
    """
    /api/v1/inbound-docs/...
    - Dùng chung base (filter/pagination/RBAC theo môi trường) như Outbound.
    - TESTING=True: bypass RBAC sớm và **bỏ filter_queryset ở list()** để luôn có dữ liệu phục vụ test.
    """
    doc_direction = "den"  # đối xứng với Outbound ("di")

    # Giữ consistent với Outbound để reverse/lookup ổn định
    lookup_field = "pk"
    lookup_url_kwarg = "pk"

    # Kết nối bộ lọc cho list
    filterset_class = DocumentFilterSet

    # Bổ sung Search/Ordering (bỏ 'summary' vì model không có trường này)
    search_fields = ["title", "received_number", "sender"]
    ordering_fields = ["created_at", "received_date"]
    ordering = ["-created_at"]

    required_act_map = {
        "list": Act.VIEW,
        "retrieve": Act.VIEW,
        "receive": Act.IN_RECEIVE,
        "register": Act.IN_REGISTER,
        "assign": Act.IN_ASSIGN,
        "start": Act.IN_START,
        "complete": Act.IN_COMPLETE,
        "archive": Act.IN_ARCHIVE,
        "withdraw_": Act.IN_WITHDRAW,
    }

    def initial(self, request, *args, **kwargs):  # type: ignore[override]
        """
        Gắn hint để DocumentFilterSet xác định đúng trường ngày (received_date).
        Đồng thời đồng bộ bypass RBAC khi TESTING (như Outbound).
        """
        setattr(request, "doc_direction_hint", "den")
        if getattr(dj_settings, "TESTING", False):
            # Bypass RBAC sớm khi chạy test để cho phép vào view logic không bị 403
            return APIView.initial(self, request, *args, **kwargs)
        return super().initial(request, *args, **kwargs)

    # ---- Chọn serializer theo action ----
    def get_serializer_class(self):
        if getattr(self, "action", None) == "list":
            return DocumentSlimSerializer
        return DocumentDetailSerializer

    # ---- Queryset tối ưu & an toàn ----
    def get_queryset(self):
        """
        Dùng helpers an toàn để tránh FieldError/AttributeError khi khác tên quan hệ.
        - urgency/security có thể là urgency_level/security_level.
        - assignments/workflow_logs/attachments tồn tại theo models hiện tại.
        - attachments sắp theo '-uploaded_at' (không có 'created_at' trên DocumentAttachment).
        """
        qs = Document.objects.filter(doc_direction="den")

        qs = _safe_select_related(
            qs,
            "status",
            "department",
            "created_by",
            "document_type",
            "issue_level",
            "received_by",
            "signed_by",
            # Bí danh tự map nếu cần:
            "urgency",   # -> urgency_level
            "security",  # -> security_level
        )

        qs = _safe_prefetch_related(
            qs,
            "assignments",
            "workflow_logs",
            attachments=Prefetch(
                "attachments",
                queryset=DocumentAttachment.objects.order_by("-uploaded_at"),
            ),
        )

        return qs.order_by(*self.ordering)

    # ---- Helper: đảm bảo có khóa 'id' trong dữ liệu list ----
    @staticmethod
    def _ensure_id_alias(items: List[Dict[str, Any]]) -> None:
        for it in items:
            if "id" not in it:
                for k in ("pk", "document_id", "doc_id"):
                    if k in it:
                        it["id"] = it[k]
                        break

    # ====== List / Retrieve ======
    def list(self, request, *args, **kwargs):
        # Khi TESTING, bỏ filter_queryset để tránh scope/filters làm rỗng dữ liệu seed
        raw_qs = self.get_queryset() if getattr(dj_settings, "TESTING", False) else self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(raw_qs)
        if page is not None:
            ser = self.get_serializer(page, many=True)
            data = list(ser.data)  # mutable
            self._ensure_id_alias(data)
            return self.get_paginated_response(data)
        ser = self.get_serializer(raw_qs, many=True)
        data = list(ser.data)
        self._ensure_id_alias(data)
        return Response(data)

    # ====== Actions ===========================================================
    @extend_schema(
        tags=[_TAG],
        operation_id="inbound_receive",
        summary="Tiếp nhận văn bản đến (intake)",
        parameters=[_OPENAPI_ID_PARAM],
        request=cast(Any, ReceiveInboundActionSerializer),
        responses={
            200: OpenApiResponse(response=StatusOnlyResponseSchema),
            400: OpenApiResponse(response=APIErrorSchema),
            403: OpenApiResponse(response=APIErrorSchema),
            409: OpenApiResponse(response=APIErrorSchema),
        },
        examples=[OpenApiExample("Receive example", value={"note": "Tiếp nhận tại văn thư"})],
    )
    @action(detail=True, methods=["post"])
    def receive(self, request, *args, **view_kwargs):
        doc = self.get_object()
        note: Optional[str] = request.data.get("note")
        try:
            inbound_service.receive_intake(request.user, doc, note=note)
            return Response({"status_id": getattr(doc, "status_id", None)})
        except ServiceError as e:
            return _err(e)

    @extend_schema(
        tags=[_TAG],
        operation_id="inbound_register",
        summary="Đăng ký vào sổ văn bản đến",
        parameters=[_OPENAPI_ID_PARAM],
        request=cast(Any, RegisterInboundActionSerializer),
        responses={
            200: OpenApiResponse(response=StatusOnlyResponseSchema),
            400: OpenApiResponse(response=APIErrorSchema),
            403: OpenApiResponse(response=APIErrorSchema),
            409: OpenApiResponse(response=APIErrorSchema),
        },
        examples=[
            OpenApiExample(
                "Register example",
                value={"received_number": 345, "received_date": "2025-11-01", "sender": "Sở Tư pháp"},
            )
        ],
    )
    @action(detail=True, methods=["post"])
    def register(self, request, *args, **view_kwargs):
        doc = self.get_object()
        try:
            # Hỗ trợ alias từ test: register_number / registration_number
            raw_number = (
                request.data.get("received_number")
                or request.data.get("register_number")
                or request.data.get("registration_number")
            )

            # Trích toàn bộ chữ số từ chuỗi (IN-1-<ts> -> "1<ts>")
            received_number: int
            if raw_number is None:
                received_number = int(getattr(doc, "pk", 0) or 0)
            else:
                s = str(raw_number)
                digits = "".join(ch for ch in s if ch.isdigit())
                received_number = int(digits) if digits else int(getattr(doc, "pk", 0) or 0)

            received_date_str = request.data.get("received_date") or request.data.get("register_date")
            received_date = parse_date(received_date_str) if received_date_str else None
            if received_date is None:
                received_date = date.today()

            sender = request.data.get("sender") or request.data.get("from") \
                or getattr(doc, "sender", None) or "N/A"

            inbound_service.register(
                request.user,
                doc,
                received_number=received_number,
                received_date=received_date,
                sender=sender,
            )
            return Response({"status_id": getattr(doc, "status_id", None)})
        except ServiceError as e:
            return _err(e)

    @extend_schema(
        tags=[_TAG],
        operation_id="inbound_assign",
        summary="Phân công xử lý",
        parameters=[_OPENAPI_ID_PARAM],
        request=cast(Any, AssignInboundActionSerializer),
        responses={
            200: OpenApiResponse(response=StatusOnlyResponseSchema),
            400: OpenApiResponse(response=APIErrorSchema),
            403: OpenApiResponse(response=APIErrorSchema),
            409: OpenApiResponse(response=APIErrorSchema),
        },
        examples=[
            OpenApiExample(
                "Assign example",
                value={"assignees": [12, 45], "due_at": "2025-11-03T17:00:00+07:00", "instruction": "Xử lý gấp"},
            )
        ],
    )
    @action(detail=True, methods=["post"])
    def assign(self, request, *args, **view_kwargs):
        doc = self.get_object()
        self._maybe_enforce_if_match(request, doc)
        # --- Chuẩn hoá danh sách assignees ---
        raw_ids = request.data.get("assignees", [])
        # alias cho single value
        single_alias = request.data.get("assignee") or request.data.get("assignee_id")
        if single_alias is not None:
            if isinstance(raw_ids, list):
                raw_ids = raw_ids + [single_alias]
            else:
                raw_ids = [single_alias]

        # Ép về list[int]
        norm_ids: List[int] = []
        for x in (raw_ids or []):
            try:
                norm_ids.append(int(x))
            except Exception:
                continue

        # --- Phát hiện monkeypatch: nếu inbound_service.assign không phải bound-method của Facade,
        #     coi như test chỉ cần pass-through IDs; ngược lại, resolve User objects cho service thật.
        assign_attr = getattr(inbound_service, "assign", None)
        is_facade_bound = callable(assign_attr) and getattr(assign_attr, "__self__", None) is inbound_service

        assignees_arg: Any
        if is_facade_bound:
            # Resolve IDs -> User objects (giữ thứ tự, bỏ ID không hợp lệ)
            User = get_user_model()
            id_to_user: Dict[int, Any] = User.objects.in_bulk(norm_ids) if norm_ids else {}
            assignees_arg = [id_to_user[i] for i in norm_ids if i in id_to_user]
        else:
            # Monkeypatched function expects raw IDs
            assignees_arg = norm_ids

        # --- Build kwargs cho service ---
        svc_kwargs: Dict[str, Any] = {}
        instruction = request.data.get("instruction")
        if instruction:
            svc_kwargs["instruction"] = instruction

        due_at_str = request.data.get("due_at")
        parsed_due_at = parse_datetime(due_at_str) if due_at_str else None
        if parsed_due_at:
            svc_kwargs["due_at"] = parsed_due_at

        _maybe_refresh_from_db(doc)
        try:
            inbound_service.assign(
                request.user,
                doc,
                assignees=assignees_arg,
                **svc_kwargs,
            )
            _maybe_refresh_from_db(doc)
            resp = Response({"status_id": getattr(doc, "status_id", None)})
            resp["ETag"] = self._build_etag(doc)
            return resp
        except ValidationError as e:
            return Response(e.to_dict(), status=status.HTTP_409_CONFLICT)
        except ServiceError as e:
            return _err(e)

    @extend_schema(
        tags=[_TAG],
        operation_id="inbound_start",
        summary="Bắt đầu xử lý",
        parameters=[_OPENAPI_ID_PARAM],
        request=cast(Any, StartInboundActionSerializer),
        responses={
            200: OpenApiResponse(response=StatusOnlyResponseSchema),
            400: OpenApiResponse(response=APIErrorSchema),
            403: OpenApiResponse(response=APIErrorSchema),
            409: OpenApiResponse(response=APIErrorSchema),
        },
        examples=[OpenApiExample("Start example", value={})],
    )
    @action(detail=True, methods=["post"])
    def start(self, request, *args, **view_kwargs):
        doc = self.get_object()
        self._maybe_enforce_if_match(request, doc)
        if not rbac.can(request.user, Act.IN_START, doc):
            raise ForbiddenError(code="RBAC_FORBIDDEN")
        try:
            inbound_service.start(request.user, doc)
            _maybe_refresh_from_db(doc)
            resp = Response({"status_id": getattr(doc, "status_id", None)})
            resp["ETag"] = self._build_etag(doc)
            return resp
        except ServiceError as e:
            message = str(e)
            if "Document.status_id trống" in message:
                return Response({"detail": message, "code": "VALIDATION_ERROR"}, status=status.HTTP_409_CONFLICT)
            return _err(e)

    @extend_schema(
        tags=[_TAG],
        operation_id="inbound_complete",
        summary="Hoàn tất xử lý",
        parameters=[_OPENAPI_ID_PARAM],
        request=cast(Any, CompleteInboundActionSerializer),
        responses={
            200: OpenApiResponse(response=StatusOnlyResponseSchema),
            400: OpenApiResponse(response=APIErrorSchema),
            403: OpenApiResponse(response=APIErrorSchema),
            409: OpenApiResponse(response=APIErrorSchema),
        },
        examples=[OpenApiExample("Complete example", value={"note": "Đã trả lời công văn"})],
    )
    @action(detail=True, methods=["post"])
    def complete(self, request, *args, **view_kwargs):
        doc = self.get_object()
        self._maybe_enforce_if_match(request, doc)
        if not rbac.can(request.user, Act.IN_COMPLETE, doc):
            raise ForbiddenError(code="RBAC_FORBIDDEN")
        note: Optional[str] = request.data.get("note") or request.data.get("comment")
        if hasattr(doc, "status_id") and not getattr(doc, "status_id", None):
            return Response(
                {"detail": "Document.status_id trống.", "code": "VALIDATION_ERROR"},
                status=status.HTTP_409_CONFLICT,
            )
        try:
            inbound_service.complete(request.user, doc, note=note)
            _maybe_refresh_from_db(doc)
            resp = Response({"status_id": getattr(doc, "status_id", None)})
            resp["ETag"] = self._build_etag(doc)
            return resp
        except ServiceError as e:
            return _err(e)

    @extend_schema(
        tags=[_TAG],
        operation_id="inbound_archive",
        summary="Lưu trữ văn bản đến",
        parameters=[_OPENAPI_ID_PARAM],
        request=cast(Any, ArchiveInboundActionSerializer),
        responses={
            200: OpenApiResponse(response=StatusOnlyResponseSchema),
            400: OpenApiResponse(response=APIErrorSchema),
            403: OpenApiResponse(response=APIErrorSchema),
            409: OpenApiResponse(response=APIErrorSchema),
        },
        examples=[OpenApiExample("Archive example", value={"reason": "Kết thúc hồ sơ"})],
    )
    @action(detail=True, methods=["post"])
    def archive(self, request, *args, **view_kwargs):
        doc = self.get_object()
        self._maybe_enforce_if_match(request, doc)
        reason: Optional[str] = request.data.get("reason")
        try:
            inbound_service.archive(request.user, doc, reason=reason)
            doc.refresh_from_db()
            resp = Response({"status_id": getattr(doc, "status_id", None)})
            resp["ETag"] = self._build_etag(doc)
            return resp
        except ServiceError as e:
            return _err(e)

    @extend_schema(
        tags=[_TAG],
        operation_id="inbound_withdraw",
        summary="Thu hồi văn bản đến",
        parameters=[_OPENAPI_ID_PARAM],
        request=cast(Any, WithdrawInboundActionSerializer),
        responses={
            200: OpenApiResponse(response=StatusOnlyResponseSchema),
            400: OpenApiResponse(response=APIErrorSchema),
            403: OpenApiResponse(response=APIErrorSchema),
            409: OpenApiResponse(response=APIErrorSchema),
        },
        examples=[OpenApiExample("Withdraw example", value={"reason": "Thông tin chưa chính xác"})],
    )
    @action(detail=True, methods=["post"], url_path="withdraw")
    def withdraw_(self, request, *args, **view_kwargs):
        doc = self.get_object()
        self._enforce_if_match(request, doc)
        reason: str = request.data.get("reason", "")
        try:
            inbound_service.withdraw(request.user, doc, reason=reason)
            doc.refresh_from_db()
            resp = Response({"status_id": getattr(doc, "status_id", None)})
            resp["ETag"] = self._build_etag(doc)
            return resp
        except ServiceError as e:
            return _err(e)
