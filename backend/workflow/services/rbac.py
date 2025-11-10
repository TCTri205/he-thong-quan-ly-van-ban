# workflow/services/rbac.py
from enum import StrEnum
from typing import Any, Iterable, Optional
from django.apps import apps

# ===== Vai trò cốt lõi =====
class Role(StrEnum):
    QT = "QT"  # Quản trị hệ thống
    VT = "VT"  # Văn thư
    CV = "CV"  # Chuyên viên
    LD = "LD"  # Lãnh đạo

# ===== Hành động tầng Service (map được sang permission code nếu dùng DB) =====
class Act(StrEnum):
    VIEW = "VIEW"
    REPORT_EXPORT = "REPORT_EXPORT"

    # VB đến
    IN_RECEIVE = "IN_RECEIVE"
    IN_REGISTER = "IN_REGISTER"
    IN_ASSIGN = "IN_ASSIGN"
    IN_START = "IN_START"
    IN_COMPLETE = "IN_COMPLETE"
    IN_ARCHIVE = "IN_ARCHIVE"
    IN_WITHDRAW = "IN_WITHDRAW"
    IN_LINK = "IN_LINK"
    IN_EDIT_NOTE = "IN_EDIT_NOTE"
    IN_IMPORT_EXPORT = "IN_IMPORT_EXPORT"

    # VB đi / Dự thảo
    OUT_DRAFT_CREATE = "OUT_DRAFT_CREATE"
    OUT_DRAFT_EDIT = "OUT_DRAFT_EDIT"
    OUT_SUBMIT = "OUT_SUBMIT"
    OUT_RETURN = "OUT_RETURN"
    OUT_APPROVE = "OUT_APPROVE"
    OUT_SIGN = "OUT_SIGN"
    OUT_ISSUE_NO = "OUT_ISSUE_NO"
    OUT_PUBLISH = "OUT_PUBLISH"
    OUT_WITHDRAW = "OUT_WITHDRAW"
    OUT_ARCHIVE = "OUT_ARCHIVE"

    # Hồ sơ
    CASE_CREATE = "CASE_CREATE"
    CASE_WAIT_ASSIGN = "CASE_WAIT_ASSIGN"
    CASE_ASSIGN = "CASE_ASSIGN"            # chỉ LD
    CASE_REASSIGN = "CASE_REASSIGN"        # chỉ LD
    CASE_START = "CASE_START"
    CASE_PAUSE = "CASE_PAUSE"
    CASE_RESUME = "CASE_RESUME"
    CASE_REQUEST_CLOSE = "CASE_REQUEST_CLOSE"
    CASE_APPROVE_CLOSE = "CASE_APPROVE_CLOSE"  # chỉ LD
    CASE_ARCHIVE = "CASE_ARCHIVE"
    CASE_DELETE = "CASE_DELETE"

    # Cấu hình/Hệ thống
    CONFIG_REGISTER_BOOK = "CONFIG_REGISTER_BOOK"
    CONFIG_NUMBERING_RULE = "CONFIG_NUMBERING_RULE"
    CONFIG_TEMPLATE = "CONFIG_TEMPLATE"
    CONFIG_WORKFLOW = "CONFIG_WORKFLOW"

# ===== Map hành động -> permission code (nếu kiểm DB) =====
PERM_CODE = {
    # VB đến
    Act.IN_RECEIVE: "DOC.IN.RECEIVE",
    Act.IN_REGISTER: "DOC.IN.REGISTER",
    Act.IN_ASSIGN: "DOC.IN.ASSIGN",
    Act.IN_START: "DOC.IN.START",
    Act.IN_COMPLETE: "DOC.IN.COMPLETE",
    Act.IN_ARCHIVE: "DOC.IN.ARCHIVE",
    Act.IN_WITHDRAW: "DOC.IN.WITHDRAW",
    Act.IN_LINK: "DOC.LINK",
    Act.IN_EDIT_NOTE: "DOC.IN.EDIT_NOTE",
    Act.IN_IMPORT_EXPORT: "DOC.IN.IMPORT_EXPORT",

    # VB đi
    Act.OUT_DRAFT_CREATE: "DOC.OUT.DRAFT_CREATE",
    Act.OUT_DRAFT_EDIT: "DOC.OUT.DRAFT_EDIT",
    Act.OUT_SUBMIT: "DOC.OUT.SUBMIT",
    Act.OUT_RETURN: "DOC.OUT.RETURN",
    Act.OUT_APPROVE: "DOC.OUT.APPROVE",
    Act.OUT_SIGN: "DOC.OUT.SIGN",
    Act.OUT_ISSUE_NO: "DOC.OUT.ISSUE_NO",
    Act.OUT_PUBLISH: "DOC.OUT.PUBLISH",
    Act.OUT_WITHDRAW: "DOC.OUT.WITHDRAW",
    Act.OUT_ARCHIVE: "DOC.OUT.ARCHIVE",

    # CASE
    Act.CASE_CREATE: "CASE.CREATE",
    Act.CASE_WAIT_ASSIGN: "CASE.WAIT_ASSIGN",
    Act.CASE_ASSIGN: "CASE.ASSIGN",
    Act.CASE_REASSIGN: "CASE.REASSIGN",
    Act.CASE_START: "CASE.START",
    Act.CASE_PAUSE: "CASE.PAUSE",
    Act.CASE_RESUME: "CASE.RESUME",
    Act.CASE_REQUEST_CLOSE: "CASE.REQUEST_CLOSE",
    Act.CASE_APPROVE_CLOSE: "CASE.APPROVE_CLOSE",
    Act.CASE_ARCHIVE: "CASE.ARCHIVE",
    Act.CASE_DELETE: "CASE.DELETE",

    # Config
    Act.CONFIG_REGISTER_BOOK: "CONFIG.REGISTER_BOOK",
    Act.CONFIG_NUMBERING_RULE: "CONFIG.NUMBERING_RULE",
    Act.CONFIG_TEMPLATE: "CONFIG.TEMPLATE",
    Act.CONFIG_WORKFLOW: "CONFIG.WORKFLOW",

    # Chung
    Act.VIEW: "COMMON.VIEW",
    Act.REPORT_EXPORT: "COMMON.REPORT_EXPORT",
}

