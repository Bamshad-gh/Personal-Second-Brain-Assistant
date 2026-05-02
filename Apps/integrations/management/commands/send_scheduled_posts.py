from django.core.management.base import BaseCommand
from django.utils import timezone

from Apps.integrations.models import ScheduledPost
from Apps.integrations.views import _post_to_linkedin


class Command(BaseCommand):
    help = 'Post scheduled social posts that are due. Run every minute via cron.'

    def handle(self, *args, **options):
        now = timezone.now()
        due = ScheduledPost.objects.filter(
            status='scheduled',
            scheduled_at__lte=now,
            is_deleted=False,
        ).select_related('user')

        sent_count = 0
        for post in due:
            try:
                if post.platform == 'linkedin':
                    integration      = post.user.linkedin_integration
                    platform_post_id = _post_to_linkedin(integration, post.content)
                    post.status           = 'sent'
                    post.sent_at          = now
                    post.platform_post_id = platform_post_id
                    post.save(update_fields=['status', 'sent_at', 'platform_post_id'])
                    sent_count += 1
                else:
                    self.stderr.write(f'Unknown platform {post.platform} for post {post.id}')
            except Exception as exc:
                post.status    = 'failed'
                post.error_log = str(exc)
                post.save(update_fields=['status', 'error_log'])
                self.stderr.write(f'Failed post {post.id}: {exc}')

        self.stdout.write(f'Sent {sent_count} scheduled post(s).')
