# accounts/serializers.py
from __future__ import annotations

from typing import Any, Dict
from django.contrib.auth import get_user_model
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer


User = get_user_model()


def _display_full_name(u: Any) -> str:
    """
    Lấy full_name an toàn:
    - Ưu tiên thuộc tính u.full_name nếu có.
    - Fallback u.get_full_name() nếu có.
    - Fallback ghép first_name + last_name.
    - Cuối cùng rơi về username.
    """
    v = getattr(u, "full_name", None)
    if v:
        return str(v)

    # Thử method get_full_name()
    try:
        v2 = u.get_full_name()  # type: ignore[attr-defined]
        if v2:
            return str(v2)
    except Exception:
        pass

    fn = str(getattr(u, "first_name", "") or "")
    ln = str(getattr(u, "last_name", "") or "")
    name = (fn + " " + ln).strip()
    return name or str(getattr(u, "username", "") or "")


class UserSlimSerializer(serializers.ModelSerializer):
    """
    Dùng cho /auth/me và có thể tái sử dụng ở các nơi cần user nhẹ.
    """
    id = serializers.IntegerField(read_only=True)
    full_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ("id", "username", "email", "full_name")

    def get_full_name(self, obj: Any) -> str:  # noqa: D401
        # Trả về full name hiển thị thân thiện
        return _display_full_name(obj)


class TokenObtainPairWithProfileSerializer(TokenObtainPairSerializer):
    """
    - Nhúng claims nhẹ vào cả Refresh/Access token (SimpleJWT sẽ sao chép sang access).
    - Đồng thời trả về thông tin user rút gọn ở response để UI dùng ngay.
    """

    @classmethod
    def get_token(cls, user: Any):
        token = super().get_token(user)
        # ===== Custom claims nhẹ (không chứa thông tin nhạy cảm) =====
        token["username"] = getattr(user, "username", "")
        token["full_name"] = _display_full_name(user)
        return token

    def validate(self, attrs: Dict[str, Any]) -> Dict[str, Any]:
        data = super().validate(attrs)
        # Thêm block "user" để UI không cần gọi thêm /auth/me ngay sau khi login
        data["user"] = UserSlimSerializer(self.user).data  # type: ignore[attr-defined]
        return data


__all__ = [
    "UserSlimSerializer",
    "TokenObtainPairWithProfileSerializer",
]
