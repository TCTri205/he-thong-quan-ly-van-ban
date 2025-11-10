# workflow/services/outbound_service.py
from dataclasses import dataclass
from typing import Any, Optional, List
from django.apps import apps
from django.db import transaction, IntegrityError
from django.db.models import Max
from django.utils import timezone
from .errors import PermissionDenied, InvalidTransition, ValidationError
from .rbac import can, Act
from .status_resolver import StatusResolver as SR
from .audit import audit_log
from .events import emit

def _doc_models():
    Doc = apps.get_model('documents', 'Document')
    DLog = apps.get_model('documents', 'DocumentWorkflowLog')
    Appro = apps.get_model('documents', 'DocumentApproval')
    Numbering = apps.get_model('documents', 'OutgoingNumbering')
    return Doc, DLog, Appro, Numbering

def _status_id(doc) -> int:
    sid = getattr(doc, "status_id", None)
    if not sid:
        raise ValidationError("Document.status_id trống.")
    return sid

def _fetch_status(status_id: Optional[int]):
    if not status_id:
        return None
    Status = apps.get_model("catalog", "DocumentStatus")
    if Status is None:
        return None
    return Status.objects.filter(pk=status_id).first()


def _insert_wf_log(doc, *, action: str, from_status_id: Optional[int], to_status_id: Optional[int], actor, comment=None, meta=None):
    _, DLog, _, _ = _doc_models()
    DLog.objects.create(
        document_id=doc.document_id,
        action=action,
        from_status=_fetch_status(from_status_id),
        to_status=_fetch_status(to_status_id),
        acted_by=actor,
        acted_at=timezone.now(),
        comment=comment,
        meta_json=meta,
    )

