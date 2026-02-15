from django.contrib.auth import get_user_model
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .permissions import CanManageUsers
from .serializers import (
    ChangePasswordSerializer,
    UserCreateSerializer,
    UserMeSerializer,
    UserPermissionSerializer,
    UserSerializer,
)

User = get_user_model()


class LoginView(TokenObtainPairView):
    """POST /auth/login/ — obtain JWT token pair."""

    pass


class TokenRefreshAPIView(TokenRefreshView):
    """POST /auth/token/refresh/ — refresh JWT access token."""

    pass


class LogoutView(APIView):
    """POST /auth/logout/ — blacklist the refresh token."""

    permission_classes = [IsAuthenticated]

    def post(self, request) -> Response:
        refresh_token = request.data.get("refresh")
        if not refresh_token:
            return Response(
                {"detail": "Refresh token is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            token = RefreshToken(refresh_token)
            token.blacklist()
        except Exception:
            return Response(
                {"detail": "Invalid or expired token."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(generics.RetrieveUpdateAPIView):
    """GET|PATCH /auth/me/ — current user profile."""

    serializer_class = UserMeSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self):
        return self.request.user


class ChangePasswordView(APIView):
    """POST /auth/change-password/"""

    permission_classes = [IsAuthenticated]

    def post(self, request) -> Response:
        serializer = ChangePasswordSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        request.user.set_password(serializer.validated_data["new_password"])
        request.user.save(update_fields=["password"])
        return Response({"detail": "Password changed successfully."})


class UserListCreateView(generics.ListCreateAPIView):
    """GET|POST /users/"""

    queryset = User.objects.all()
    permission_classes = [IsAuthenticated, CanManageUsers]

    def get_serializer_class(self):
        if self.request.method == "POST":
            return UserCreateSerializer
        return UserSerializer


class UserDetailView(generics.RetrieveUpdateDestroyAPIView):
    """GET|PATCH|DELETE /users/{uuid}/"""

    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated, CanManageUsers]
    lookup_field = "uuid"


class UserPermissionView(generics.UpdateAPIView):
    """PATCH /users/{uuid}/permissions/"""

    queryset = User.objects.all()
    serializer_class = UserPermissionSerializer
    permission_classes = [IsAuthenticated, CanManageUsers]
    lookup_field = "uuid"
