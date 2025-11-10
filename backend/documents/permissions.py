# documents/permissions.py
from typing import Optional
from rest_framework.permissions import BasePermission, SAFE_METHODS

# Re-export để các view có thể: from documents.permissions import Act
from workflow.services.rbac import can as rbac_can, Act


class DocumentPermission(BasePermission):
    """
    Quyền cho tài nguyên Document (inbound/outbound) dựa trên RBAC Service.

    - ViewSet phải ánh xạ action -> Act qua thuộc tính `required_act_map`.
      Ví dụ (Outbound):
        {
            "list": Act.VIEW,
            "retrieve": Act.VIEW,
            "touch_draft": Act.OUT_DRAFT_EDIT,
            "submit": Act.OUT_SUBMIT,
            "return_for_fix": Act.OUT_RETURN,
            "approve": Act.OUT_APPROVE,
            "sign": Act.OUT_SIGN,
            "publish": Act.OUT_PUBLISH,
            "withdraw_publish": Act.OUT_WITHDRAW,
            "archive": Act.OUT_ARCHIVE,
            "upload_attachment": Act.OUT_DRAFT_EDIT,
            "delete_attachment": Act.OUT_DRAFT_EDIT,
            "list_attachments": Act.VIEW,
        }

      Ví dụ (Inbound):
        {
            "list": Act.VIEW,
            "retrieve": Act.VIEW,
            "receive": Act.IN_RECEIVE,
            "register": Act.IN_REGISTER,
            "assign": Act.IN_ASSIGN,
            "start": Act.IN_START,
            "complete": Act.IN_COMPLETE,
            "archive": Act.IN_ARCHIVE,
            "withdraw": Act.IN_WITHDRAW,
        }

    - Nếu không map mà là SAFE_METHODS → mặc định Act.VIEW.
    - Nếu không map và KHÔNG phải SAFE_METHODS:
        * Với outbound: create -> OUT_DRAFT_CREATE; update/partial_update -> OUT_DRAFT_EDIT.
        * Còn lại: từ chối (403) ở has_permission (trừ request chi tiết — defer sang object perm).
    - Đối với các hành động có quy tắc động phụ thuộc đối tượng (vd IN_START, IN_COMPLETE, CASE_START…),
      DRF sẽ gọi `has_object_permission` sau khi có instance; vì vậy:
        * Ở `has_permission`, nếu là request "detail" (có id trong kwargs), cho phép đi tiếp
          để `has_object_permission` quyết định cuối cùng.
    """

    # ---- helpers ----
    def _is_detail_request(self, view) -> bool:
        lookup_kwarg = getattr(view, "lookup_url_kwarg", None) or getattr(view, "lookup_field", "pk")
        return lookup_kwarg in getattr(view, "kwargs", {})

    def _get_required_act(self, view, method: str, *, request=None, obj=None) -> Optional[Act]:
        action = getattr(view, "action", None)
        mapping = getattr(view, "required_act_map", None) or {}

        resolver = getattr(view, "resolve_required_act", None)
        if callable(resolver):
            resolved = resolver(
                action=action,
                method=method,
                request=request,
                obj=obj,
            )
            if resolved:
                return resolved

        # Ưu tiên map tường minh từ ViewSet
        if action in mapping:
            return mapping[action]

        # Đọc an toàn → VIEW
        if method in SAFE_METHODS:
            return Act.VIEW

        # Suy luận tối thiểu cho các thao tác REST mặc định của outbound
        # (nếu bạn không dùng create/update cho outbound thì có thể bỏ 2 nhánh này)
        if action in ("create",) and getattr(view, "doc_direction", None) == "di":
            return Act.OUT_DRAFT_CREATE
        if action in ("update", "partial_update") and getattr(view, "doc_direction", None) == "di":
            return Act.OUT_DRAFT_EDIT

        # Không đoán mò cho inbound/khác → yêu cầu map rõ ràng
        return None

    # ---- DRF permission API ----
    def has_permission(self, request, view) -> bool:
        act = self._get_required_act(view, request.method, request=request)

        # Với request chi tiết (có id), defer sang object-level để RBAC có obj
        # giúp các rule động (_is_doc_assignee, ...) trong can() hoạt động chính xác.
        if self._is_detail_request(view):
            # Nếu không tìm thấy act và không phải SAFE_METHODS → chặn ngay
            if not act and request.method not in SAFE_METHODS:
                return False
            return True

        # Non-detail (list/create/...): cần quyết định ở đây
        if not act:
            return False
        return rbac_can(request.user, act, None)

    def has_object_permission(self, request, view, obj) -> bool:
        act = self._get_required_act(view, request.method, request=request, obj=obj)

        # Đọc object mà không map → coi như VIEW
        if not act and request.method in SAFE_METHODS:
            act = Act.VIEW
        if not act:
            return False

        return rbac_can(request.user, act, obj)