@dataclass
class OutboundService:
    actor: Any

    # ===== Khởi tạo dự thảo (đặt status DU_THAO) =====
    def touch_draft(self, doc: Any):
        if not can(self.actor, Act.OUT_DRAFT_CREATE, obj=doc):
            raise PermissionDenied("Không có quyền tạo/sửa dự thảo.")
        du_thao = SR.doc_status_id("DU_THAO")
        if getattr(doc, "status_id", None) != du_thao:
            from_id = getattr(doc, "status_id", None)
            doc.status_id = du_thao
            doc.doc_direction = 'du_thao'
            doc.save(update_fields=["status_id", "doc_direction"])
            _insert_wf_log(doc, action="DRAFT_INIT", from_status_id=from_id, to_status_id=du_thao, actor=self.actor)
            audit_log(actor=self.actor, action="DOC.OUT.DRAFT_CREATE", entity_type="document", entity_id=doc.document_id)

    # ===== Trình duyệt (DU_THAO -> TRINH_DUYET) =====
    def submit(self, doc: Any, note: Optional[str]=None):
        if not can(self.actor, Act.OUT_SUBMIT, obj=doc):
            raise PermissionDenied("Không có quyền trình duyệt.")
        from_id = _status_id(doc)
        to_id = SR.doc_status_id("TRINH_DUYET")
        with transaction.atomic():
            doc.status_id = to_id
            doc.save(update_fields=["status_id"])
            _insert_wf_log(doc, action="SUBMITTED", from_status_id=from_id, to_status_id=to_id, actor=self.actor, comment=note)
            audit_log(actor=self.actor, action="DOC.OUT.SUBMIT", entity_type="document", entity_id=doc.document_id,
                      before={"status_id":from_id}, after={"status_id":to_id,"note":note})
        emit("doc_out.submitted", {"document_id": doc.document_id})

    # ===== Trả lại (TRINH_DUYET -> TRA_LAI) =====
    def return_for_fix(self, doc: Any, reason: str):
        if not can(self.actor, Act.OUT_RETURN, obj=doc):
            raise PermissionDenied("Không có quyền trả lại.")
        from_id = _status_id(doc)
        to_id = SR.doc_status_id("TRA_LAI")
        with transaction.atomic():
            doc.status_id = to_id
            doc.save(update_fields=["status_id"])
            _insert_wf_log(doc, action="RETURNED", from_status_id=from_id, to_status_id=to_id, actor=self.actor, comment=reason)
            audit_log(actor=self.actor, action="DOC.OUT.RETURN", entity_type="document", entity_id=doc.document_id,
                      before={"status_id":from_id}, after={"status_id":to_id,"reason":reason})

    # ===== Phê duyệt (TRINH_DUYET -> PHE_DUYET) =====
    def approve(self, doc: Any, note: Optional[str]=None):
        if not can(self.actor, Act.OUT_APPROVE, obj=doc):
            raise PermissionDenied("Không có quyền phê duyệt.")
        from_id = _status_id(doc)
        to_id = SR.doc_status_id("PHE_DUYET")
        with transaction.atomic():
            doc.status_id = to_id
            doc.save(update_fields=["status_id"])
            _insert_wf_log(doc, action="APPROVED", from_status_id=from_id, to_status_id=to_id, actor=self.actor, comment=note)
            audit_log(actor=self.actor, action="DOC.OUT.APPROVE", entity_type="document", entity_id=doc.document_id,
                      before={"status_id":from_id}, after={"status_id":to_id})

    # ===== Ký số (PHE_DUYET -> KY_SO) =====
    def sign(self, doc: Any, signature_hash: Optional[str]=None, signer_position: Optional[str]=None):
        if not can(self.actor, Act.OUT_SIGN, obj=doc):
            raise PermissionDenied("Không có quyền ký.")
        from_id = _status_id(doc)
        to_id = SR.doc_status_id("KY_SO")
        with transaction.atomic():
            doc.status_id = to_id
            doc.signed_by = self.actor
            if signer_position:
                doc.signer_position = signer_position
            doc.signing_method = "ky_so"  # tuỳ cấu hình
            doc.save(update_fields=["status_id","signed_by","signer_position","signing_method"])

            _insert_wf_log(doc, action="SIGNED", from_status_id=from_id, to_status_id=to_id, actor=self.actor,
                           comment=None, meta={"sign_hash": signature_hash})
            audit_log(actor=self.actor, action="DOC.OUT.SIGN", entity_type="document", entity_id=doc.document_id,
                      before={"status_id":from_id}, after={"status_id":to_id,"signature_hash":signature_hash})

    # ===== Phát hành + CẤP SỐ ĐI (issue_number + issued_date) =====
    # def publish(self, doc: Any, *, issue_number: Optional[str]=None, issued_date=None, channels: Optional[List[str]]=None):
    #     if not can(self.actor, Act.OUT_PUBLISH, obj=doc):
    #         raise PermissionDenied("Không có quyền phát hành.")
    #     if doc.doc_direction not in ('di','du_thao'):
    #         raise ValidationError("Chỉ văn bản đi/dự thảo đã duyệt mới phát hành.")
    #     from_id = _status_id(doc)
    #     to_id = SR.doc_status_id("PHAT_HANH")

    #     # Sau publish, văn bản phải thoả ràng buộc 'di' ⇒ luôn đảm bảo có số/ngày
    #     if not issue_number:
    #         issue_number = self._allocate_issue_number()
    #     if not issued_date:
    #         issued_date = timezone.now().date()

    #     with transaction.atomic():
    #         doc.status_id = to_id
    #         doc.issue_number = issue_number
    #         doc.issued_date = issued_date
    #         if doc.doc_direction == 'du_thao':
    #             doc.doc_direction = 'di'
    #         doc.save(update_fields=["status_id","issue_number","issued_date","doc_direction"])

    #         _insert_wf_log(
    #             doc,
    #             action="PUBLISHED",
    #             from_status_id=from_id,
    #             to_status_id=to_id,
    #             actor=self.actor,
    #             meta={"channels": channels or [], "issue_number": issue_number}
    #         )
    #         audit_log(
    #             actor=self.actor,
    #             action="DOC.OUT.PUBLISH",
    #             entity_type="document",
    #             entity_id=doc.document_id,
    #             before={"status_id":from_id},
    #             after={"status_id":to_id,"issue_number":issue_number}
    #         )

    #     emit("doc_out.published", {"document_id": doc.document_id, "channels": channels or []})

