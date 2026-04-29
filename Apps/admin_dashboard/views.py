"""
Apps/admin_dashboard/views.py

Admin Dashboard API — read-only statistics for staff users.
All endpoints require is_staff=True (enforced by IsAdminUser permission class).

HOW TO ADD A NEW STAT:
  1. Create a new APIView subclass below.
  2. Add permission_classes = [IsAdminUser].
  3. Register the URL in admin_dashboard/urls.py.

HOW TO TEST:
  Log in as a staff user and call GET /api/admin/overview/ etc.
  Non-staff requests receive 403 Forbidden automatically.
"""

from rest_framework.views      import APIView
from rest_framework.response   import Response
from rest_framework.permissions import IsAdminUser
from django.contrib.auth       import get_user_model
from django.utils              import timezone
from django.db.models          import Count, Sum, Q
from django.db.models.functions import TruncDate
from datetime                  import timedelta

from Apps.pages.models      import Page
from Apps.blocks.models     import Block
from Apps.workspaces.models import Workspace
from Apps.ai_agent.models   import AiUsageLog, AiUserQuota

User = get_user_model()


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# HELPERS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def _token_sum(qs) -> int:
    """
    Sum input_tokens + output_tokens across a queryset.
    Django cannot add two aggregate expressions directly, so we do it in Python.
    Returns 0 if no rows match.
    """
    result = qs.aggregate(inp=Sum('input_tokens'), out=Sum('output_tokens'))
    return (result['inp'] or 0) + (result['out'] or 0)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# OVERVIEW STATS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class AdminOverviewView(APIView):
    """
    GET /api/admin/overview/
    Returns high-level platform statistics for the dashboard home cards.
    Never exposes passwords, tokens, or PII beyond aggregate counts.
    """
    permission_classes = [IsAdminUser]

    def get(self, request):
        now         = timezone.now()
        last_30     = now - timedelta(days=30)
        last_7      = now - timedelta(days=7)
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

        # ── User counts ───────────────────────────────────────────────────────
        total_users    = User.objects.count()
        new_30d        = User.objects.filter(created_at__gte=last_30).count()
        active_7d      = User.objects.filter(last_login__gte=last_7).count()

        # ── Content counts ────────────────────────────────────────────────────
        total_pages      = Page.objects.filter(is_deleted=False).count()
        total_blocks     = Block.objects.filter(is_deleted=False).count()
        total_workspaces = Workspace.objects.filter(is_deleted=False).count()

        # ── AI usage today ────────────────────────────────────────────────────
        ai_logs_today   = AiUsageLog.objects.filter(created_at__gte=today_start)
        ai_calls_today  = ai_logs_today.count()
        ai_tokens_today = _token_sum(ai_logs_today)

        # ── Tier breakdown ────────────────────────────────────────────────────
        tier_counts = dict(
            AiUserQuota.objects
            .values('tier')
            .annotate(count=Count('id'))
            .values_list('tier', 'count')
        )

        return Response({
            'users': {
                'total':     total_users,
                'new_30d':   new_30d,
                'active_7d': active_7d,
            },
            'content': {
                'pages':      total_pages,
                'blocks':     total_blocks,
                'workspaces': total_workspaces,
            },
            'ai': {
                'calls_today':  ai_calls_today,
                'tokens_today': ai_tokens_today,
            },
            'tiers': tier_counts,
        })


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# USER LIST
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class AdminUserListView(APIView):
    """
    GET /api/admin/users/?page=1&search=email
    Returns a paginated list of users with lightweight stats.

    Never returns passwords, access tokens, or refresh tokens.
    page_count counts non-deleted pages across all workspaces owned by the user.
    ai_calls_today counts this user's AI calls since midnight UTC.
    """
    permission_classes = [IsAdminUser]

    def get(self, request):
        search = request.query_params.get('search', '')
        page   = max(1, int(request.query_params.get('page', 1)))
        limit  = 20
        offset = (page - 1) * limit

        qs = User.objects.annotate(
            workspace_count=Count('workspaces', distinct=True),
            page_count=Count(
                'workspaces__pages',
                filter=Q(workspaces__pages__is_deleted=False),
                distinct=True,
            ),
        )

        if search:
            qs = qs.filter(
                Q(email__icontains=search) | Q(username__icontains=search)
            )

        total = qs.count()
        users = qs.select_related('ai_quota').order_by('-created_at')[offset:offset + limit]

        today_start = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)

        results = []
        for u in users:
            quota    = getattr(u, 'ai_quota', None)
            ai_today = AiUsageLog.objects.filter(
                user=u, created_at__gte=today_start
            ).count()
            results.append({
                'id':              str(u.id),
                'email':           u.email,
                'username':        u.username,
                'created_at':     u.created_at,
                'last_login':      u.last_login,
                'is_staff':        u.is_staff,
                'is_active':       u.is_active,
                'workspace_count': u.workspace_count,
                'page_count':      u.page_count,
                'ai_tier':         quota.tier if quota else 'free',
                'ai_calls_today':  ai_today,
            })

        return Response({
            'total':   total,
            'page':    page,
            'pages':   (total + limit - 1) // limit,
            'results': results,
        })


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# AI USAGE STATS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class AdminAiStatsView(APIView):
    """
    GET /api/admin/ai-stats/
    Returns AI usage broken down by action type, by day, and top users.
    All data is aggregated — no individual message content exposed.
    Window: last 30 days.
    """
    permission_classes = [IsAdminUser]

    def get(self, request):
        last_30 = timezone.now() - timedelta(days=30)
        base_qs = AiUsageLog.objects.filter(created_at__gte=last_30)

        # ── By action ─────────────────────────────────────────────────────────
        by_action = list(
            base_qs
            .values('action_name')
            .annotate(
                count=Count('id'),
                input_tokens=Sum('input_tokens'),
                output_tokens=Sum('output_tokens'),
            )
            .order_by('-count')[:20]
        )

        # ── Daily call + token counts ─────────────────────────────────────────
        daily_rows = list(
            base_qs
            .annotate(date=TruncDate('created_at'))
            .values('date')
            .annotate(
                calls=Count('id'),
                input_tokens=Sum('input_tokens'),
                output_tokens=Sum('output_tokens'),
            )
            .order_by('date')
        )
        # Add combined token count in Python (ORM cannot sum two aggregates)
        daily = [
            {
                'date':   row['date'],
                'calls':  row['calls'],
                'tokens': (row['input_tokens'] or 0) + (row['output_tokens'] or 0),
            }
            for row in daily_rows
        ]

        # ── Top users by call count ────────────────────────────────────────────
        top_user_rows = list(
            base_qs
            .values('user__email')
            .annotate(
                calls=Count('id'),
                input_tokens=Sum('input_tokens'),
                output_tokens=Sum('output_tokens'),
            )
            .order_by('-calls')[:10]
        )
        top_users = [
            {
                'user__email': row['user__email'],
                'calls':       row['calls'],
                'tokens':      (row['input_tokens'] or 0) + (row['output_tokens'] or 0),
            }
            for row in top_user_rows
        ]

        return Response({
            'by_action': by_action,
            'daily':     daily,
            'top_users': top_users,
        })


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# SECURITY LOG
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class AdminSecurityView(APIView):
    """
    GET /api/admin/security/
    Returns security-relevant signals: new staff accounts, unlimited-tier users,
    and accounts that have never logged in.

    Intentionally read-only — no mutations here.
    """
    permission_classes = [IsAdminUser]

    def get(self, request):
        now    = timezone.now()
        last_7 = now - timedelta(days=7)

        # Staff accounts created in the last 7 days (unexpected = risk signal)
        new_staff = list(
            User.objects.filter(is_staff=True, created_at__gte=last_7)
            .values('email', 'created_at')
            .order_by('-created_at')
        )

        # Users on the unlimited tier
        unlimited_users = list(
            AiUserQuota.objects.filter(tier='unlimited')
            .select_related('user')
            .values('user__email', 'updated_at')
            .order_by('user__email')
        )

        # Accounts that joined 30+ days ago and have never logged in
        inactive_count = User.objects.filter(
            last_login__isnull=True,
            created_at__lt=now - timedelta(days=30),
        ).count()

        return Response({
            'new_staff_accounts': new_staff,
            'unlimited_ai_users': unlimited_users,
            'never_logged_in':    inactive_count,
        })
