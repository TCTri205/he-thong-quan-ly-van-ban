# cases/views.py
from __future__ import annotations

from typing import List, Optional
from uuid import uuid4

from django.core.files.storage import default_storage
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from django.contrib.auth import get_user_model
from django.db.models import ForeignKey, ManyToManyRel, ManyToManyField
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

# drf-spectacular
from drf_spectacular.utils import OpenApiExample, OpenApiParameter, extend_schema
from drf_spectacular.types import OpenApiTypes

from core.exceptions import ForbiddenError, PreconditionFailedError, PreconditionRequiredError
from core.etag import build_etag

from cases.models import Case, CaseParticipant, CaseTask, CaseAttachment, CaseDocument, Comment, CaseActivityLog
from cases.serializers import (
    CaseSerializer,
    CaseUpsertSerializer,
    CaseActivityLogSerializer,
    CaseParticipantSerializer,
    CaseParticipantUpsertSerializer,
    CaseTaskSerializer,
    CaseTaskCreateSerializer,
    CaseTaskUpdateSerializer,
    CaseAttachmentSerializer,
    CaseAttachmentUploadSerializer,
    CaseDocumentSerializer,
    CaseDocumentLinkSerializer,
    CommentSerializer,
    CommentCreateSerializer,
    # request payload cho các action (schema-only)
    WaitAssignActionSerializer,
    AssignCaseActionSerializer,
    StartCaseActionSerializer,
    PauseCaseActionSerializer,
    ResumeCaseActionSerializer,
    RequestCloseCaseActionSerializer,
    ApproveCloseCaseActionSerializer,
    ArchiveCaseActionSerializer,
)
from cases.filters import CaseFilterSet
from workflow.services import rbac
from workflow.services.rbac import Role

# Components dùng chung (đã được đặt tên qua common.schema)
from common.schema import APIError as APIErrorSchema, StatusOnlyResponse as StatusOnlyResponseSchema

# Helpers docs: đồng bộ 401/403/404/409..., paged schema, v.v.
from core.docs import (
    DEFAULT_ERROR_RESPONSES,
    doc_list,
    doc_retrieve,
    doc_action_status,
)

User = get_user_model()
TAG = "Hồ sơ"


def _err(e: Exception) -> Response:
    """
    Chuẩn hoá lỗi service về HTTP code mà KHÔNG import workflow.services.errors ở module-level.
    Tránh vòng lặp/ImportError khi nạp URLConf hay sinh OpenAPI.
    """
    name = e.__class__.__name__
    message = str(e) or "Operation failed."
    if name == "PermissionDenied":
        return Response({"detail": message, "code": "RBAC_FORBIDDEN"}, status=status.HTTP_403_FORBIDDEN)
    if name in ("InvalidTransition", "ConflictError"):
        return Response({"detail": message, "code": "CASE_STATE_CONFLICT"}, status=status.HTTP_409_CONFLICT)
    if name in ("ValidationError", "BadRequest"):
        return Response({"detail": message, "code": "VALIDATION_ERROR"}, status=status.HTTP_400_BAD_REQUEST)
    # fallback
    return Response({"detail": message, "code": "SERVICE_ERROR"}, status=status.HTTP_400_BAD_REQUEST)


# -------- Helpers an toàn theo schema --------
def _case_has_field(field_name: str) -> bool:
    try:
        Case._meta.get_field(field_name)  # type: ignore[attr-defined]
        return True
    except Exception:
        return False


def _case_has_attr_or_related(name: str) -> bool:
    if hasattr(Case, name):
        return True
    try:
        Case._meta.get_field(name)  # type: ignore[attr-defined]
        return True
    except Exception:
        return False


def _safe_select_related_fields() -> List[str]:
    out: List[str] = []
    for fname in ("status", "department", "leader", "created_by"):
        try:
            f = Case._meta.get_field(fname)
            if isinstance(f, ForeignKey):
                out.append(fname)
        except Exception:
            continue
    return out