# ... đầu file đã có: from django.db import transaction, IntegrityError
    def publish(
        self,
        doc: Any,
        *,
        issue_number: Optional[str] = None,
        issued_date=None,
        channels: Optional[List[str]] = None,
        prefix: Optional[str] = None,
        postfix: Optional[str] = None,
        year: Optional[int] = None,
    ):
        if not can(self.actor, Act.OUT_PUBLISH, obj=doc):
            raise PermissionDenied("Không có quyền phát hành.")
        if doc.doc_direction not in ('di','du_thao'):
            raise ValidationError("Chỉ văn bản đi/dự thảo đã duyệt mới phát hành.", code="WRONG_DIRECTION")

        from_id = _status_id(doc)
        to_id = SR.doc_status_id("PHAT_HANH")

        if not issued_date:
            issued_date = timezone.now().date()
        issue_year = year or getattr(issued_date, "year", None) or timezone.now().year
        numbering_entry = None
        if not issue_number:
            issue_number, numbering_entry = self._allocate_issue_number(
                year=issue_year,
                prefix=prefix,
                postfix=postfix,
            )

        try:
            with transaction.atomic():
                doc.status_id = to_id
                doc.issue_number = issue_number
                doc.issue_year = issue_year
                doc.issued_date = issued_date
                if doc.doc_direction == 'du_thao':
                    doc.doc_direction = 'di'
                doc.save(update_fields=["status_id","issue_number","issue_year","issued_date","doc_direction"])

                _insert_wf_log(
                    doc,
                    action="PUBLISHED",
                    from_status_id=from_id,
                    to_status_id=to_id,
                    actor=self.actor,
                    meta={"channels": channels or [], "issue_number": issue_number}
                )
                audit_log(
                    actor=self.actor,
                    action="DOC.OUT.PUBLISH",
                    entity_type="document",
                    entity_id=doc.document_id,
                    before={"status_id":from_id},
                    after={"status_id":to_id,"issue_number":issue_number}
                )
        except IntegrityError as e:
            # Vi phạm unique filtered issue_number khi doc_direction='di'
            raise ValidationError("Số văn bản đi đã tồn tại.", code="DUPLICATE_ISSUE_NUMBER") from e

        emit("doc_out.published", {"document_id": doc.document_id, "channels": channels or []})
        return doc, numbering_entry

    def _allocate_issue_number(self, *, year: Optional[int] = None, prefix: Optional[str] = None, postfix: Optional[str] = None):
        """
        Cấp số đi theo bảng outgoing_numbering (UNIQUE(year, seq)).
        Dùng aggregate để tránh cảnh báo Pylance và retry nếu đụng race-condition.
        """
        _, _, _, Numbering = _doc_models()
        now = timezone.now()
        target_year = year or now.year

        # Vòng lặp nhỏ để an toàn khi nhiều request phát hành song song
        while True:
            max_seq = Numbering.objects.filter(year=target_year).aggregate(m=Max("seq"))["m"] or 0
            next_seq = int(max_seq) + 1
            try:
                entry = Numbering.objects.create(
                    year=target_year,
                    seq=next_seq,
                    prefix=prefix,
                    postfix=postfix,
                    issued_by=self.actor,   # FK User (GUID)
                    issued_at=now,
                )
                issue_number = str(next_seq)
                if prefix:
                    issue_number = f"{issue_number}/{prefix}"
                if postfix:
                    issue_number = f"{issue_number}{postfix}"
                return issue_number, entry
            except IntegrityError:
                # Một tiến trình khác vừa chiếm seq này, thử lại
                continue

    # ===== Lưu trữ (PHAT_HANH -> LUU_TRU) =====
    def archive(self, doc: Any):
        if not can(self.actor, Act.OUT_ARCHIVE, obj=doc):
            raise PermissionDenied("Không có quyền lưu trữ.")
        from_id = _status_id(doc)
        to_id = SR.doc_status_id("LUU_TRU")
        with transaction.atomic():
            doc.status_id = to_id
            doc.save(update_fields=["status_id"])
            _insert_wf_log(doc, action="ARCHIVED", from_status_id=from_id, to_status_id=to_id, actor=self.actor)
            audit_log(actor=self.actor, action="DOC.OUT.ARCHIVE", entity_type="document", entity_id=doc.document_id,
                      before={"status_id":from_id}, after={"status_id":to_id})

    # ===== Huỷ phát hành (PHAT_HANH -> HUY_PHAT_HANH) =====
    def withdraw_publish(self, doc: Any, reason: str):
        if not can(self.actor, Act.OUT_WITHDRAW, obj=doc):
            raise PermissionDenied("Không có quyền huỷ phát hành.")
        from_id = _status_id(doc)
        to_id = SR.doc_status_id("HUY_PHAT_HANH")
        with transaction.atomic():
            doc.status_id = to_id
            doc.save(update_fields=["status_id"])
            _insert_wf_log(doc, action="PUB_WITHDRAWN", from_status_id=from_id, to_status_id=to_id, actor=self.actor, comment=reason)
            audit_log(actor=self.actor, action="DOC.OUT.WITHDRAW", entity_type="document", entity_id=doc.document_id,
                      before={"status_id":from_id}, after={"status_id":to_id,"reason":reason})
