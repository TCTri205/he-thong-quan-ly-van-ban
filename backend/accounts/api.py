# accounts/api.py
from __future__ import annotations

from typing import Any
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
    TokenVerifyView,
)
from drf_spectacular.utils import extend_schema, OpenApiResponse

from .serializers import (
    TokenObtainPairWithProfileSerializer,
    UserSlimSerializer,
)

User = get_user_model()


class JWTCreateView(TokenObtainPairView):
    """
    Phát hành access/refresh token.
    Không dùng blacklist theo yêu cầu; logout = xoá token phía client.
    """
    permission_classes = [AllowAny]
    serializer_class = TokenObtainPairWithProfileSerializer

    @extend_schema(
        tags=["Auth"],
        operation_id="auth_jwt_create",
        request=TokenObtainPairWithProfileSerializer,
        responses={
            200: OpenApiResponse(
                description="JWT issued (access/refresh) + user info",
                response=TokenObtainPairWithProfileSerializer,
            ),
            401: OpenApiResponse(description="Invalid credentials"),
        },
    )
    def post(self, request, *args, **kwargs):
        return super().post(request, *args, **kwargs)


class JWTRefreshView(TokenRefreshView):
    permission_classes = [AllowAny]

    @extend_schema(
        tags=["Auth"],
        operation_id="auth_jwt_refresh",
        responses={200: OpenApiResponse(description="New access token issued")},
    )
    def post(self, request, *args, **kwargs):
        return super().post(request, *args, **kwargs)


class JWTVerifyView(TokenVerifyView):
    permission_classes = [AllowAny]

    @extend_schema(
        tags=["Auth"],
        operation_id="auth_jwt_verify",
        responses={200: OpenApiResponse(description="Token is valid")},
    )
    def post(self, request, *args, **kwargs):
        return super().post(request, *args, **kwargs)


class MeView(APIView):
    """
    Trả thông tin user tối thiểu cho UI (đã đăng nhập).
    - Thiếu/invalid token => 401 do IsAuthenticated.
    - Không đụng tới Service/RBAC; chỉ trả profile cơ bản.
    """
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=["Auth"],
        operation_id="auth_me",
        responses={200: UserSlimSerializer},
    )
    def get(self, request, *args: Any, **kwargs: Any) -> Response:
        return Response(UserSlimSerializer(request.user).data, status=status.HTTP_200_OK)
