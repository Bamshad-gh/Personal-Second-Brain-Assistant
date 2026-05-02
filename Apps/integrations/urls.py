from django.urls import path
from .views import (
    # Email
    EmailIntegrationList,
    SmtpConnectView,
    EmailIntegrationSetDefault,
    EmailIntegrationTest,
    EmailIntegrationDelete,
    # Gmail OAuth
    GmailOAuthStartView,
    GmailOAuthCallbackView,
    # Outlook OAuth
    OutlookOAuthStartView,
    OutlookOAuthCallbackView,
    # Google Calendar OAuth
    GoogleCalendarOAuthStart,
    GoogleCalendarOAuthCallback,
    GoogleCalendarSync,
    # LinkedIn OAuth
    LinkedInOAuthStart,
    LinkedInOAuthCallback,
    LinkedInStatus,
    LinkedInDisconnect,
    # Scheduled posts
    ScheduledPostList,
    ScheduledPostDetail,
    PostNow,
)

urlpatterns = [
    # ── Email integrations ──────────────────────────────────────────────────
    path('email/',                              EmailIntegrationList.as_view(),       name='email-list'),
    path('email/smtp/',                         SmtpConnectView.as_view(),            name='email-smtp-connect'),
    path('email/gmail/start/',                  GmailOAuthStartView.as_view(),        name='gmail-oauth-start'),
    path('email/gmail/callback/',               GmailOAuthCallbackView.as_view(),     name='gmail-oauth-callback'),
    path('email/outlook/start/',                OutlookOAuthStartView.as_view(),      name='outlook-oauth-start'),
    path('email/outlook/callback/',             OutlookOAuthCallbackView.as_view(),   name='outlook-oauth-callback'),
    path('email/<uuid:id>/set-default/',        EmailIntegrationSetDefault.as_view(), name='email-set-default'),
    path('email/<uuid:id>/test/',               EmailIntegrationTest.as_view(),       name='email-test'),
    path('email/<uuid:id>/',                    EmailIntegrationDelete.as_view(),     name='email-delete'),

    # ── Google Calendar OAuth ───────────────────────────────────────────────
    path('calendar/google/start/',              GoogleCalendarOAuthStart.as_view(),   name='gcal-oauth-start'),
    path('calendar/google/callback/',           GoogleCalendarOAuthCallback.as_view(),name='gcal-oauth-callback'),
    path('calendar/google/sync/',               GoogleCalendarSync.as_view(),         name='gcal-sync'),

    # ── LinkedIn OAuth ──────────────────────────────────────────────────────
    path('linkedin/start/',                     LinkedInOAuthStart.as_view(),         name='linkedin-oauth-start'),
    path('linkedin/callback/',                  LinkedInOAuthCallback.as_view(),      name='linkedin-oauth-callback'),
    path('linkedin/status/',                    LinkedInStatus.as_view(),             name='linkedin-status'),
    path('linkedin/disconnect/',                LinkedInDisconnect.as_view(),         name='linkedin-disconnect'),

    # ── Scheduled posts ─────────────────────────────────────────────────────
    path('posts/',                              ScheduledPostList.as_view(),          name='post-list'),
    path('posts/<uuid:id>/',                    ScheduledPostDetail.as_view(),        name='post-detail'),
    path('posts/<uuid:id>/post-now/',           PostNow.as_view(),                    name='post-now'),
]
