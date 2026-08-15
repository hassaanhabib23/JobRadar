"""Auth, profile and locations.

Every authenticated view here derives its object from `request.user` and nothing
else. No endpoint accepts a user id from the client.
"""

from __future__ import annotations

import contextlib
from datetime import timedelta
from typing import Any, cast

from django.conf import settings
from drf_spectacular.utils import extend_schema
from rest_framework import generics, status
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer, TokenRefreshSerializer
from rest_framework_simplejwt.tokens import RefreshToken

from scoring import locations as location_catalogue
from users.models import Profile
from users.serializers import (
    LocationSerializer,
    PasswordChangeSerializer,
    ProfileSerializer,
    RefreshRequestSerializer,
    RegisterSerializer,
    ScorePreviewRequestSerializer,
    ScorePreviewResponseSerializer,
    UserSerializer,
)


def _user(request: Request) -> Any:
    """The authenticated user.

    `IsAuthenticated` guarantees this is a concrete `User` rather than
    `AnonymousUser`, but the type checker cannot see the connection between a
    permission class and the request it guards.
    """
    return request.user


def _payload(request: Request) -> dict[str, Any]:
    """Request body as a mapping — a JSON array body is not a valid payload here."""
    return request.data if isinstance(request.data, dict) else {}


def _set_refresh_cookie(response: Response, refresh: str) -> None:
    """Store the refresh token where JavaScript cannot read it.

    httpOnly means an injected script cannot exfiltrate it, which is the whole
    reason it does not go in localStorage. `SameSite=Lax` blocks it on
    cross-site form posts while still allowing normal navigation.
    """
    response.set_cookie(
        settings.JWT_REFRESH_COOKIE,
        refresh,
        httponly=True,
        secure=settings.JWT_REFRESH_COOKIE_SECURE,
        samesite=cast(Any, settings.JWT_REFRESH_COOKIE_SAMESITE),
        path=settings.JWT_REFRESH_COOKIE_PATH,
        max_age=int(cast(timedelta, settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"]).total_seconds()),
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        settings.JWT_REFRESH_COOKIE,
        path=settings.JWT_REFRESH_COOKIE_PATH,
        samesite=cast(Any, settings.JWT_REFRESH_COOKIE_SAMESITE),
    )


def _tokens_for(user: Any) -> tuple[str, str]:
    refresh = RefreshToken.for_user(user)
    return str(refresh.access_token), str(refresh)


class RegisterView(APIView):
    """Create the account, its profile, and hand back tokens.

    Registration returns tokens so the user lands straight in the app rather than
    being bounced to a login form they just filled in.
    """

    authentication_classes: list[Any] = []
    permission_classes = [AllowAny]
    throttle_scope = "register"

    @extend_schema(
        request=RegisterSerializer,
        responses={201: UserSerializer},
        operation_id="auth_register",
    )
    def post(self, request: Request) -> Response:
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()

        access, refresh = _tokens_for(user)
        response = Response(
            {"user": UserSerializer(user).data, "access": access},
            status=status.HTTP_201_CREATED,
        )
        _set_refresh_cookie(response, refresh)
        return response


class LoginView(APIView):
    authentication_classes: list[Any] = []
    permission_classes = [AllowAny]
    throttle_scope = "login"

    @extend_schema(
        request=TokenObtainPairSerializer,
        responses={200: dict},
        operation_id="auth_login",
        description=(
            "Returns an access token in the body and a refresh token in an httpOnly cookie."
        ),
    )
    def post(self, request: Request) -> Response:
        serializer = TokenObtainPairSerializer(data=request.data)
        try:
            serializer.is_valid(raise_exception=True)
        except Exception:
            # Deliberately identical for an unknown email and a wrong password —
            # distinguishing them tells an attacker which accounts exist.
            return Response(
                {"detail": "No active account found with the given credentials."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        tokens = serializer.validated_data
        response = Response(
            {"user": UserSerializer(serializer.user).data, "access": str(tokens["access"])}
        )
        _set_refresh_cookie(response, str(tokens["refresh"]))
        return response


class RefreshView(APIView):
    """Mint a new access token from the refresh cookie.

    The token is read from the cookie, falling back to the body so the endpoint
    is still usable from a non-browser client.
    """

    authentication_classes: list[Any] = []
    permission_classes = [AllowAny]

    @extend_schema(
        request=RefreshRequestSerializer,
        responses={200: dict},
        operation_id="auth_refresh",
    )
    def post(self, request: Request) -> Response:
        raw = request.COOKIES.get(settings.JWT_REFRESH_COOKIE) or _payload(request).get("refresh")
        if not raw:
            return Response(
                {"detail": "No refresh token provided."}, status=status.HTTP_401_UNAUTHORIZED
            )

        # TokenRefreshSerializer already honours ROTATE_REFRESH_TOKENS and
        # BLACKLIST_AFTER_ROTATION, so rotation is not reimplemented here.
        serializer = TokenRefreshSerializer(data={"refresh": raw})
        try:
            serializer.is_valid(raise_exception=True)
        except (TokenError, InvalidToken, DRFValidationError):
            response = Response(
                {"detail": "Token is invalid or expired."}, status=status.HTTP_401_UNAUTHORIZED
            )
            # A dead cookie is worse than none: it makes every silent refresh
            # attempt fail on a token that can never work again.
            _clear_refresh_cookie(response)
            return response

        data = serializer.validated_data
        response = Response({"access": str(data["access"])})
        if data.get("refresh"):
            _set_refresh_cookie(response, str(data["refresh"]))
        return response


class LogoutView(APIView):
    """Blacklist the refresh token and clear the cookie."""

    permission_classes = [IsAuthenticated]

    @extend_schema(request=None, responses={204: None}, operation_id="auth_logout")
    def post(self, request: Request) -> Response:
        raw = request.COOKIES.get(settings.JWT_REFRESH_COOKIE) or _payload(request).get("refresh")
        if raw:
            # Already expired or blacklisted — logging out is still a success.
            with contextlib.suppress(TokenError):
                RefreshToken(cast(Any, raw)).blacklist()

        response = Response(status=status.HTTP_204_NO_CONTENT)
        _clear_refresh_cookie(response)
        return response


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: UserSerializer}, operation_id="auth_me")
    def get(self, request: Request) -> Response:
        return Response(UserSerializer(_user(request)).data)

    @extend_schema(
        request=UserSerializer,
        responses={200: UserSerializer},
        operation_id="auth_me_update",
        description="Marks onboarding complete. No other field is writable here.",
    )
    def patch(self, request: Request) -> Response:
        payload = _payload(request)
        if "onboarding_complete" in payload:
            user = _user(request)
            user.onboarding_complete = bool(payload["onboarding_complete"])
            user.save(update_fields=["onboarding_complete"])
        return Response(UserSerializer(_user(request)).data)


class PasswordChangeView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        request=PasswordChangeSerializer,
        responses={204: None},
        operation_id="auth_password_change",
    )
    def post(self, request: Request) -> Response:
        serializer = PasswordChangeSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        serializer.save()

        # Changing a password invalidates the session everywhere else.
        response = Response(status=status.HTTP_204_NO_CONTENT)
        _clear_refresh_cookie(response)
        return response


class LocationListView(APIView):
    """The cities offered in the onboarding picker.

    Open to anonymous callers — the register screen needs it before there is a
    token to send.
    """

    authentication_classes: list[Any] = []
    permission_classes = [AllowAny]

    @extend_schema(responses={200: LocationSerializer(many=True)}, operation_id="locations_list")
    def get(self, request: Request) -> Response:
        payload = [
            {"key": location.key, "label": location.label, "aliases": list(location.aliases)}
            for location in location_catalogue.SELECTABLE
        ]
        return Response(LocationSerializer(payload, many=True).data)


class ProfileView(generics.RetrieveUpdateAPIView):
    """The CURRENT USER's profile — never one identified by a client-supplied id."""

    serializer_class = ProfileSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self) -> Profile:
        profile, _ = Profile.objects.get_or_create(user=_user(self.request))
        return profile


class ProfilePreviewView(APIView):
    """Score a hypothetical posting against the caller's own profile.

    Tuning weights blind is miserable; this is what makes it interactive.
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(
        request=ScorePreviewRequestSerializer,
        responses={200: ScorePreviewResponseSerializer},
        operation_id="profile_preview",
    )
    def post(self, request: Request) -> Response:
        serializer = ScorePreviewRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        profile, _ = Profile.objects.get_or_create(user=_user(request))
        payload = ScorePreviewResponseSerializer.from_profile(profile, serializer.validated_data)
        return Response(ScorePreviewResponseSerializer(payload).data)
