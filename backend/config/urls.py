# config/urls.py
"""
URL configuration for backend (API-only).

- Admin
- Auth (JWT): /api/v1/auth/jwt/create, /api/v1/auth/jwt/refresh, /api/v1/auth/jwt/verify, /api/v1/auth/me
  (giữ redirect tạm thời cho /api/v1/auth/login và /api/v1/auth/refresh)
- OpenAPI/Swagger (drf-spectacular + core.docs):
    /api/v1/schema/  (JSON/YAML, content-negotiated)
    /api/v1/docs/    (Swagger UI)
    /api/v1/redoc/   (ReDoc)
- API v1 (DRF Router):
    /api/v1/inbound-docs/...
    /api/v1/outbound-docs/...
    /api/v1/cases/...
"""

from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from django.views.generic import RedirectView
from rest_framework.routers import DefaultRouter

from cases.views import CaseViewSet, CaseTaskDetailView, CommentListCreateView, CommentDetailView

# ===== Schema & Docs (ưu tiên ở đầu để 'schema' trỏ tới SchemaViewWithServers) =====
from core.docs import urlpatterns as docs_urls  # cung cấp /api/v1/schema|docs|redoc

# ===== DRF Router (v1) =====
router_v1 = DefaultRouter()  # trailing slash ON (mặc định)

def _register_v1_routes() -> None:
    """
    Đăng ký ViewSet cho API v1.
    Import bên trong hàm để tránh import nặng ở module-level và hạn chế vòng lặp.
    """
    from documents.views import DocumentViewSet, OrganizationViewSet, DispatchViewSet
    from documents.views_inbound import InboundDocumentViewSet
    from documents.views_outbound import OutboundDocumentViewSet
    from documents.views_config import (
        RegisterBookViewSet,
        NumberingRuleViewSet,
        DocumentTemplateViewSet,
    )
    from workflow.views import WorkflowTransitionViewSet

    router_v1.register(r"documents", DocumentViewSet, basename="documents")
    router_v1.register(r"inbound-docs", InboundDocumentViewSet, basename="inbound-docs")
    router_v1.register(r"outbound-docs", OutboundDocumentViewSet, basename="outbound-docs")
    router_v1.register(r"organizations", OrganizationViewSet, basename="organizations")
    router_v1.register(r"dispatches", DispatchViewSet, basename="dispatches")
    router_v1.register(r"cases", CaseViewSet, basename="cases")
    router_v1.register(r"register-books", RegisterBookViewSet, basename="register-books")
    router_v1.register(r"numbering-rules", NumberingRuleViewSet, basename="numbering-rules")
    router_v1.register(r"document-templates", DocumentTemplateViewSet, basename="document-templates")
    router_v1.register(r"workflow-transitions", WorkflowTransitionViewSet, basename="workflow-transitions")

_register_v1_routes()

urlpatterns = [
    # ---- OpenAPI/Swagger/Redoc ----
    *docs_urls,  # /api/v1/schema/ (name="schema"), /api/v1/docs/, /api/v1/redoc/

    # ---- Admin ----
    path("admin/", admin.site.urls),

    # ---- Auth (JWT) ----
    path("api/v1/", include("accounts.urls")),
    # Redirect tương thích đường dẫn cũ (tùy chọn; có thể bỏ khi FE đã cập nhật)
    path("api/v1/auth/login",   RedirectView.as_view(url="/api/v1/auth/jwt/create/",  permanent=False)),
    path("api/v1/auth/refresh", RedirectView.as_view(url="/api/v1/auth/jwt/refresh/", permanent=False)),

    # ---- API v1 (domain routers) ----
    path("api/v1/", include(router_v1.urls)),
    path("api/v1/case-tasks/<int:pk>/", CaseTaskDetailView.as_view(), name="case-task-detail"),
    path("api/v1/comments/", CommentListCreateView.as_view(), name="comment-list"),
    path("api/v1/comments/<int:pk>/", CommentDetailView.as_view(), name="comment-detail"),

    # Trang chủ → Swagger UI (tiện dev)
    path("", RedirectView.as_view(url="/api/v1/docs/", permanent=False)),
]

# Phục vụ MEDIA/STATIC trong môi trường dev
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)

# (Tuỳ chọn) Debug Toolbar
# if settings.DEBUG and "debug_toolbar" in settings.INSTALLED_APPS:
#     import debug_toolbar
#     urlpatterns += [path("__debug__/", include(debug_toolbar.urls))]
