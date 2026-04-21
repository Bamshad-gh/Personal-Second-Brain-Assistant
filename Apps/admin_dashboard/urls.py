# Apps/admin_dashboard/urls.py

from django.urls import path
from .views import (
    AdminOverviewView,
    AdminUserListView,
    AdminAiStatsView,
    AdminSecurityView,
)

urlpatterns = [
    path('overview/',  AdminOverviewView.as_view(),  name='admin-overview'),
    path('users/',     AdminUserListView.as_view(),   name='admin-users'),
    path('ai-stats/',  AdminAiStatsView.as_view(),    name='admin-ai-stats'),
    path('security/',  AdminSecurityView.as_view(),   name='admin-security'),
]
