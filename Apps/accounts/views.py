from rest_framework.views import APIView
from rest_framework.generics import RetrieveUpdateAPIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken

from .serializers import RegisterSerializer, UserSerializer, UpdateProfileSerializer
import re


def get_tokens_for_user(user):
    """
    Generate JWT token pair for a user.

    Access token → used for authenticated API requests
    Refresh token → used to obtain new access tokens
    """
    refresh = RefreshToken.for_user(user)

    return {
        "access": str(refresh.access_token),
        "refresh": str(refresh),
    }


class RegisterView(APIView):
    """
    POST /api/auth/register/

    Creates a new user and immediately returns JWT tokens
    so the user can be logged in without a separate login request.
    """

    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)

        # Validate incoming data using serializer rules
        serializer.is_valid(raise_exception=True)

        # Create the user instance
        user = serializer.save()

        # Generate authentication tokens
        tokens = get_tokens_for_user(user)

        return Response(
            {
                "user": UserSerializer(user).data,
                **tokens,
            },
            status=201,
        )


class MeView(RetrieveUpdateAPIView):
    """
    GET   /api/auth/me/   → return current user's profile
    PATCH /api/auth/me/   → update profile fields

    The authenticated user is derived from the JWT token,
    so the frontend never needs to send a user ID.
    """

    permission_classes = [IsAuthenticated]

    def get_object(self):
        # Always operate on the logged-in user
        return self.request.user

    def get_serializer_class(self):
        """
        Use different serializers for reading vs updating.

        Read → UserSerializer
        Update → UpdateProfileSerializer
        """
        if self.request.method in ("PUT", "PATCH"):
            return UpdateProfileSerializer

        return UserSerializer


class ChangePasswordView(APIView):
    """
    POST /api/auth/change-password/

    Allows the authenticated user to change their password.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user

        old_password = request.data.get("old_password", "")
        new_password = request.data.get("new_password", "")

        # Verify current password
        if not user.check_password(old_password):
            return Response(
                {"error": "Current password is incorrect."},
                status=400,
            )

        # Basic password strength validation
        if len(new_password) < 8:
            return Response(
                {"error": "Password must be at least 8 characters."},
                status=400,
            )

        if not re.search(r"[A-Za-z]", new_password):
            return Response(
                {"error": "Password must contain at least one letter."},
                status=400,
            )

        if not re.search(r"[0-9]", new_password):
            return Response(
                {"error": "Password must contain at least one number."},
                status=400,
            )

        # Save new password (Django automatically hashes it)
        user.set_password(new_password)
        user.save()

        return Response(
            {"message": "Password updated. Please log in again."}
        )