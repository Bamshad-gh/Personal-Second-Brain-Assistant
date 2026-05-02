import smtplib
import logging
from datetime import datetime, timedelta, timezone

from django.conf import settings
from django.core import signing
from django.shortcuts import get_object_or_404
from django.http import HttpResponseRedirect

from rest_framework import status
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .crypto import encrypt_token, decrypt_token
from .models import (
    EmailIntegration,
    GoogleCalendarIntegration,
    LinkedInIntegration,
    ScheduledPost,
)
from .serializers import (
    EmailIntegrationSerializer,
    LinkedInStatusSerializer,
    ScheduledPostSerializer,
)
from .sender import send_email as integration_send_email

logger = logging.getLogger(__name__)

_OAUTH_STATE_SALT = 'oauth-state-v1'


def _make_state(user_id: str) -> str:
    return signing.dumps(str(user_id), salt=_OAUTH_STATE_SALT)


def _read_state(state: str) -> str:
    return signing.loads(state, salt=_OAUTH_STATE_SALT, max_age=600)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Email Integration — list / SMTP connect
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class EmailIntegrationList(APIView):
    """GET /api/integrations/email/ — list user's email integrations."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = EmailIntegration.objects.filter(user=request.user, is_deleted=False).order_by('-is_default', 'created_at')
        return Response(EmailIntegrationSerializer(qs, many=True).data)


class SmtpConnectView(APIView):
    """
    POST /api/integrations/email/smtp/
    Body: { host, port, use_tls, username, password, email, label }
    Tests the SMTP connection before saving.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        host     = request.data.get('host', '').strip()
        port     = int(request.data.get('port', 587))
        use_tls  = bool(request.data.get('use_tls', True))
        username = request.data.get('username', '').strip()
        password = request.data.get('password', '')
        email    = request.data.get('email', '').strip()
        label    = request.data.get('label', '').strip()

        if not host:
            return Response({'error': 'host is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if not email:
            return Response({'error': 'email is required.'}, status=status.HTTP_400_BAD_REQUEST)

        # Test SMTP connection before persisting
        try:
            with smtplib.SMTP(host, port, timeout=10) as server:
                if use_tls:
                    server.starttls()
                if username and password:
                    server.login(username, password)
        except smtplib.SMTPAuthenticationError:
            return Response({'error': 'SMTP authentication failed. Check username/password.'}, status=status.HTTP_400_BAD_REQUEST)
        except (smtplib.SMTPException, OSError) as exc:
            return Response({'error': f'Cannot connect to SMTP server: {exc}'}, status=status.HTTP_400_BAD_REQUEST)

        integration = EmailIntegration.objects.create(
            user=request.user,
            provider='smtp',
            label=label or email,
            email=email,
            smtp_host=host,
            smtp_port=port,
            smtp_use_tls=use_tls,
            smtp_username=username,
            smtp_password_enc=encrypt_token(password) if password else '',
        )
        return Response(EmailIntegrationSerializer(integration).data, status=status.HTTP_201_CREATED)


class EmailIntegrationSetDefault(APIView):
    """POST /api/integrations/email/<id>/set-default/"""
    permission_classes = [IsAuthenticated]

    def post(self, request, id):
        integration = get_object_or_404(EmailIntegration, pk=id, user=request.user, is_deleted=False)
        EmailIntegration.objects.filter(user=request.user, is_deleted=False).update(is_default=False)
        integration.is_default = True
        integration.save(update_fields=['is_default'])
        return Response(EmailIntegrationSerializer(integration).data)


class EmailIntegrationTest(APIView):
    """POST /api/integrations/email/<id>/test/ — send test email to user's own address."""
    permission_classes = [IsAuthenticated]

    def post(self, request, id):
        integration = get_object_or_404(EmailIntegration, pk=id, user=request.user, is_deleted=False)
        try:
            integration_send_email(
                user=request.user,
                to=[request.user.email],
                subject='SpatialScribe — Email integration test',
                body='This is a test email to confirm your email integration is working.',
                integration_id=str(integration.id),
            )
        except Exception as exc:
            logger.exception('Email test failed: %s', exc)
            return Response({'error': str(exc)}, status=status.HTTP_502_BAD_GATEWAY)
        return Response({'sent': True})


class EmailIntegrationDelete(APIView):
    """DELETE /api/integrations/email/<id>/"""
    permission_classes = [IsAuthenticated]

    def delete(self, request, id):
        integration = get_object_or_404(EmailIntegration, pk=id, user=request.user, is_deleted=False)
        integration.is_deleted = True
        integration.save(update_fields=['is_deleted'])
        return Response(status=status.HTTP_204_NO_CONTENT)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Gmail OAuth
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class GmailOAuthStartView(APIView):
    """GET /api/integrations/email/gmail/start/ — returns {url} for Google OAuth consent."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            from google_auth_oauthlib.flow import Flow
        except ImportError:
            return Response({'error': 'google-auth-oauthlib not installed.'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        if not settings.GOOGLE_GMAIL_CLIENT_ID:
            return Response({'error': 'Gmail OAuth not configured. Set GOOGLE_GMAIL_CLIENT_ID.'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        redirect_uri = f'{settings.BACKEND_BASE_URL}/api/integrations/email/gmail/callback/'
        flow = Flow.from_client_config(
            {
                'web': {
                    'client_id':     settings.GOOGLE_GMAIL_CLIENT_ID,
                    'client_secret': settings.GOOGLE_GMAIL_CLIENT_SECRET,
                    'auth_uri':      'https://accounts.google.com/o/oauth2/auth',
                    'token_uri':     'https://oauth2.googleapis.com/token',
                    'redirect_uris': [redirect_uri],
                }
            },
            scopes=['https://www.googleapis.com/auth/gmail.send'],
        )
        flow.redirect_uri = redirect_uri

        auth_url, _ = flow.authorization_url(
            access_type='offline',
            include_granted_scopes='true',
            state=_make_state(str(request.user.id)),
            prompt='consent',
        )
        return Response({'url': auth_url})


class GmailOAuthCallbackView(APIView):
    """
    GET /api/integrations/email/gmail/callback/
    AllowAny — Google redirects here with ?code=&state=
    """
    permission_classes = [AllowAny]

    def get(self, request):
        code  = request.GET.get('code')
        state = request.GET.get('state')

        if not code or not state:
            return Response({'error': 'Missing code or state.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            user_id = _read_state(state)
        except signing.SignatureExpired:
            return Response({'error': 'OAuth state expired.'}, status=status.HTTP_400_BAD_REQUEST)
        except signing.BadSignature:
            return Response({'error': 'Invalid OAuth state.'}, status=status.HTTP_400_BAD_REQUEST)

        from django.contrib.auth import get_user_model
        User = get_user_model()
        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return Response({'error': 'User not found.'}, status=status.HTTP_404_NOT_FOUND)

        try:
            from google_auth_oauthlib.flow import Flow
            import requests as http

            redirect_uri = f'{settings.BACKEND_BASE_URL}/api/integrations/email/gmail/callback/'
            flow = Flow.from_client_config(
                {
                    'web': {
                        'client_id':     settings.GOOGLE_GMAIL_CLIENT_ID,
                        'client_secret': settings.GOOGLE_GMAIL_CLIENT_SECRET,
                        'auth_uri':      'https://accounts.google.com/o/oauth2/auth',
                        'token_uri':     'https://oauth2.googleapis.com/token',
                        'redirect_uris': [redirect_uri],
                    }
                },
                scopes=['https://www.googleapis.com/auth/gmail.send'],
                state=state,
            )
            flow.redirect_uri = redirect_uri
            flow.fetch_token(code=code)
            creds = flow.credentials

            # Get the user's Gmail address
            resp = http.get(
                'https://www.googleapis.com/oauth2/v2/userinfo',
                headers={'Authorization': f'Bearer {creds.token}'},
            )
            email_address = resp.json().get('email', '') if resp.ok else ''

            EmailIntegration.objects.update_or_create(
                user=user,
                provider='gmail',
                email=email_address,
                defaults={
                    'label':             email_address,
                    'access_token_enc':  encrypt_token(creds.token),
                    'refresh_token_enc': encrypt_token(creds.refresh_token) if creds.refresh_token else '',
                    'token_expiry':      creds.expiry,
                    'is_deleted':        False,
                },
            )
        except Exception as exc:
            logger.exception('Gmail OAuth callback error: %s', exc)
            return HttpResponseRedirect(f'{settings.FRONTEND_BASE_URL}/settings?error=gmail_oauth')

        return HttpResponseRedirect(f'{settings.FRONTEND_BASE_URL}/settings?connected=gmail')


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Outlook OAuth
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class OutlookOAuthStartView(APIView):
    """GET /api/integrations/email/outlook/start/ — returns {url}."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not settings.OUTLOOK_CLIENT_ID:
            return Response({'error': 'Outlook OAuth not configured. Set OUTLOOK_CLIENT_ID.'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        redirect_uri = f'{settings.BACKEND_BASE_URL}/api/integrations/email/outlook/callback/'
        import urllib.parse
        params = urllib.parse.urlencode({
            'client_id':     settings.OUTLOOK_CLIENT_ID,
            'response_type': 'code',
            'redirect_uri':  redirect_uri,
            'scope':         'Mail.Send offline_access User.Read',
            'response_mode': 'query',
            'state':         _make_state(str(request.user.id)),
        })
        url = f'https://login.microsoftonline.com/common/oauth2/v2.0/authorize?{params}'
        return Response({'url': url})


class OutlookOAuthCallbackView(APIView):
    """GET /api/integrations/email/outlook/callback/ — AllowAny."""
    permission_classes = [AllowAny]

    def get(self, request):
        code  = request.GET.get('code')
        state = request.GET.get('state')

        if not code or not state:
            return Response({'error': 'Missing code or state.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            user_id = _read_state(state)
        except (signing.SignatureExpired, signing.BadSignature):
            return HttpResponseRedirect(f'{settings.FRONTEND_BASE_URL}/settings?error=outlook_state')

        from django.contrib.auth import get_user_model
        User = get_user_model()
        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return HttpResponseRedirect(f'{settings.FRONTEND_BASE_URL}/settings?error=outlook_user')

        try:
            import requests as http
            redirect_uri = f'{settings.BACKEND_BASE_URL}/api/integrations/email/outlook/callback/'

            # Exchange code for tokens
            resp = http.post(
                'https://login.microsoftonline.com/common/oauth2/v2.0/token',
                data={
                    'grant_type':    'authorization_code',
                    'client_id':     settings.OUTLOOK_CLIENT_ID,
                    'client_secret': settings.OUTLOOK_CLIENT_SECRET,
                    'code':          code,
                    'redirect_uri':  redirect_uri,
                    'scope':         'Mail.Send offline_access User.Read',
                },
            )
            resp.raise_for_status()
            token_data    = resp.json()
            access_token  = token_data['access_token']
            refresh_token = token_data.get('refresh_token', '')
            expires_in    = token_data.get('expires_in', 3600)
            expiry        = datetime.now(timezone.utc) + timedelta(seconds=expires_in)

            # Get user's email address
            me_resp = http.get(
                'https://graph.microsoft.com/v1.0/me',
                headers={'Authorization': f'Bearer {access_token}'},
            )
            email_address = me_resp.json().get('mail') or me_resp.json().get('userPrincipalName', '') if me_resp.ok else ''

            EmailIntegration.objects.update_or_create(
                user=user,
                provider='outlook',
                email=email_address,
                defaults={
                    'label':             email_address,
                    'access_token_enc':  encrypt_token(access_token),
                    'refresh_token_enc': encrypt_token(refresh_token) if refresh_token else '',
                    'token_expiry':      expiry,
                    'is_deleted':        False,
                },
            )
        except Exception as exc:
            logger.exception('Outlook OAuth callback error: %s', exc)
            return HttpResponseRedirect(f'{settings.FRONTEND_BASE_URL}/settings?error=outlook_oauth')

        return HttpResponseRedirect(f'{settings.FRONTEND_BASE_URL}/settings?connected=outlook')


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Google Calendar OAuth
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class GoogleCalendarOAuthStart(APIView):
    """GET /api/integrations/calendar/google/start/"""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            from google_auth_oauthlib.flow import Flow
        except ImportError:
            return Response({'error': 'google-auth-oauthlib not installed.'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        if not settings.GOOGLE_CALENDAR_CLIENT_ID:
            return Response({'error': 'Google Calendar OAuth not configured.'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        redirect_uri = f'{settings.BACKEND_BASE_URL}/api/integrations/calendar/google/callback/'
        flow = Flow.from_client_config(
            {
                'web': {
                    'client_id':     settings.GOOGLE_CALENDAR_CLIENT_ID,
                    'client_secret': settings.GOOGLE_CALENDAR_CLIENT_SECRET,
                    'auth_uri':      'https://accounts.google.com/o/oauth2/auth',
                    'token_uri':     'https://oauth2.googleapis.com/token',
                    'redirect_uris': [redirect_uri],
                }
            },
            scopes=['https://www.googleapis.com/auth/calendar'],
        )
        flow.redirect_uri = redirect_uri
        auth_url, _ = flow.authorization_url(
            access_type='offline',
            state=_make_state(str(request.user.id)),
            prompt='consent',
        )
        return Response({'url': auth_url})


class GoogleCalendarOAuthCallback(APIView):
    """GET /api/integrations/calendar/google/callback/ — AllowAny."""
    permission_classes = [AllowAny]

    def get(self, request):
        code  = request.GET.get('code')
        state = request.GET.get('state')

        if not code or not state:
            return Response({'error': 'Missing code or state.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            user_id = _read_state(state)
        except (signing.SignatureExpired, signing.BadSignature):
            return HttpResponseRedirect(f'{settings.FRONTEND_BASE_URL}/settings?error=gcal_state')

        from django.contrib.auth import get_user_model
        User = get_user_model()
        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return HttpResponseRedirect(f'{settings.FRONTEND_BASE_URL}/settings?error=gcal_user')

        try:
            from google_auth_oauthlib.flow import Flow
            redirect_uri = f'{settings.BACKEND_BASE_URL}/api/integrations/calendar/google/callback/'
            flow = Flow.from_client_config(
                {
                    'web': {
                        'client_id':     settings.GOOGLE_CALENDAR_CLIENT_ID,
                        'client_secret': settings.GOOGLE_CALENDAR_CLIENT_SECRET,
                        'auth_uri':      'https://accounts.google.com/o/oauth2/auth',
                        'token_uri':     'https://oauth2.googleapis.com/token',
                        'redirect_uris': [redirect_uri],
                    }
                },
                scopes=['https://www.googleapis.com/auth/calendar'],
                state=state,
            )
            flow.redirect_uri = redirect_uri
            flow.fetch_token(code=code)
            creds = flow.credentials

            GoogleCalendarIntegration.objects.update_or_create(
                user=user,
                defaults={
                    'access_token_enc':  encrypt_token(creds.token),
                    'refresh_token_enc': encrypt_token(creds.refresh_token) if creds.refresh_token else '',
                    'token_expiry':      creds.expiry,
                    'is_deleted':        False,
                },
            )
        except Exception as exc:
            logger.exception('Google Calendar OAuth callback error: %s', exc)
            return HttpResponseRedirect(f'{settings.FRONTEND_BASE_URL}/settings?error=gcal_oauth')

        return HttpResponseRedirect(f'{settings.FRONTEND_BASE_URL}/settings?connected=google_calendar')


class GoogleCalendarSync(APIView):
    """POST /api/integrations/calendar/google/sync/ — manual sync trigger."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            integration = request.user.google_calendar_integration
        except GoogleCalendarIntegration.DoesNotExist:
            return Response({'error': 'Google Calendar not connected.'}, status=status.HTTP_404_NOT_FOUND)

        try:
            from google.oauth2.credentials import Credentials
            from google.auth.transport.requests import Request
            from googleapiclient.discovery import build
            from Apps.calendar_app.models import CalendarEvent

            access_token  = decrypt_token(integration.access_token_enc)
            refresh_token = decrypt_token(integration.refresh_token_enc) if integration.refresh_token_enc else None
            creds = Credentials(
                token=access_token,
                refresh_token=refresh_token,
                token_uri='https://oauth2.googleapis.com/token',
                client_id=settings.GOOGLE_CALENDAR_CLIENT_ID,
                client_secret=settings.GOOGLE_CALENDAR_CLIENT_SECRET,
            )
            if integration.token_expiry:
                creds.expiry = integration.token_expiry if isinstance(integration.token_expiry, datetime) else datetime.fromisoformat(str(integration.token_expiry))

            if creds.expired and creds.refresh_token:
                creds.refresh(Request())
                integration.access_token_enc = encrypt_token(creds.token)
                integration.token_expiry     = creds.expiry
                integration.save(update_fields=['access_token_enc', 'token_expiry'])

            service = build('calendar', 'v3', credentials=creds)
            cal_id  = integration.synced_calendar_id or 'primary'

            # Pull events from Google (last 7 days to next 30 days)
            from datetime import timezone as tz
            now        = datetime.now(tz.utc)
            time_min   = (now - timedelta(days=7)).isoformat()
            time_max   = (now + timedelta(days=30)).isoformat()
            result     = service.events().list(
                calendarId=cal_id,
                timeMin=time_min,
                timeMax=time_max,
                singleEvents=True,
            ).execute()

            synced = 0
            for item in result.get('items', []):
                g_id    = item.get('id', '')
                summary = item.get('summary', 'Untitled')
                start   = item.get('start', {})
                end     = item.get('end', {})
                start_dt = start.get('dateTime') or f"{start.get('date')}T00:00:00Z"
                end_dt   = end.get('dateTime') or f"{end.get('date')}T23:59:59Z"
                all_day  = 'date' in start and 'dateTime' not in start

                CalendarEvent.objects.update_or_create(
                    user=request.user,
                    google_event_id=g_id,
                    defaults={
                        'title':             summary,
                        'description':       item.get('description', ''),
                        'location':          item.get('location', ''),
                        'start_dt':          start_dt,
                        'end_dt':            end_dt,
                        'all_day':           all_day,
                        'google_calendar_id': cal_id,
                        'is_deleted':        False,
                    },
                )
                synced += 1

            from django.utils import timezone
            integration.save(update_fields=[])  # triggers updated_at
        except Exception as exc:
            logger.exception('Google Calendar sync error: %s', exc)
            return Response({'error': str(exc)}, status=status.HTTP_502_BAD_GATEWAY)

        return Response({'synced': synced})


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# LinkedIn OAuth
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class LinkedInOAuthStart(APIView):
    """GET /api/integrations/linkedin/start/ — returns {url}."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not settings.LINKEDIN_CLIENT_ID:
            return Response({'error': 'LinkedIn OAuth not configured. Set LINKEDIN_CLIENT_ID.'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        import urllib.parse
        redirect_uri = f'{settings.BACKEND_BASE_URL}/api/integrations/linkedin/callback/'
        params = urllib.parse.urlencode({
            'response_type': 'code',
            'client_id':     settings.LINKEDIN_CLIENT_ID,
            'redirect_uri':  redirect_uri,
            'scope':         'r_liteprofile w_member_social r_emailaddress',
            'state':         _make_state(str(request.user.id)),
        })
        return Response({'url': f'https://www.linkedin.com/oauth/v2/authorization?{params}'})


class LinkedInOAuthCallback(APIView):
    """GET /api/integrations/linkedin/callback/ — AllowAny."""
    permission_classes = [AllowAny]

    def get(self, request):
        code  = request.GET.get('code')
        state = request.GET.get('state')

        if not code or not state:
            return Response({'error': 'Missing code or state.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            user_id = _read_state(state)
        except (signing.SignatureExpired, signing.BadSignature):
            return HttpResponseRedirect(f'{settings.FRONTEND_BASE_URL}/settings?error=linkedin_state')

        from django.contrib.auth import get_user_model
        User = get_user_model()
        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return HttpResponseRedirect(f'{settings.FRONTEND_BASE_URL}/settings?error=linkedin_user')

        try:
            import requests as http
            redirect_uri = f'{settings.BACKEND_BASE_URL}/api/integrations/linkedin/callback/'

            # Exchange code for access token
            resp = http.post(
                'https://www.linkedin.com/oauth/v2/accessToken',
                data={
                    'grant_type':    'authorization_code',
                    'code':          code,
                    'redirect_uri':  redirect_uri,
                    'client_id':     settings.LINKEDIN_CLIENT_ID,
                    'client_secret': settings.LINKEDIN_CLIENT_SECRET,
                },
                headers={'Content-Type': 'application/x-www-form-urlencoded'},
            )
            resp.raise_for_status()
            token_data   = resp.json()
            access_token = token_data['access_token']
            expires_in   = token_data.get('expires_in', 5183944)  # ~60 days default
            expiry       = datetime.now(timezone.utc) + timedelta(seconds=expires_in)

            # Fetch LinkedIn profile
            profile_resp = http.get(
                'https://api.linkedin.com/v2/me',
                headers={'Authorization': f'Bearer {access_token}'},
            )
            profile      = profile_resp.json() if profile_resp.ok else {}
            person_id    = profile.get('id', '')
            person_urn   = f'urn:li:person:{person_id}' if person_id else ''
            first_name   = profile.get('localizedFirstName', '')
            last_name    = profile.get('localizedLastName', '')
            display_name = f'{first_name} {last_name}'.strip()

            LinkedInIntegration.objects.update_or_create(
                user=user,
                defaults={
                    'access_token_enc': encrypt_token(access_token),
                    'token_expiry':     expiry,
                    'person_urn':       person_urn,
                    'display_name':     display_name,
                    'is_deleted':       False,
                },
            )
        except Exception as exc:
            logger.exception('LinkedIn OAuth callback error: %s', exc)
            return HttpResponseRedirect(f'{settings.FRONTEND_BASE_URL}/settings?error=linkedin_oauth')

        return HttpResponseRedirect(f'{settings.FRONTEND_BASE_URL}/settings?connected=linkedin')


class LinkedInStatus(APIView):
    """GET /api/integrations/linkedin/status/"""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            integration = request.user.linkedin_integration
            if integration.is_deleted:
                raise LinkedInIntegration.DoesNotExist
            return Response({
                'connected':    True,
                'display_name': integration.display_name,
                'token_expiry': integration.token_expiry,
            })
        except LinkedInIntegration.DoesNotExist:
            return Response({'connected': False, 'display_name': '', 'token_expiry': None})


class LinkedInDisconnect(APIView):
    """DELETE /api/integrations/linkedin/disconnect/"""
    permission_classes = [IsAuthenticated]

    def delete(self, request):
        try:
            integration = request.user.linkedin_integration
            integration.is_deleted = True
            integration.save(update_fields=['is_deleted'])
        except LinkedInIntegration.DoesNotExist:
            pass
        return Response(status=status.HTTP_204_NO_CONTENT)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Scheduled Posts
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def _post_to_linkedin(integration: LinkedInIntegration, content: str) -> str:
    """Post to LinkedIn and return the platform_post_id (URN string)."""
    import requests as http
    access_token = decrypt_token(integration.access_token_enc)
    person_urn   = integration.person_urn

    payload = {
        'author': person_urn,
        'lifecycleState': 'PUBLISHED',
        'specificContent': {
            'com.linkedin.ugc.ShareContent': {
                'shareCommentary': {'text': content},
                'shareMediaCategory': 'NONE',
            }
        },
        'visibility': {'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC'},
    }
    resp = http.post(
        'https://api.linkedin.com/v2/ugcPosts',
        json=payload,
        headers={
            'Authorization':               f'Bearer {access_token}',
            'X-Restli-Protocol-Version':   '2.0.0',
            'Content-Type':                'application/json',
        },
    )
    resp.raise_for_status()
    return resp.json().get('id', '')


class ScheduledPostList(APIView):
    """GET/POST /api/integrations/posts/"""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = ScheduledPost.objects.filter(user=request.user, is_deleted=False)
        return Response(ScheduledPostSerializer(qs, many=True).data)

    def post(self, request):
        platform     = request.data.get('platform', 'linkedin')
        content      = request.data.get('content', '').strip()
        template     = request.data.get('template', '').strip()
        source_row   = request.data.get('source_row', None)
        scheduled_at = request.data.get('scheduled_at', None)

        # Resolve template if provided
        if template and not content:
            from .template_service import resolve_template
            content = resolve_template(template, source_row)

        if not content:
            return Response({'error': 'content or template is required.'}, status=status.HTTP_400_BAD_REQUEST)

        post = ScheduledPost(
            user=request.user,
            platform=platform,
            content=content,
            template=template,
            scheduled_at=scheduled_at,
            source_row_id=source_row,
            status='scheduled' if scheduled_at else 'draft',
        )
        post.save()

        # Post immediately if no scheduled_at
        if not scheduled_at:
            try:
                integration = request.user.linkedin_integration
                platform_post_id = _post_to_linkedin(integration, content)
                from django.utils import timezone
                post.status          = 'sent'
                post.sent_at         = timezone.now()
                post.platform_post_id = platform_post_id
                post.save(update_fields=['status', 'sent_at', 'platform_post_id'])
            except Exception as exc:
                post.status    = 'failed'
                post.error_log = str(exc)
                post.save(update_fields=['status', 'error_log'])

        return Response(ScheduledPostSerializer(post).data, status=status.HTTP_201_CREATED)


class ScheduledPostDetail(APIView):
    """GET/PATCH/DELETE /api/integrations/posts/<id>/"""
    permission_classes = [IsAuthenticated]

    def _get_post(self, id, user):
        return get_object_or_404(ScheduledPost, pk=id, user=user, is_deleted=False)

    def get(self, request, id):
        return Response(ScheduledPostSerializer(self._get_post(id, request.user)).data)

    def patch(self, request, id):
        post = self._get_post(id, request.user)
        for field in ('content', 'template', 'scheduled_at'):
            if field in request.data:
                setattr(post, field, request.data[field])
        if 'scheduled_at' in request.data:
            post.status = 'scheduled' if request.data['scheduled_at'] else 'draft'
        post.save()
        return Response(ScheduledPostSerializer(post).data)

    def delete(self, request, id):
        post = self._get_post(id, request.user)
        post.is_deleted = True
        post.save(update_fields=['is_deleted'])
        return Response(status=status.HTTP_204_NO_CONTENT)


class PostNow(APIView):
    """POST /api/integrations/posts/<id>/post-now/"""
    permission_classes = [IsAuthenticated]

    def post(self, request, id):
        post = get_object_or_404(ScheduledPost, pk=id, user=request.user, is_deleted=False)
        try:
            integration      = request.user.linkedin_integration
            platform_post_id = _post_to_linkedin(integration, post.content)
            from django.utils import timezone
            post.status           = 'sent'
            post.sent_at          = timezone.now()
            post.platform_post_id = platform_post_id
            post.save(update_fields=['status', 'sent_at', 'platform_post_id'])
        except Exception as exc:
            post.status    = 'failed'
            post.error_log = str(exc)
            post.save(update_fields=['status', 'error_log'])
            return Response({'error': str(exc)}, status=status.HTTP_502_BAD_GATEWAY)

        return Response({'status': 'sent', 'platform_post_id': post.platform_post_id})