# ===== Quyền tĩnh mặc định theo vai trò =====
ROLE_ACTIONS = {
    Role.QT: {Act.VIEW, Act.REPORT_EXPORT, Act.OUT_PUBLISH},  # QT chỉ xem/giám sát (thêm quyền xem dispatch)
    Role.VT: {
        Act.VIEW, Act.REPORT_EXPORT,
        Act.IN_RECEIVE, Act.IN_REGISTER, Act.IN_ASSIGN, Act.IN_IMPORT_EXPORT,
        Act.IN_EDIT_NOTE, Act.IN_LINK, Act.IN_ARCHIVE, Act.IN_WITHDRAW,
        Act.OUT_ISSUE_NO, Act.OUT_PUBLISH, Act.OUT_WITHDRAW, Act.OUT_ARCHIVE,
        Act.CASE_CREATE, Act.CASE_WAIT_ASSIGN,
        Act.CONFIG_REGISTER_BOOK, Act.CONFIG_NUMBERING_RULE, Act.CONFIG_TEMPLATE,
    },
    Role.CV: {
        Act.VIEW, Act.REPORT_EXPORT,
        Act.IN_START, Act.IN_COMPLETE, Act.IN_EDIT_NOTE, Act.IN_LINK,
        Act.OUT_DRAFT_CREATE, Act.OUT_DRAFT_EDIT, Act.OUT_SUBMIT,
        Act.CASE_CREATE, Act.CASE_WAIT_ASSIGN, Act.CASE_START,
        Act.CASE_PAUSE, Act.CASE_RESUME, Act.CASE_REQUEST_CLOSE,
    },
    Role.LD: {
        Act.VIEW, Act.REPORT_EXPORT,
        Act.IN_ASSIGN, Act.IN_COMPLETE,
        Act.OUT_RETURN, Act.OUT_APPROVE, Act.OUT_SIGN,
        Act.CASE_CREATE, Act.CASE_WAIT_ASSIGN, Act.CASE_ASSIGN, Act.CASE_REASSIGN,
        Act.CASE_START, Act.CASE_PAUSE, Act.CASE_RESUME, Act.CASE_REQUEST_CLOSE, Act.CASE_APPROVE_CLOSE,
    },
}

# Cho phép mapping tên role trong DB (QUAN_TRI, VAN_THU, ...) về code QT/VT/...
ROLE_NAME_ALIASES = {
    "QUAN_TRI": Role.QT.value,
    "QT": Role.QT.value,
    "VAN_THU": Role.VT.value,
    "VT": Role.VT.value,
    "CHUYEN_VIEN": Role.CV.value,
    "CV": Role.CV.value,
    "LANH_DAO": Role.LD.value,
    "LD": Role.LD.value,
}

# QT (system admin) thường cần đầy đủ quyền cấu hình — mở rộng thêm
ROLE_ACTIONS[Role.QT].update({
    Act.CONFIG_REGISTER_BOOK,
    Act.CONFIG_NUMBERING_RULE,
    Act.CONFIG_TEMPLATE,
    Act.CONFIG_WORKFLOW,
})

# ===== Helpers lấy Role/Permission từ DB — dùng values_list để tránh cảnh báo Pylance =====
def _get_model(app_label: str, model_name: str):
    try:
        return apps.get_model(app_label, model_name)
    except LookupError:
        return None

