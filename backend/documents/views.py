from __future__ import annotations

import os
from typing import Any, Dict, List, Optional
from uuid import uuid4

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.http import FileResponse, Http404
from django.utils import timezone
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema

from core.exceptions import ForbiddenError
from documents.models import (
    DispatchOutbox,
    Document,
    DocumentApproval,
    DocumentAssignment,
    DocumentAttachment,
    DocumentVersion,
    DocumentWorkflowLog,
    OrgContact,
    Organization,
)
from documents.serializers import (
    DocumentApprovalDecisionSerializer,
    DocumentApprovalSerializer,
    DocumentApprovalUpsertSerializer,
    DocumentAssignmentSerializer,
    DocumentAssignmentUpsertSerializer,
    DocumentAttachmentSerializer,
    DocumentDetailSerializer,
    DocumentDispatchCreateSerializer,
    DocumentDispatchSerializer,
    DocumentDispatchUpdateSerializer,
    DocumentSlimSerializer,
    DocumentUpsertSerializer,
    DocumentVersionCreateSerializer,
    DocumentVersionSerializer,
    DocumentWorkflowLogSerializer,
    OrgContactSerializer,
    OrganizationSerializer,
)
from documents.views_base import DocumentBaseViewSet
from documents.views_outbound import _att_first_filefield_name, _att_has_field
from workflow.services import rbac
from workflow.services.errors import ServiceError
from workflow.services.outbound_service import OutboundService
from workflow.services.rbac import Act, Role

User = get_user_model()


def _user_role(user) -> Optional[str]:
    return rbac.get_single_role_code(user)


