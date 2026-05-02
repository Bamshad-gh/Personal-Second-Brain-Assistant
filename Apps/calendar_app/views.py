from datetime import timedelta

from django.shortcuts import get_object_or_404
from django.utils import timezone

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import CalendarEvent, EventReminder, InAppNotification
from .serializers import CalendarEventSerializer, InAppNotificationSerializer


class CalendarEventList(APIView):
    """
    GET  /api/calendar/events/  — list events for the authenticated user.
        Query params: start=<ISO8601>, end=<ISO8601>, workspace=<uuid>
    POST /api/calendar/events/  — create a new event.
        Body may include reminders: [{method, minutes_before}, ...]
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = CalendarEvent.objects.filter(user=request.user, is_deleted=False)

        start     = request.query_params.get('start')
        end       = request.query_params.get('end')
        workspace = request.query_params.get('workspace')

        if start:
            qs = qs.filter(start_dt__gte=start)
        if end:
            qs = qs.filter(start_dt__lte=end)
        if workspace:
            qs = qs.filter(workspace_id=workspace)

        return Response(CalendarEventSerializer(qs.prefetch_related('reminders'), many=True).data)

    def post(self, request):
        reminders_data = request.data.pop('reminders', []) if isinstance(request.data, dict) else []
        data = request.data.copy() if hasattr(request.data, 'copy') else dict(request.data)
        reminders_data = data.pop('reminders', [])

        serializer = CalendarEventSerializer(data=data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        event = serializer.save(user=request.user)

        # Create reminders
        for r in reminders_data:
            method         = r.get('method', 'in_app')
            minutes_before = int(r.get('minutes_before', 15))
            send_at        = event.start_dt - timedelta(minutes=minutes_before)
            EventReminder.objects.create(
                event=event,
                method=method,
                minutes_before=minutes_before,
                send_at=send_at,
            )

        return Response(CalendarEventSerializer(event).data, status=status.HTTP_201_CREATED)


class CalendarEventDetail(APIView):
    """
    GET    /api/calendar/events/<id>/
    PATCH  /api/calendar/events/<id>/
    DELETE /api/calendar/events/<id>/
    """
    permission_classes = [IsAuthenticated]

    def _get_event(self, id, user):
        return get_object_or_404(CalendarEvent, pk=id, user=user, is_deleted=False)

    def get(self, request, id):
        event = self._get_event(id, request.user)
        return Response(CalendarEventSerializer(event).data)

    def patch(self, request, id):
        event = self._get_event(id, request.user)
        data  = request.data.copy() if hasattr(request.data, 'copy') else dict(request.data)
        data.pop('reminders', None)  # reminders managed separately

        serializer = CalendarEventSerializer(event, data=data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        event = serializer.save()

        # Recompute reminder send_at if start_dt changed
        if 'start_dt' in data:
            for reminder in event.reminders.filter(sent=False, is_deleted=False):
                reminder.send_at = event.start_dt - timedelta(minutes=reminder.minutes_before)
                reminder.save(update_fields=['send_at'])

        return Response(CalendarEventSerializer(event).data)

    def delete(self, request, id):
        event = self._get_event(id, request.user)
        event.is_deleted = True
        event.save(update_fields=['is_deleted'])
        return Response(status=status.HTTP_204_NO_CONTENT)


class UnreadNotificationList(APIView):
    """GET /api/calendar/notifications/unread/ — polled by frontend every 30s."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = InAppNotification.objects.filter(
            user=request.user, read=False, is_deleted=False,
        )[:50]
        return Response(InAppNotificationSerializer(qs, many=True).data)


class MarkNotificationRead(APIView):
    """POST /api/calendar/notifications/<id>/read/"""
    permission_classes = [IsAuthenticated]

    def post(self, request, id):
        notif = get_object_or_404(InAppNotification, pk=id, user=request.user, is_deleted=False)
        notif.read = True
        notif.save(update_fields=['read'])
        return Response({'read': True})


class MarkAllNotificationsRead(APIView):
    """POST /api/calendar/notifications/read-all/"""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        InAppNotification.objects.filter(
            user=request.user, read=False, is_deleted=False,
        ).update(read=True)
        return Response({'read': True})
