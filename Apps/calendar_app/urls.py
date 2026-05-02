from django.urls import path
from .views import (
    CalendarEventList,
    CalendarEventDetail,
    UnreadNotificationList,
    MarkNotificationRead,
    MarkAllNotificationsRead,
)

urlpatterns = [
    path('events/',                          CalendarEventList.as_view(),        name='calendar-event-list'),
    path('events/<uuid:id>/',                CalendarEventDetail.as_view(),      name='calendar-event-detail'),
    path('notifications/unread/',            UnreadNotificationList.as_view(),   name='notifications-unread'),
    path('notifications/read-all/',          MarkAllNotificationsRead.as_view(), name='notifications-read-all'),
    path('notifications/<uuid:id>/read/',    MarkNotificationRead.as_view(),     name='notification-mark-read'),
]
