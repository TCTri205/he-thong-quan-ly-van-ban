# workflow/services/inbound_service.py
from dataclasses import dataclass
from typing import Any, Iterable, Optional
from django.apps import apps
from django.db import transaction
from django.utils import timezone

from .errors import PermissionDenied, InvalidTransition, ValidationError
from .rbac import can, Act
from .status_resolver import StatusResolver as SR
from .audit import audit_log
from .events import emit

def _doc_models():
    Doc = apps.get_model('documents', 'Document')
    DLog = apps.get_model('documents', 'DocumentWorkflowLog')
    Assign = apps.get_model('documents', 'DocumentAssignment')
    return Doc, DLog, Assign

def _status_id(doc) -> int:
    sid = getattr(doc, "status_id", None)
    if not sid:
        raise ValidationError("Document.status_id trống.")
    return sid

def _insert_wf_log(doc, *, action: str, from_status_id: Optional[int], to_status_id: Optional[int], actor, comment=None, meta=None):
    _, DLog, _ = _doc_models()
    DLog.objects.create(
        document_id=doc.document_id,
        action=action,
        from_status=from_status_id,
        to_status=to_status_id,
        acted_by=actor,
        acted_at=timezone.now(),
        comment=comment,
        meta_json=meta,
    )

@dataclass
class InboundService:
    actor: Any  # accounts.User

    # ===== Tiếp nhận (đưa về TIEP_NHAN nếu cần) =====
    def receive_intake(self, doc: Any, note: Optional[str]=None):
        if not can(self.actor, Act.IN_RECEIVE, obj=doc):
            raise PermissionDenied("Không có quyền tiếp nhận/scan/nhập.")
        tiep_nhan = SR.doc_status_id("TIEP_NHAN")
        if getattr(doc, "status_id", None) != tiep_nhan:
            from_id = getattr(doc, "status_id", None)
            doc.status_id = tiep_nhan
            doc.save(update_fields=["status_id"])
            _insert_wf_log(doc, action="RECEIVED", from_status_id=from_id, to_status_id=tiep_nhan, actor=self.actor, comment=note)
            audit_log(actor=self.actor, action="DOC.IN.RECEIVED", entity_type="document", entity_id=doc.document_id, after={"to":"TIEP_NHAN","note":note})

    # ===== Đăng ký (TIEP_NHAN -> DANG_KY) =====
    def register(self, doc: Any, *, received_number: int, received_date, sender: str):
        if not can(self.actor, Act.IN_REGISTER, obj=doc):
            raise PermissionDenied("Không có quyền gán số đến/đăng ký.")
        if doc.doc_direction != 'den':
            raise ValidationError("Chỉ văn bản 'den' mới đăng ký số đến.")
        from_id = _status_id(doc)
        dang_ky = SR.doc_status_id("DANG_KY")

        with transaction.atomic():
            doc.received_number = received_number
            doc.received_date = received_date
            doc.sender = sender
            doc.status_id = dang_ky
            doc.received_by = self.actor
            doc.save()

            _insert_wf_log(doc, action="REGISTERED", from_status_id=from_id, to_status_id=dang_ky, actor=self.actor)
            audit_log(actor=self.actor, action="DOC.IN.REGISTER", entity_type="document", entity_id=doc.document_id,
                      before={"status_id":from_id}, after={"status_id":dang_ky,"received_number":received_number})

    # ===== Phân công (DANG_KY -> PHAN_CONG) =====
    def assign(self, doc: Any, assignees: Iterable[Any], *, instruction: Optional[str]=None, due_at=None):
        if not can(self.actor, Act.IN_ASSIGN, obj=doc):
            raise PermissionDenied("Không có quyền phân luồng/chuyển xử lý VB đến.")
        from_id = _status_id(doc)
        phan_cong = SR.doc_status_id("PHAN_CONG")

        Doc, _, Assign = _doc_models()
        with transaction.atomic():
            # chuyển trạng thái
            Doc.objects.filter(pk=doc.pk).update(status_id=phan_cong)
            # ghi phân công
            now = timezone.now()
            rows = []
            for u in assignees:
                rows.append(Assign(
                    document_id=doc.document_id,
                    user_id=u.user_id,
                    role_on_doc='assignee',
                    assigned_by=self.actor.user_id,
                    assigned_at=now,
                    due_at=due_at,
                    is_owner=False,
                ))
            if rows:
                Assign.objects.bulk_create(rows, ignore_conflicts=True)

            _insert_wf_log(doc, action="ASSIGNED", from_status_id=from_id, to_status_id=phan_cong,
                           actor=self.actor, comment=instruction, meta={"assignees":[str(u.user_id) for u in assignees], "due_at": str(due_at) if due_at else None})
            audit_log(actor=self.actor, action="DOC.IN.ASSIGN", entity_type="document", entity_id=doc.document_id,
                      after={"to":"PHAN_CONG","assignees":[str(u.user_id) for u in assignees],"due_at": str(due_at) if due_at else None})

            doc.status_id = phan_cong  # sync instance
        emit("doc_in.assigned", {"document_id": doc.document_id, "assignees":[str(u.user_id) for u in assignees]})

    # ===== Bắt đầu xử lý (PHAN_CONG -> DANG_XU_LY) =====
    def start_processing(self, doc: Any):
        if not can(self.actor, Act.IN_START, obj=doc):
            raise PermissionDenied("Chỉ người được giao mới được bắt đầu xử lý.")
        from_id = _status_id(doc)
        dang_xl = SR.doc_status_id("DANG_XU_LY")
        Doc, _, _ = _doc_models()

        with transaction.atomic():
            Doc.objects.filter(pk=doc.pk).update(status_id=dang_xl)
            _insert_wf_log(doc, action="PROCESSING_STARTED", from_status_id=from_id, to_status_id=dang_xl, actor=self.actor)
            audit_log(actor=self.actor, action="DOC.IN.START", entity_type="document", entity_id=doc.document_id,
                      before={"status_id":from_id}, after={"status_id":dang_xl})
            doc.status_id = dang_xl
        emit("doc_in.start", {"document_id": doc.document_id, "by": str(self.actor.user_id)})

    # ===== Hoàn tất (DANG_XU_LY -> HOAN_TAT) =====
    def complete(self, doc: Any, result_note: Optional[str]=None):
        if not can(self.actor, Act.IN_COMPLETE, obj=doc):
            raise PermissionDenied("Không có quyền hoàn tất.")
        from_id = _status_id(doc)
        hoan_tat = SR.doc_status_id("HOAN_TAT")
        Doc, _, _ = _doc_models()

        with transaction.atomic():
            Doc.objects.filter(pk=doc.pk).update(status_id=hoan_tat)
            _insert_wf_log(doc, action="COMPLETED", from_status_id=from_id, to_status_id=hoan_tat, actor=self.actor, comment=result_note)
            audit_log(actor=self.actor, action="DOC.IN.COMPLETE", entity_type="document", entity_id=doc.document_id,
                      before={"status_id":from_id}, after={"status_id":hoan_tat,"note":result_note})
            doc.status_id = hoan_tat
        emit("doc_in.completed", {"document_id": doc.document_id})

    # ===== Lưu trữ (HOAN_TAT -> LUU_TRU) =====
    def archive(self, doc: Any, reason: Optional[str]=None):
        if not can(self.actor, Act.IN_ARCHIVE, obj=doc):
            raise PermissionDenied("Không có quyền lưu trữ.")
        from_id = _status_id(doc)
        luu_tru = SR.doc_status_id("LUU_TRU")
        Doc, _, _ = _doc_models()
        with transaction.atomic():
            Doc.objects.filter(pk=doc.pk).update(status_id=luu_tru)
            _insert_wf_log(doc, action="ARCHIVED", from_status_id=from_id, to_status_id=luu_tru, actor=self.actor, comment=reason)
            audit_log(actor=self.actor, action="DOC.IN.ARCHIVE", entity_type="document", entity_id=doc.document_id,
                      before={"status_id":from_id}, after={"status_id":luu_tru,"reason":reason})
            doc.status_id = luu_tru

    # ===== Thu hồi (DANG_KY|PHAN_CONG|DANG_XU_LY -> THU_HOI) =====
    def withdraw(self, doc: Any, reason: str):
        if not can(self.actor, Act.IN_WITHDRAW, obj=doc):
            raise PermissionDenied("Không có quyền thu hồi.")
        from_id = _status_id(doc)
        thu_hoi = SR.doc_status_id("THU_HOI")
        valid_from = {SR.doc_status_id("DANG_KY"), SR.doc_status_id("PHAN_CONG"), SR.doc_status_id("DANG_XU_LY")}
        if from_id not in valid_from:
            raise InvalidTransition("Chỉ thu hồi khi đang ở DANG_KY/PHAN_CONG/DANG_XU_LY.")
        Doc, _, _ = _doc_models()
        with transaction.atomic():
            Doc.objects.filter(pk=doc.pk).update(status_id=thu_hoi)
            _insert_wf_log(doc, action="WITHDRAWN", from_status_id=from_id, to_status_id=thu_hoi, actor=self.actor, comment=reason)
            audit_log(actor=self.actor, action="DOC.IN.WITHDRAW", entity_type="document", entity_id=doc.document_id,
                      before={"status_id":from_id}, after={"status_id":thu_hoi,"reason":reason})
            doc.status_id = thu_hoi
