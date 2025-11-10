# accounts/urls.py
from __future__ import annotations

from django.urls import path
from .api import JWTCreateView, JWTRefreshView, JWTVerifyView, MeView

app_name = "accounts"

urlpatterns = [
    # Dùng hậu tố "/" chuẩn DRF; nếu client gọi không có "/", Django sẽ redirect (APPEND_SLASH=True)
    path("auth/jwt/create/",  JWTCreateView.as_view(),  name="jwt-create"),
    path("auth/jwt/refresh/", JWTRefreshView.as_view(), name="jwt-refresh"),
    path("auth/jwt/verify/",  JWTVerifyView.as_view(),  name="jwt-verify"),
    path("auth/me/",          MeView.as_view(),         name="auth-me"),
]
