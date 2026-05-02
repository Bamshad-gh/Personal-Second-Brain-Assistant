from django.contrib import admin
from .models import CalendarEvent, EventReminder, InAppNotification


@admin.register(CalendarEvent)
class CalendarEventAdmin(admin.ModelAdmin):
    list_display  = ['title', 'user', 'start_dt', 'end_dt', 'all_day', 'is_deleted']
    list_filter   = ['all_day', 'is_deleted']
    search_fields = ['title', 'user__email']


@admin.register(EventReminder)
class EventReminderAdmin(admin.ModelAdmin):
    list_display = ['event', 'method', 'minutes_before', 'send_at', 'sent']
    list_filter  = ['method', 'sent']


@admin.register(InAppNotification)
class InAppNotificationAdmin(admin.ModelAdmin):
    list_display  = ['user', 'notif_type', 'title', 'read', 'created_at']
    list_filter   = ['notif_type', 'read']
    search_fields = ['user__email', 'title']
