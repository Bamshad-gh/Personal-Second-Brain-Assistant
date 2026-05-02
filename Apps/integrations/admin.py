from django.contrib import admin
from .models import EmailIntegration, GoogleCalendarIntegration, LinkedInIntegration, ScheduledPost


@admin.register(EmailIntegration)
class EmailIntegrationAdmin(admin.ModelAdmin):
    list_display = ['user', 'provider', 'email', 'is_default', 'is_deleted', 'created_at']
    list_filter  = ['provider', 'is_default', 'is_deleted']
    search_fields = ['user__email', 'email', 'label']
    readonly_fields = ['access_token_enc', 'refresh_token_enc', 'smtp_password_enc']


@admin.register(GoogleCalendarIntegration)
class GoogleCalendarIntegrationAdmin(admin.ModelAdmin):
    list_display = ['user', 'synced_calendar_id', 'token_expiry', 'is_deleted']
    readonly_fields = ['access_token_enc', 'refresh_token_enc']


@admin.register(LinkedInIntegration)
class LinkedInIntegrationAdmin(admin.ModelAdmin):
    list_display = ['user', 'display_name', 'person_urn', 'token_expiry', 'is_deleted']
    readonly_fields = ['access_token_enc']


@admin.register(ScheduledPost)
class ScheduledPostAdmin(admin.ModelAdmin):
    list_display = ['user', 'platform', 'status', 'scheduled_at', 'sent_at', 'is_deleted']
    list_filter  = ['platform', 'status', 'is_deleted']
    search_fields = ['user__email', 'content']
