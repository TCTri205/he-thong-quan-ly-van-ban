from __future__ import annotations

import re
from typing import Iterable

from django.http import JsonResponse

from corsheaders.conf import conf as cors_conf


class ContractCorsMiddleware:
    """
    Chặn Origin không nằm trong whitelist và trả về JSON 403 với code chuẩn.
    Đặt middleware này trước CorsMiddleware để fail-fast.
    """

    def __init__(self, get_response):
        self.get_response = get_response
        self._regexes = tuple(self._compile_regexes(cors_conf.CORS_ALLOWED_ORIGIN_REGEXES))

    def __call__(self, request):
        origin = request.META.get("HTTP_ORIGIN")
        if not origin:
            return self.get_response(request)

        if self._is_allowed(origin):
            return self.get_response(request)

        path = request.path or ""
        if path.startswith("/api/"):
            data = {
                "detail": "Origin không được phép truy cập API.",
                "code": "CORS_FORBIDDEN",
            }
            return JsonResponse(data, status=403)

        return self.get_response(request)

    def _is_allowed(self, origin: str) -> bool:
        if cors_conf.CORS_ALLOW_ALL_ORIGINS:
            return True
        if origin in cors_conf.CORS_ALLOWED_ORIGINS:
            return True
        clean_origin = origin.rstrip("/")
        if clean_origin in cors_conf.CORS_ALLOWED_ORIGINS:
            return True
        for regex in self._regexes:
            if regex.match(origin):
                return True
        return False

    @staticmethod
    def _compile_regexes(patterns: Iterable[object]):
        out = []
        for pattern in patterns:
            if hasattr(pattern, "match"):
                out.append(pattern)
            elif isinstance(pattern, str):
                try:
                    out.append(re.compile(pattern))
                except re.error:
                    continue
        return out
