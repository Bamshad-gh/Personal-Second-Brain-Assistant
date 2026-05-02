from django.db import models
from django.conf import settings

from Apps.core.mixins import BaseModel


class CalendarEvent(BaseModel):
    """
    A calendar event owned by a user, optionally linked to a workspace.
    recurrence stores rule as JSON:
      {"freq":"WEEKLY","interval":1,"byday":["MO","WE"],"until":null,"count":null}
    """

    user        = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='calendar_events',
    )
    workspace   = models.ForeignKey(
        'workspaces.Workspace',
        on_delete=models.CASCADE,
        related_name='calendar_events',
        null=True, blank=True,
    )
    title       = models.CharField(max_length=500)
    description = models.TextField(blank=True)
    location    = models.CharField(max_length=500, blank=True)
    start_dt    = models.DateTimeField()
    end_dt      = models.DateTimeField()
    all_day     = models.BooleanField(default=False)
    color       = models.CharField(max_length=30, blank=True)
    recurrence  = models.JSONField(null=True, blank=True)

    # Google Calendar two-way sync
    google_event_id    = models.CharField(max_length=255, blank=True)
    google_calendar_id = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ['start_dt']
        indexes  = [
            models.Index(fields=['user', 'start_dt']),
            models.Index(fields=['workspace', 'start_dt']),
            models.Index(fields=['google_event_id']),
        ]

    def __str__(self):
        return f'{self.title} ({self.start_dt:%Y-%m-%d})'


class EventReminder(BaseModel):
    """
    A reminder attached to a CalendarEvent.
    send_at is computed on event save: event.start_dt - timedelta(minutes=minutes_before).
    The management command send_reminders processes due reminders every 5 minutes.
    """

    event          = models.ForeignKey(CalendarEvent, on_delete=models.CASCADE, related_name='reminders')
    method         = models.CharField(max_length=20)    # 'email' | 'in_app'
    minutes_before = models.PositiveIntegerField(default=15)
    send_at        = models.DateTimeField()             # computed: start_dt - timedelta(minutes=minutes_before)
    sent           = models.BooleanField(default=False)

    class Meta:
        indexes = [models.Index(fields=['send_at', 'sent'])]

    def __str__(self):
        return f'Reminder({self.method}, {self.minutes_before}min) for {self.event}'


class InAppNotification(BaseModel):
    """
    Persistent in-app notifications shown in the notification bell.
    Polled by the frontend every 30 seconds.
    """

    user       = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='notifications',
    )
    notif_type = models.CharField(max_length=30, default='reminder')  # 'reminder' | 'system'
    title      = models.CharField(max_length=500)
    body       = models.TextField(blank=True)
    event      = models.ForeignKey(
        CalendarEvent,
        on_delete=models.SET_NULL,
        null=True, blank=True,
    )
    read = models.BooleanField(default=False)

    class Meta:
        ordering = ['-created_at']
        indexes  = [models.Index(fields=['user', 'read'])]

    def __str__(self):
        return f'Notification({self.notif_type}) → {self.user}'