def _safe_prefetch_related_fields() -> List[str]:
    """
    Trả về danh sách related-name an toàn để prefetch.
    """
    out: List[str] = []
    if _case_has_attr_or_related("assignees"):
        out.append("assignees")
        return out
    try:
        for f in Case._meta.get_fields():
            if isinstance(f, (ManyToManyField, ManyToManyRel)):
                out.append(f.name)
                break
    except Exception:
        pass
    return out




def _require_if_match(request, instance: Case) -> str:
    provided = None
    meta = getattr(request, "META", {}) or {}
    if meta.get("HTTP_IF_MATCH"):
        provided = meta["HTTP_IF_MATCH"]
    elif hasattr(request, "headers"):
        provided = request.headers.get("If-Match")
    if not provided:
        raise PreconditionRequiredError(code="IF_MATCH_REQUIRED")
    current = build_etag(instance)
    if provided.strip() != current:
        raise PreconditionFailedError(code="ETAG_MISMATCH")
    return current


def _is_leader(user) -> bool:
    """
    Lãnh đạo nếu:
      - is_superuser, hoặc
      - user.role == 'LANH_DAO' (không phân biệt hoa thường), hoặc
      - thuộc group 'LD' / 'LÃNH ĐẠO'
    """
    if getattr(user, "is_superuser", False):
        return True
    try:
        role = getattr(user, "role", None)
        if role and str(role).upper() == "LANH_DAO":
            return True
    except Exception:
        pass
    try:
        if user.groups.filter(name__in=["LD", "LÃNH ĐẠO"]).exists():
            return True
    except Exception:
        pass
    return False