class DocumentViewSet(
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    DocumentBaseViewSet,
):
    """
    Hợp nhất API /api/v1/documents đáp ứng các yêu cầu D1/D2/D3.
    """

    lookup_field = "document_id"
    lookup_url_kwarg = "document_id"

    def get_serializer_class(self):
        if self.action == "list":
            return DocumentSlimSerializer
        if self.action in ("create", "update", "partial_update"):
            return DocumentUpsertSerializer
        return DocumentDetailSerializer

    # ---- Helpers -----------------------------------------------------------------
    def _direction_from_source(self, request=None, obj=None) -> str:
        if obj is not None:
            return getattr(obj, "doc_direction", None) or Document.Direction.DU_THAO
        if request is not None and hasattr(request, "data"):
            data = request.data
            try:
                return data.get("doc_direction") or Document.Direction.DU_THAO
            except AttributeError:
                return Document.Direction.DU_THAO
        return Document.Direction.DU_THAO

    def resolve_required_act(self, action=None, method=None, request=None, obj=None):
        method = (method or "").upper()
        direction = self._direction_from_source(request=request, obj=obj)

        def _by_direction(in_act: Act, out_act: Act) -> Act:
            return in_act if direction == Document.Direction.DEN else out_act

        if action == "create":
            return _by_direction(Act.IN_RECEIVE, Act.OUT_DRAFT_CREATE)
        if action in ("update", "partial_update"):
            return _by_direction(Act.IN_EDIT_NOTE, Act.OUT_DRAFT_EDIT)
        if action == "destroy":
            return _by_direction(Act.IN_WITHDRAW, Act.OUT_WITHDRAW)
        if action == "assignments":
            if method == "GET":
                return Act.VIEW
            return _by_direction(Act.IN_ASSIGN, Act.OUT_DRAFT_EDIT)
        if action == "approvals":
            return Act.VIEW if method == "GET" else Act.OUT_APPROVE
        if action == "approvals_decision":
            return Act.OUT_APPROVE
        if action == "versions":
            return Act.VIEW if method == "GET" else _by_direction(Act.IN_EDIT_NOTE, Act.OUT_DRAFT_EDIT)
        if action in ("attachments", "delete_attachment", "download_attachment"):
            if method in ("GET",):
                return Act.VIEW
            return _by_direction(Act.IN_EDIT_NOTE, Act.OUT_DRAFT_EDIT)
        if action == "workflow_logs":
            return Act.VIEW
        if action == "dispatches":
            return Act.OUT_PUBLISH
        if action == "submit":
            return Act.OUT_SUBMIT
        if action == "approve":
            return Act.OUT_APPROVE
        if action == "reject":
            return Act.OUT_RETURN
        if action == "sign":
            return Act.OUT_SIGN
        if action == "publish":
            return Act.OUT_PUBLISH
        if action == "recall":
            return Act.OUT_WITHDRAW
        return None

    def _response_with_etag(self, instance: Document, payload: Dict[str, Any], status_code=status.HTTP_200_OK):
        resp = Response(payload, status=status_code)
        resp["ETag"] = self._build_etag(instance)
        return resp

    # ---- CRUD --------------------------------------------------------------------
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save(created_by=request.user)
        data = DocumentDetailSerializer(instance, context=self.get_serializer_context()).data
        return self._response_with_etag(instance, data, status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        return self._update(request, partial=False, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        return self._update(request, partial=True, *args, **kwargs)

    def _update(self, request, partial: bool, *args, **kwargs):
        instance = self.get_object()
        self._enforce_if_match(request, instance)
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        data = DocumentDetailSerializer(instance, context=self.get_serializer_context()).data
        return self._response_with_etag(instance, data)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        self._enforce_if_match(request, instance)
        return super().destroy(request, *args, **kwargs)

    # ---- Workflow actions --------------------------------------------------------
    def _call_outbound_service(
        self,
        serializer_cls,
        instance: Document,
        request,
        *,
        format_response=None,
        success_status=status.HTTP_200_OK,
    ):
        serializer = serializer_cls(
            instance=instance, data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        try:
            result = serializer.save()
        except ServiceError as exc:  # pragma: no cover - delegated to service
            self._raise_from_service(exc)
        if callable(format_response):
            return format_response(result, serializer)
        return Response({"status": "ok"}, status=success_status)

    @extend_schema(tags=["Văn bản"], operation_id="document_submit")
    @action(detail=True, methods=["post"], url_path="submit")
    def submit(self, request, *args, **kwargs):
        return self._call_outbound_service(
            serializer_cls=self._get_action_serializer("submit"),
            instance=self.get_object(),
            request=request,
        )

    def _get_action_serializer(self, name: str):
        from documents.serializers import (
            SubmitActionSerializer,
            ApproveActionSerializer,
            ReturnForFixActionSerializer,
            SignActionSerializer,
            PublishActionSerializer,
            WithdrawPublishActionSerializer,
        )

        mapping = {
            "submit": SubmitActionSerializer,
            "approve": ApproveActionSerializer,
            "reject": ReturnForFixActionSerializer,
            "sign": SignActionSerializer,
            "publish": PublishActionSerializer,
            "recall": WithdrawPublishActionSerializer,
        }
        return mapping[name]

    @action(detail=True, methods=["post"], url_path="approve")
    def approve(self, request, *args, **kwargs):
        return self._call_outbound_service(
            serializer_cls=self._get_action_serializer("approve"),
            instance=self.get_object(),
            request=request,
        )

    @action(detail=True, methods=["post"], url_path="reject")
    def reject(self, request, *args, **kwargs):
        return self._call_outbound_service(
            serializer_cls=self._get_action_serializer("reject"),
            instance=self.get_object(),
            request=request,
        )

    @action(detail=True, methods=["post"], url_path="sign")
    def sign(self, request, *args, **kwargs):
        return self._call_outbound_service(
            serializer_cls=self._get_action_serializer("sign"),
            instance=self.get_object(),
            request=request,
        )

    @action(detail=True, methods=["post"], url_path="publish")
    def publish(self, request, *args, **kwargs):
        document = self.get_object()

        def _format(result, serializer):
            doc = None
            numbering = None
            if isinstance(result, dict):
                doc = result.get("document")
                numbering = result.get("numbering")
            else:
                doc = result
            if doc is not None:
                doc.refresh_from_db()
            data = {
                "document_id": getattr(doc, "document_id", None),
                "issue_number": getattr(doc, "issue_number", None),
                "issued_date": getattr(doc, "issued_date", None),
                "outgoing_numbering_id": getattr(numbering, "id", None) if numbering is not None else None,
            }
            resp = Response(data)
            target = doc or document
            if target is not None:
                resp["ETag"] = self._build_etag(target)
            return resp

        return self._call_outbound_service(
            serializer_cls=self._get_action_serializer("publish"),
            instance=document,
            request=request,
            format_response=_format,
        )

    @action(detail=True, methods=["post"], url_path="recall")
    def recall(self, request, *args, **kwargs):
        return self._call_outbound_service(
            serializer_cls=self._get_action_serializer("recall"),
            instance=self.get_object(),
            request=request,
        )

    # ---- Workflow logs -----------------------------------------------------------
    @extend_schema(tags=["Văn bản"], operation_id="document_workflow_logs")
    @action(detail=True, methods=["get"], url_path="workflow-logs")
    def workflow_logs(self, request, *args, **kwargs):
        doc = self.get_object()
        logs = (
            DocumentWorkflowLog.objects.filter(document=doc)
            .select_related("acted_by", "from_status", "to_status")
            .order_by("-acted_at")
        )
        data = DocumentWorkflowLogSerializer(logs, many=True).data
        return Response(data)

    # ---- Assignments -------------------------------------------------------------
    @action(detail=True, methods=["get", "put"], url_path="assignments")
    def assignments(self, request, *args, **kwargs):
        doc = self.get_object()
        if request.method == "GET":
            qs = (
                DocumentAssignment.objects.filter(document=doc)
                .select_related("user", "assigned_by")
                .order_by("-assigned_at")
            )
            return Response(DocumentAssignmentSerializer(qs, many=True).data)

        payload = request.data
        if isinstance(payload, list):
            payload = {"assignments": payload}
        serializer = DocumentAssignmentUpsertSerializer(data=payload)
        serializer.is_valid(raise_exception=True)
        assignments = serializer.save(document=doc, assigned_by=request.user)
        return Response(DocumentAssignmentSerializer(assignments, many=True).data)

    # ---- Approvals ---------------------------------------------------------------
    @action(detail=True, methods=["get", "put"], url_path="approvals")
    def approvals(self, request, *args, **kwargs):
        doc = self.get_object()
        if request.method == "GET":
            qs = (
                DocumentApproval.objects.filter(document=doc)
                .select_related("approver")
                .order_by("step_no")
            )
            return Response(DocumentApprovalSerializer(qs, many=True).data)

        payload = request.data
        if isinstance(payload, list):
            payload = {"approvals": payload}
        serializer = DocumentApprovalUpsertSerializer(data=payload)
        serializer.is_valid(raise_exception=True)
        approvals = serializer.save(document=doc)
        return Response(DocumentApprovalSerializer(approvals, many=True).data)

    @action(
        detail=True,
        methods=["post"],
        url_path=r"approvals/(?P<step>[^/]+)/decision",
    )
    def approvals_decision(self, request, step: str, *args, **kwargs):
        doc = self.get_object()
        serializer = DocumentApprovalDecisionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            approval = DocumentApproval.objects.get(document=doc, step_no=int(step))
        except DocumentApproval.DoesNotExist:
            raise Http404("Không tìm thấy bước duyệt.")
        approval.decision = serializer.validated_data["decision"]
        approval.decided_at = timezone.now()
        approval.save(update_fields=["decision", "decided_at"])
        return Response(DocumentApprovalSerializer(approval).data)

    # ---- Versions ----------------------------------------------------------------
    @action(detail=True, methods=["get", "post"], url_path="versions")
    def versions(self, request, *args, **kwargs):
        doc = self.get_object()
        if request.method == "GET":
            qs = (
                DocumentVersion.objects.filter(document=doc)
                .select_related("changed_by")
                .order_by("-version_no")
            )
            return Response(DocumentVersionSerializer(qs, many=True).data)

        serializer = DocumentVersionCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        upload = request.FILES.get("file")
        storage_path = None
        file_name = None
        if upload is not None:
            file_name = getattr(upload, "name", "version")
            storage_path = default_storage.save(
                f"document-versions/{uuid4()}_{file_name}",
                upload,
            )
        version = DocumentVersion.objects.create(
            document=doc,
            version_no=serializer.validated_data["version_no"],
            file_name=file_name,
            storage_path=storage_path,
            changed_by=request.user,
        )
        return Response(DocumentVersionSerializer(version).data)

    # ---- Attachments -------------------------------------------------------------
    def _attachment_ordering_field(self) -> str:
        for name in ("uploaded_at", "created_at", "attachment_id"):
            try:
                DocumentAttachment._meta.get_field(name)
                return f"-{name}"
            except Exception:
                continue
        return "-pk"

    def _attachments_queryset_for(self, doc: Document):
        rel = getattr(doc, "attachments", None)
        if rel is not None:
            try:
                return rel.all()
            except Exception:
                pass
        if _att_has_field(DocumentAttachment, "document"):
            return DocumentAttachment.objects.filter(document=doc)
        return DocumentAttachment.objects.none()

    def _allow_json_upload(self) -> bool:
        allow_json = getattr(settings, "ALLOW_JSON_UPLOAD_FALLBACK", None)
        if allow_json is None:
            allow_json = getattr(settings, "TESTING", False)
        return bool(allow_json)

    def _validate_upload_ext(self, name: Optional[str]):
        if not name:
            return
        allowed_ext = getattr(
            settings,
            "DOCUMENTS_ALLOWED_EXT",
            [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".jpg", ".jpeg", ".png"],
        )
        _, ext = os.path.splitext(str(name).lower())
        if allowed_ext and ext and ext not in allowed_ext:
            raise ForbiddenError(detail=f"Định dạng không được phép ({ext}).")

    @action(detail=True, methods=["get", "post"], url_path="attachments")
    def attachments(self, request, *args, **kwargs):
        doc = self.get_object()
        if request.method == "GET":
            order_field = self._attachment_ordering_field()
            qs = self._attachments_queryset_for(doc)
            try:
                qs = qs.order_by(order_field)
            except Exception:
                pass
            return Response(DocumentAttachmentSerializer(qs, many=True).data)

        upload = request.FILES.get("file")
        if upload is None and self._allow_json_upload():
            upload = request.data.get("file")

        if upload is None:
            return Response({"detail": "Thiếu tệp 'file'."}, status=status.HTTP_400_BAD_REQUEST)

        name = getattr(upload, "name", None) or "upload"
        self._validate_upload_ext(name)

        payload: Dict[str, Any] = {}
        if _att_has_field(DocumentAttachment, "document"):
            payload["document"] = doc
        if _att_has_field(DocumentAttachment, "uploaded_by"):
            payload["uploaded_by"] = request.user
        if _att_has_field(DocumentAttachment, "file_name"):
            payload["file_name"] = name
        if _att_has_field(DocumentAttachment, "attachment_type"):
            attachment_type = (request.data.get("attachment_type") or "").strip() if hasattr(request, "data") else ""
            if not attachment_type:
                attachment_type = "tep_kem_theo"
            payload["attachment_type"] = attachment_type
        if _att_has_field(DocumentAttachment, "note") and hasattr(request, "data"):
            note = request.data.get("note")
            if note is not None:
                payload["note"] = note

        ff = _att_first_filefield_name(DocumentAttachment)
        if ff:
            att = DocumentAttachment(**payload)
            getattr(att, ff).save(name, upload, save=False)
            att.save()
        else:
            raw = upload.read() if hasattr(upload, "read") else bytes(upload)
            if _att_has_field(DocumentAttachment, "storage_path"):
                storage_path = default_storage.save(
                    f"attachments/{uuid4()}_{name}",
                    ContentFile(raw),
                )
                payload["storage_path"] = storage_path
            att = DocumentAttachment.objects.create(**payload)
        return Response(DocumentAttachmentSerializer(att).data, status=status.HTTP_201_CREATED)

    @action(
        detail=True,
        methods=["delete"],
        url_path=r"attachments/(?P<attachment_id>[^/]+)",
    )
    def delete_attachment(self, request, attachment_id: str, *args, **kwargs):
        doc = self.get_object()
        try:
            att = DocumentAttachment.objects.get(pk=attachment_id)
        except DocumentAttachment.DoesNotExist:
            raise Http404("Không tìm thấy tệp đính kèm.")
        if getattr(att, "document_id", None) != doc.document_id:
            raise Http404("Không tìm thấy tệp đính kèm.")
        att.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(
        detail=True,
        methods=["get"],
        url_path=r"attachments/(?P<attachment_id>[^/]+)/download",
    )
    def download_attachment(self, request, attachment_id: str, *args, **kwargs):
        doc = self.get_object()
        try:
            att = DocumentAttachment.objects.get(pk=attachment_id)
        except DocumentAttachment.DoesNotExist:
            raise Http404("Không tìm thấy tệp đính kèm.")
        if getattr(att, "document_id", None) != doc.document_id:
            raise Http404("Không tìm thấy tệp đính kèm.")

        ff = _att_first_filefield_name(DocumentAttachment)
        if ff and hasattr(att, ff):
            file_field = getattr(att, ff)
            file_field.open("rb")
            return FileResponse(file_field, filename=getattr(att, "file_name", "download"))

        storage_path = getattr(att, "storage_path", None)
        if not storage_path:
            raise Http404("Không có dữ liệu tệp.")
        file_handle = default_storage.open(storage_path, "rb")
        return FileResponse(file_handle, filename=getattr(att, "file_name", "download"))

    # ---- Dispatches --------------------------------------------------------------
    @action(detail=True, methods=["get", "post"], url_path="dispatches")
    def dispatches(self, request, *args, **kwargs):
        doc = self.get_object()
        if request.method == "GET":
            qs = (
                DispatchOutbox.objects.filter(document=doc)
                .select_related("organization", "contact")
                .order_by("-sent_at", "-dispatch_id")
            )
            return Response(DocumentDispatchSerializer(qs, many=True).data)

        serializer = DocumentDispatchCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        org = None
        if data.get("organization_id"):
            org = Organization.objects.filter(pk=data["organization_id"]).first()
            if org is None:
                return Response({"detail": "Tổ chức không hợp lệ."}, status=status.HTTP_400_BAD_REQUEST)

        contact = None
        if data.get("contact_id"):
            contact = OrgContact.objects.filter(pk=data["contact_id"]).first()
            if contact is None:
                return Response({"detail": "Liên hệ không hợp lệ."}, status=status.HTTP_400_BAD_REQUEST)

        dispatch = DispatchOutbox.objects.create(
            document=doc,
            organization=org,
            contact=contact,
            method=data["method"],
            status=DispatchOutbox.Status.PENDING,
            note=data.get("note"),
        )
        return Response(DocumentDispatchSerializer(dispatch).data, status=status.HTTP_201_CREATED)


class OrganizationViewSet(viewsets.ModelViewSet):
    queryset = Organization.objects.all().order_by("name")
    serializer_class = OrganizationSerializer
    permission_classes = [IsAuthenticated]

    def _require_write_role(self, request):
        if _user_role(request.user) not in (Role.VT.value, Role.QT.value):
            raise ForbiddenError(code="RBAC_FORBIDDEN")

    def create(self, request, *args, **kwargs):
        self._require_write_role(request)
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        self._require_write_role(request)
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        self._require_write_role(request)
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=["get", "post"], url_path="contacts")
    def contacts(self, request, *args, **kwargs):
        org = self.get_object()
        if request.method == "GET":
            qs = org.contacts.all()
            return Response(OrgContactSerializer(qs, many=True).data)
        self._require_write_role(request)
        data = dict(request.data)
        data["organization_id"] = org.pk
        serializer = OrgContactSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        contact = serializer.save(organization=org)
        return Response(OrgContactSerializer(contact).data, status=status.HTTP_201_CREATED)

    @action(
        detail=True,
        methods=["patch", "delete"],
        url_path=r"contacts/(?P<contact_id>[^/]+)",
    )
    def contact_detail(self, request, contact_id: str, *args, **kwargs):
        self._require_write_role(request)
        org = self.get_object()
        try:
            contact = org.contacts.get(pk=contact_id)
        except OrgContact.DoesNotExist:
            raise Http404("Không tìm thấy liên hệ.")
        if request.method == "DELETE":
            contact.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        serializer = OrgContactSerializer(contact, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class DispatchViewSet(viewsets.GenericViewSet):
    queryset = DispatchOutbox.objects.select_related("document").all()
    serializer_class = DocumentDispatchSerializer
    permission_classes = [IsAuthenticated]
    lookup_field = "dispatch_id"
    lookup_url_kwarg = "pk"

    def _ensure_publish_permission(self, user, document: Optional[Document]):
        if not rbac.can(user, Act.OUT_PUBLISH, document):
            raise ForbiddenError(code="RBAC_FORBIDDEN")

    def partial_update(self, request, *args, **kwargs):
        dispatch = self.get_object()
        self._ensure_publish_permission(request.user, dispatch.document)
        serializer = DocumentDispatchUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        for field, value in serializer.validated_data.items():
            setattr(dispatch, field, value)
        dispatch.save()
        return Response(DocumentDispatchSerializer(dispatch).data)

    @action(detail=True, methods=["post"], url_path="resend")
    def resend(self, request, *args, **kwargs):
        dispatch = self.get_object()
        self._ensure_publish_permission(request.user, dispatch.document)
        dispatch.status = DispatchOutbox.Status.PENDING
        dispatch.sent_at = timezone.now()
        dispatch.save(update_fields=["status", "sent_at"])
        return Response(DocumentDispatchSerializer(dispatch).data)
