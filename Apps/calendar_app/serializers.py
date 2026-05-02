from rest_framework import serializers
from .models import CalendarEvent, EventReminder, InAppNotification


class EventReminderSerializer(serializers.ModelSerializer):
    class Meta:
        model  = EventReminder
        fields = ['id', 'method', 'minutes_before', 'send_at', 'sent']
        read_only_fields = ['id', 'send_at', 'sent']


class CalendarEventSerializer(serializers.ModelSerializer):
    reminders = EventReminderSerializer(many=True, read_only=True)

    class Meta:
        model  = CalendarEvent
        fields = [
            'id', 'title', 'description', 'location',
            'start_dt', 'end_dt', 'all_day', 'color',
            'recurrence', 'reminders',
            'google_event_id', 'google_calendar_id',
            'workspace', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'reminders', 'google_event_id', 'google_calendar_id', 'created_at', 'updated_at']


class InAppNotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model  = InAppNotification
        fields = ['id', 'notif_type', 'title', 'body', 'event', 'read', 'created_at']
        read_only_fields = ['id', 'created_at']