class CaseViewSet(viewsets.ModelViewSet):
    """
    /api/v1/cases/...
    - Không import service/errors ở module-level để tránh “domino fail” khi nạp URLConf.
    """
    permission_classes = [IsAuthenticated]
    serializer_class = CaseSerializer
    queryset = Case.objects.all()
    filterset_class = CaseFilterSet

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return CaseUpsertSerializer
        if self.action == "activity_logs":
            return CaseActivityLogSerializer
        return super().get_serializer_class()

    def _response_with_etag(self, instance: Case, payload: dict, refresh: bool = True) -> Response:
        if refresh:
            instance.refresh_from_db()
        resp = Response(payload)
        resp["ETag"] = build_etag(instance)
        return resp

    # ====== List / Retrieve ======

    def get_queryset(self):
        qs = super().get_queryset()
        sel = _safe_select_related_fields()
        if sel:
            qs = qs.select_related(*sel)
        pre = _safe_prefetch_related_fields()
        if pre:
            try:
                qs = qs.prefetch_related(*pre)
            except Exception:
                pass
        # ordering an toàn để tránh UnorderedObjectListWarning
        try:
            Case._meta.get_field("created_at")  # type: ignore[attr-defined]
            return qs.order_by("-created_at")
        except Exception:
            return qs.order_by("-pk")

    @doc_list(
        item_serializer=CaseSerializer,
        tag=TAG,
        operation_id="case_list",
        summary="Danh sách hồ sơ (phân trang)",
    )
    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)

    @doc_retrieve(
        detail_serializer=CaseSerializer,
        tag=TAG,
        operation_id="case_retrieve",
        summary="Chi tiết hồ sơ",
    )
    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        ser = self.get_serializer(instance)
        resp = Response(ser.data)
        resp["ETag"] = build_etag(instance)
        return resp

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        case = serializer.save(created_by=request.user)
        try:
            from workflow.services.case_service import CaseService
            CaseService(request.user).create(case, description=serializer.validated_data.get("description"))
            case.refresh_from_db()
        except Exception as e:
            return _err(e)
        detail = CaseSerializer(case, context=self.get_serializer_context())
        resp = self._response_with_etag(case, detail.data, refresh=False)
        resp.status_code = status.HTTP_201_CREATED
        return resp

    def update(self, request, *args, **kwargs):
        return self._update(request, partial=False, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        return self._update(request, partial=True, **kwargs)

    def _update(self, request, partial: bool, **kwargs):
        instance = self.get_object()
        _require_if_match(request, instance)
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return self._response_with_etag(instance, self.get_serializer(instance).data)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        _require_if_match(request, instance)
        return super().destroy(request, *args, **kwargs)

    # ====== Hành động ======
    @doc_action_status(
        request_serializer=WaitAssignActionSerializer,
        tag=TAG,
        operation_id="case_wait_assign",
        summary="Chuyển trạng thái chờ phân công",
        examples=[OpenApiExample("No payload", value={})],
    )
    @action(detail=True, methods=["post"], url_path="wait-assign")
    def wait_assign(self, request, pk=None):
        case = self.get_object()
        _require_if_match(request, case)
        try:
            from workflow.services.case_service import CaseService
            CaseService(request.user).wait_for_assign(case)
            return self._response_with_etag(case, {"status_id": case.status_id})
        except Exception as e:
            return _err(e)

    @doc_action_status(
        request_serializer=AssignCaseActionSerializer,
        tag=TAG,
        operation_id="case_assign",
        summary="Phân công hồ sơ (chỉ Lãnh đạo)",
        examples=[
            OpenApiExample(
                "Assign example",
                value={
                    "assignees": [10, 12],
                    "leader": 2,
                    "due_date": "2025-11-03T17:00:00+07:00",
                    "instruction": "Xử lý trong tuần",
                },
            )
        ],
    )
    @action(detail=True, methods=["post"])
    def assign(self, request, pk=None):
        # ⛔ Chặn quyền ngay đầu: không phải Lãnh đạo -> 403 (đúng kỳ vọng test)
        if not _is_leader(request.user):
            raise ForbiddenError(code="RBAC_FORBIDDEN")

        case = self.get_object()
        _require_if_match(request, case)

        # Lấy PK field name động của User (thường là 'id', nhưng để an toàn)
        user_pk_field = getattr(User._meta.pk, "name", "id")

        assignee_ids = request.data.get("assignees", []) or []
        try:
            assignees = User.objects.filter(**{f"{user_pk_field}__in": assignee_ids})
        except Exception:
            assignees = User.objects.none()
            if isinstance(assignee_ids, list):
                assignees = User.objects.filter(**{f"{user_pk_field}__in": [x for x in assignee_ids if x is not None]})

        leader = None
        leader_id = request.data.get("leader")
        if leader_id is not None:
            try:
                leader = User.objects.filter(**{user_pk_field: leader_id}).first()
            except Exception:
                leader = None

        due_date = parse_datetime(request.data.get("due_date")) if request.data.get("due_date") else None
        instruction = request.data.get("instruction")

        try:
            from workflow.services.case_service import CaseService
            CaseService(request.user).assign(
                case,
                assignees=assignees,
                leader=leader,
                instruction=instruction,
                due_date=due_date,
            )
            return self._response_with_etag(case, {"status_id": case.status_id})
        except Exception as e:
            return _err(e)

    @doc_action_status(
        request_serializer=StartCaseActionSerializer,
        tag=TAG,
        operation_id="case_start",
        summary="Bắt đầu thực hiện",
        examples=[OpenApiExample("Start example", value={})],
    )
    @action(detail=True, methods=["post"])
    def start(self, request, pk=None):
        case = self.get_object()
        _require_if_match(request, case)
        try:
            from workflow.services.case_service import CaseService
            CaseService(request.user).start(case)
            return self._response_with_etag(case, {"status_id": case.status_id})
        except Exception as e:
            return _err(e)

    @doc_action_status(
        request_serializer=PauseCaseActionSerializer,
        tag=TAG,
        operation_id="case_pause",
        summary="Tạm dừng thực hiện",
        examples=[OpenApiExample("Pause example", value={"reason": "Chờ bổ sung tài liệu từ đơn vị A"})],
    )
    @action(detail=True, methods=["post"])
    def pause(self, request, pk=None):
        case = self.get_object()
        _require_if_match(request, case)
        reason = request.data.get("reason")
        try:
            from workflow.services.case_service import CaseService
            CaseService(request.user).pause(case, reason=reason)
            return self._response_with_etag(case, {"status_id": case.status_id})
        except Exception as e:
            return _err(e)

    @doc_action_status(
        request_serializer=ResumeCaseActionSerializer,
        tag=TAG,
        operation_id="case_resume",
        summary="Tiếp tục thực hiện",
        examples=[OpenApiExample("Resume example", value={})],
    )
    @action(detail=True, methods=["post"])
    def resume(self, request, pk=None):
        case = self.get_object()
        _require_if_match(request, case)
        try:
            from workflow.services.case_service import CaseService
            CaseService(request.user).resume(case)
            return self._response_with_etag(case, {"status_id": case.status_id})
        except Exception as e:
            return _err(e)

    @doc_action_status(
        request_serializer=RequestCloseCaseActionSerializer,
        tag=TAG,
        operation_id="case_request_close",
        summary="Đề nghị kết thúc hồ sơ",
        examples=[OpenApiExample("Request close example", value={"note": "Hoàn tất các đầu việc"})],
    )
    @action(detail=True, methods=["post"], url_path="request-close")
    def request_close(self, request, pk=None):
        case = self.get_object()
        _require_if_match(request, case)
        note = request.data.get("note")
        try:
            from workflow.services.case_service import CaseService
            CaseService(request.user).request_close(case, note=note)
            return self._response_with_etag(case, {"status_id": case.status_id})
        except Exception as e:
            return _err(e)

    @doc_action_status(
        request_serializer=ApproveCloseCaseActionSerializer,
        tag=TAG,
        operation_id="case_approve_close",
        summary="Phê duyệt kết thúc hồ sơ",
        examples=[OpenApiExample("Approve close example", value={})],
    )
    @action(detail=True, methods=["post"], url_path="approve-close")
    def approve_close(self, request, pk=None):
        case = self.get_object()
        _require_if_match(request, case)
        try:
            from workflow.services.case_service import CaseService
            CaseService(request.user).approve_close(case)
            return self._response_with_etag(case, {"status_id": case.status_id})
        except Exception as e:
            return _err(e)

    @doc_action_status(
        request_serializer=ArchiveCaseActionSerializer,
        tag=TAG,
        operation_id="case_archive",
        summary="Lưu trữ hồ sơ",
        examples=[OpenApiExample("Archive example", value={})],
    )
    @action(detail=True, methods=["post"])
    def archive(self, request, pk=None):
        case = self.get_object()
        _require_if_match(request, case)
        try:
            from workflow.services.case_service import CaseService
            CaseService(request.user).archive(case)
            return self._response_with_etag(case, {"status_id": case.status_id})
        except Exception as e:
            return _err(e)

    @action(detail=True, methods=["get", "put"], url_path="participants")
    def participants(self, request, pk=None):
        case = self.get_object()
        if request.method == "GET":
            qs = CaseParticipant.objects.filter(case=case).select_related("user")
            return Response(CaseParticipantSerializer(qs, many=True).data)

        if not _is_leader(request.user):
            raise ForbiddenError(code="RBAC_FORBIDDEN")
        payload = request.data
        if isinstance(payload, list):
            payload = {"participants": payload}
        serializer = CaseParticipantUpsertSerializer(data=payload)
        serializer.is_valid(raise_exception=True)
        CaseParticipant.objects.filter(case=case).delete()
        rows = [
            CaseParticipant(
                case=case,
                user_id=item["user_id"],
                role_on_case=item["role_on_case"],
            )
            for item in serializer.validated_data.get("participants", [])
        ]
        if rows:
            CaseParticipant.objects.bulk_create(rows, ignore_conflicts=True)
        qs = CaseParticipant.objects.filter(case=case).select_related("user")
        return Response(CaseParticipantSerializer(qs, many=True).data)

    @extend_schema(
        tags=[TAG],
        operation_id="case_watch",
        summary="Theo dõi hồ sơ",
        responses={200: CaseParticipantSerializer, **DEFAULT_ERROR_RESPONSES},
    )
    @action(detail=True, methods=["post"], url_path="watch")
    def watch(self, request, pk=None):
        case = self.get_object()
        participant, created = CaseParticipant.objects.get_or_create(
            case=case,
            user=request.user,
            defaults={"role_on_case": CaseParticipant.RoleOnCase.WATCHER},
        )
        if not created and participant.role_on_case != CaseParticipant.RoleOnCase.WATCHER:
            return Response(CaseParticipantSerializer(participant).data)
        serializer = CaseParticipantSerializer(participant)
        return Response(serializer.data)

    @extend_schema(
        tags=[TAG],
        operation_id="case_unwatch",
        summary="Bỏ theo dõi hồ sơ",
        responses={204: None, **DEFAULT_ERROR_RESPONSES},
    )
    @action(detail=True, methods=["delete"], url_path="watch")
    def unwatch(self, request, pk=None):
        case = self.get_object()
        CaseParticipant.objects.filter(
            case=case,
            user=request.user,
            role_on_case=CaseParticipant.RoleOnCase.WATCHER,
        ).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @extend_schema(
        operation_id="case_activity_logs",
        summary="Nhật ký hoạt động hồ sơ",
        responses={200: CaseActivityLogSerializer(many=True), 404: APIErrorSchema},
    )
    @action(detail=True, methods=["get"], url_path="activity-logs")
    def activity_logs(self, request, pk=None):
        case = self.get_object()
        logs = (
            CaseActivityLog.objects.filter(case=case)
            .select_related("actor")
            .order_by("-at")
        )
        return Response(CaseActivityLogSerializer(logs, many=True).data)

    @action(detail=True, methods=["get", "post"], url_path="tasks")
    def tasks(self, request, pk=None):
        case = self.get_object()
        if request.method == "GET":
            qs = (
                CaseTask.objects.filter(case=case)
                .select_related("assignee", "created_by")
                .order_by("-created_at")
            )
            return Response(CaseTaskSerializer(qs, many=True).data)

        serializer = CaseTaskCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        assignee = None
        assignee_id = data.get("assignee_id")
        if assignee_id is not None:
            if not _is_leader(request.user):
                raise ForbiddenError(code="RBAC_FORBIDDEN")
            user_pk = getattr(User._meta.pk, "attname", "id")
            assignee = User.objects.filter(**{user_pk: assignee_id}).first()
            if assignee is None:
                return Response({"detail": "Người được giao không hợp lệ."}, status=status.HTTP_400_BAD_REQUEST)

        task = CaseTask.objects.create(
            case=case,
            title=data["title"],
            assignee=assignee,
            due_at=data.get("due_at"),
            note=data.get("note"),
            created_by=request.user,
        )
        return Response(CaseTaskSerializer(task).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get", "post"], url_path="attachments")
    def attachments(self, request, pk=None):
        case = self.get_object()
        if request.method == "GET":
            qs = (
                CaseAttachment.objects.filter(case=case)
                .select_related("uploaded_by")
                .order_by("-uploaded_at")
            )
            return Response(CaseAttachmentSerializer(qs, many=True).data)

        upload = request.FILES.get("file")
        if upload is None:
            return Response({"detail": "Thiếu tệp 'file'."}, status=status.HTTP_400_BAD_REQUEST)
        meta_serializer = CaseAttachmentUploadSerializer(data=request.data)
        meta_serializer.is_valid(raise_exception=True)
        file_name = getattr(upload, "name", "attachment")
        storage_path = default_storage.save(
            f"case-attachments/{uuid4()}_{file_name}",
            upload,
        )
        attachment = CaseAttachment.objects.create(
            case=case,
            attachment_type=meta_serializer.validated_data.get("attachment_type") or "tep_kem_theo",
            file_name=file_name,
            storage_path=storage_path,
            uploaded_by=request.user,
        )
        return Response(CaseAttachmentSerializer(attachment).data, status=status.HTTP_201_CREATED)

    @action(
        detail=True,
        methods=["delete"],
        url_path=r"attachments/(?P<attachment_id>[^/]+)",
    )
    def delete_attachment(self, request, attachment_id: str, pk=None):
        case = self.get_object()
        attachment = get_object_or_404(CaseAttachment, pk=attachment_id, case=case)
        attachment.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["get", "put"], url_path="documents")
    def documents_link(self, request, pk=None):
        case = self.get_object()
        if request.method == "GET":
            qs = CaseDocument.objects.filter(case=case)
            return Response(CaseDocumentSerializer(qs, many=True).data)

        role_code = rbac.get_single_role_code(request.user)
        if role_code not in (Role.CV.value, Role.LD.value):
            raise ForbiddenError(code="RBAC_FORBIDDEN")

        serializer = CaseDocumentLinkSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        CaseDocument.objects.filter(case=case).delete()
        docs = serializer.validated_data.get("document_ids", [])
        rows = [CaseDocument(case=case, document_id=doc_id) for doc_id in docs]
        if rows:
            CaseDocument.objects.bulk_create(rows, ignore_conflicts=True)
        qs = CaseDocument.objects.filter(case=case)
        return Response(CaseDocumentSerializer(qs, many=True).data)


class CaseTaskDetailView(APIView):
    permission_classes = [IsAuthenticated]
    serializer_class = CaseTaskSerializer

    @extend_schema(
        request=CaseTaskUpdateSerializer,
        responses={
            200: CaseTaskSerializer,
            400: APIErrorSchema,
            403: APIErrorSchema,
            404: APIErrorSchema,
        },
    )
    def patch(self, request, pk):
        task = get_object_or_404(CaseTask, pk=pk)
        serializer = CaseTaskUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        assignee_id = data.get("assignee_id")
        if assignee_id is not None:
            if not _is_leader(request.user):
                raise ForbiddenError(code="RBAC_FORBIDDEN")
            user_pk_field = getattr(User._meta.pk, "attname", "id")
            assignee = User.objects.filter(**{user_pk_field: assignee_id}).first()
            if assignee is None:
                return Response({"detail": "Người được giao không hợp lệ."}, status=status.HTTP_400_BAD_REQUEST)
            task.assignee = assignee

        for field in ("title", "status", "due_at", "note"):
            if field in data:
                setattr(task, field, data[field])

        if data.get("status") == CaseTask.Status.DONE and not task.completed_at:
            task.completed_at = timezone.now()
        task.save()
        return Response(CaseTaskSerializer(task).data)


class CommentListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        parameters=[
            OpenApiParameter(
                name="entity_type",
                location=OpenApiParameter.QUERY,
                required=True,
                type=OpenApiTypes.STR,
            ),
            OpenApiParameter(
                name="entity_id",
                location=OpenApiParameter.QUERY,
                required=True,
                type=OpenApiTypes.INT,
            ),
        ],
        responses={200: CommentSerializer(many=True), 400: APIErrorSchema},
    )
    def get(self, request):
        entity_type = request.query_params.get("entity_type")
        entity_id = request.query_params.get("entity_id")
        if not entity_type or not entity_id:
            return Response({"detail": "Thiếu entity_type hoặc entity_id."}, status=status.HTTP_400_BAD_REQUEST)
        qs = Comment.objects.filter(
            entity_type=entity_type,
            entity_id=entity_id,
        ).order_by("created_at")
        return Response(CommentSerializer(qs, many=True).data)

    @extend_schema(
        request=CommentCreateSerializer,
        responses={201: CommentSerializer, 400: APIErrorSchema},
    )
    def post(self, request):
        serializer = CommentCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        comment = Comment.objects.create(
            entity_type=serializer.validated_data["entity_type"],
            entity_id=serializer.validated_data["entity_id"],
            content=serializer.validated_data["content"],
            user=request.user,
        )
        return Response(CommentSerializer(comment).data, status=status.HTTP_201_CREATED)


class CommentDetailView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        responses={
            204: StatusOnlyResponseSchema,
            403: APIErrorSchema,
            404: APIErrorSchema,
        }
    )
    def delete(self, request, pk):
        comment = get_object_or_404(Comment, pk=pk)
        role_code = rbac.get_single_role_code(request.user)
        if comment.user_id != getattr(request.user, "user_id", None) and role_code != Role.QT.value:
            raise ForbiddenError(code="RBAC_FORBIDDEN")
        comment.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
