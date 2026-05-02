from django.core.management.base import BaseCommand
from django.utils import timezone

from Apps.calendar_app.models import EventReminder, InAppNotification


class Command(BaseCommand):
    help = 'Send due event reminders (email + in-app). Run every 5 minutes via cron.'

    def handle(self, *args, **options):
        now = timezone.now()
        due = EventReminder.objects.filter(
            send_at__lte=now,
            sent=False,
            is_deleted=False,
            event__is_deleted=False,
        ).select_related('event', 'event__user')

        sent_count = 0
        for reminder in due:
            event = reminder.event
            user  = event.user
            try:
                if reminder.method == 'email':
                    from Apps.integrations.sender import send_email as integration_send_email
                    integration_send_email(
                        user=user,
                        to=[user.email],
                        subject=f'Reminder: {event.title}',
                        body=(
                            f'This is a reminder for your event:\n\n'
                            f'  {event.title}\n'
                            f'  Starts: {event.start_dt.strftime("%Y-%m-%d %H:%M UTC")}\n'
                            + (f'  Location: {event.location}\n' if event.location else '')
                        ),
                    )
                elif reminder.method == 'in_app':
                    InAppNotification.objects.create(
                        user=user,
                        notif_type='reminder',
                        title=f'Reminder: {event.title}',
                        body=f'Starts at {event.start_dt.strftime("%H:%M UTC")}',
                        event=event,
                    )

                reminder.sent = True
                reminder.save(update_fields=['sent'])
                sent_count += 1
            except Exception as exc:
                self.stderr.write(f'Failed reminder {reminder.id}: {exc}')

        self.stdout.write(f'Processed {sent_count} reminder(s).')