def _get_user_role_names(user) -> Iterable[str]:
    """
    Trả về danh sách tên role (UPPER) từ users.role_id (nếu có) và bảng user_roles (nếu có).
    """
    RoleModel = _get_model('accounts', 'Role')
    if RoleModel is None:
        return []

    names = []

    # 1) users.role_id (vai trò chính) — nếu schema có cột này
    rid = getattr(user, "role_id", None)
    if rid:
        name = RoleModel.objects.filter(role_id=rid).values_list("name", flat=True).first()
        if name:
            names.append(name)

    # 2) user_roles (đa vai) — nếu có model
    UserRole = _get_model('accounts', 'UserRole')
    if UserRole is not None:
        role_ids = list(
            UserRole.objects.filter(user_id=getattr(user, "user_id", None)).values_list("role_id", flat=True)
        )
        if role_ids:
            extra = list(RoleModel.objects.filter(role_id__in=role_ids).values_list("name", flat=True))
            names.extend(extra)

    # Chuẩn hoá UPPER & alias
    normalized = []
    for raw in dict.fromkeys(names):
        if not raw:
            continue
        upper = raw.upper()
        normalized.append(upper)
        alias = ROLE_NAME_ALIASES.get(upper)
        if alias:
            normalized.append(alias.upper())

    return list(dict.fromkeys(normalized))

def _has_permission_db(user, act: Act) -> Optional[bool]:
    """
    Kiểm tra quyền dựa vào bảng permissions/role_permissions nếu có.
    Trả None nếu không thể xác định (chưa cấu hình code hoặc bảng không tồn tại) để fallback sang ROLE_ACTIONS.
    """
    Permission = _get_model('accounts', 'Permission')
    RolePermission = _get_model('accounts', 'RolePermission')
    RoleModel = _get_model('accounts', 'Role')
    if Permission is None or RolePermission is None or RoleModel is None:
        return None

    code = PERM_CODE.get(act)
    if not code:
        return None

    perm_id = Permission.objects.filter(code=code).values_list("permission_id", flat=True).first()
    if perm_id is None:
        return None  # chưa cấu hình permission code trong DB

    role_names = _get_user_role_names(user)
    if not role_names:
        return False

    role_ids = list(RoleModel.objects.filter(name__in=role_names).values_list("role_id", flat=True))
    if not role_ids:
        return False

    return RolePermission.objects.filter(role_id__in=role_ids, permission_id=perm_id).exists()

def get_single_role_code(user) -> Optional[str]:
    """
    Suy ra mã QT/VT/CV/LD từ tên role (ưu tiên users.role_id).
    Fallback: is_superuser => QT.
    """
    names = _get_user_role_names(user)
    for r in (Role.QT, Role.VT, Role.CV, Role.LD):
        if r.value in names:
            return r.value
    if getattr(user, "is_superuser", False):
        return Role.QT.value
    return None

# ===== Quy tắc động mức đối tượng (assignee) =====
def _is_doc_assignee(user, doc) -> bool:
    Assign = _get_model('documents', 'DocumentAssignment')
    if Assign is None or doc is None:
        return False
    return Assign.objects.filter(document_id=getattr(doc, "document_id", None),
                                 user_id=getattr(user, "user_id", None),
                                 role_on_doc='assignee').exists()

def _is_case_assignee(user, case) -> bool:
    Part = _get_model('cases', 'CaseParticipant')
    if Part is None or case is None:
        return False
    return Part.objects.filter(case_id=getattr(case, "case_id", None),
                               user_id=getattr(user, "user_id", None),
                               role_on_case='assignee').exists()

# ===== Entry chính: kiểm quyền =====
def can(user, act: Act, obj=None) -> bool:
    # 0) Quy tắc then chốt: chỉ LD được CASE_ASSIGN/REASSIGN/APPROVE_CLOSE
    if act in (Act.CASE_ASSIGN, Act.CASE_REASSIGN, Act.CASE_APPROVE_CLOSE):
        return get_single_role_code(user) == Role.LD.value

    # 1) Ưu tiên kiểm DB nếu có
    db_has = _has_permission_db(user, act)
    if db_has is not None:
        return bool(db_has)

    # 2) Fallback ma trận tĩnh
    role_code = get_single_role_code(user)
    if not role_code:
        return False
    allowed = ROLE_ACTIONS.get(Role(role_code), set())
    if act not in allowed:
        return False

    # 3) Quy tắc động theo đối tượng
    if act == Act.IN_START:
        return _is_doc_assignee(user, obj)
    if act == Act.IN_COMPLETE:
        # CV phải là assignee; LD được phép chỉ đạo hoàn tất
        return _is_doc_assignee(user, obj) or role_code == Role.LD.value
    if act == Act.CASE_START:
        return _is_case_assignee(user, obj)

    return True
