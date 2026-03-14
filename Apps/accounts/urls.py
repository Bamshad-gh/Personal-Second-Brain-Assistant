# Apps/accounts/urls.py
from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from .views import RegisterView, MeView, ChangePasswordView, LoginView

urlpatterns = [
    # Registration
    path('register/', RegisterView.as_view(), name='register'),

    # Login (get JWT tokens)
    path('login/', LoginView.as_view(), name='login'),

    # Refresh token
    path('refresh/', TokenRefreshView.as_view(), name='token_refresh'),

    # Current user profile
    path('me/', MeView.as_view(), name='me'),

    # Change password
    path('change-password/', ChangePasswordView.as_view(), name='change-password'),
]