"""
Email sender service — routes outgoing email through the user's connected
EmailIntegration (Gmail, Outlook, or SMTP), or falls back to Django's
EMAIL_HOST backend if no integration is configured.

Usage:
    from Apps.integrations.sender import send_email
    result = send_email(user=request.user, to=['a@b.com'], subject='Hi', body='Hello')
    # result = {'sent': True, 'via': 'gmail'}
"""

import smtplib
import logging
from datetime import datetime, timezone
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from django.conf import settings
from django.core.mail import send_mail
from werkzeug import Request

from .crypto import decrypt_token
from .models import EmailIntegration

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Provider implementations
# ─────────────────────────────────────────────────────────────────────────────

def _send_via_gmail(integration: EmailIntegration, to: list[str], subject: str, body: str) -> None:
    """
    Send via Gmail API using google-api-python-client.
    Refreshes the access token if it has expired before sending.
    """
    import base64
    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request
    from googleapiclient.discovery import build

    access_token  = decrypt_token(integration.access_token_enc)
    refresh_token = decrypt_token(integration.refresh_token_enc) if integration.refresh_token_enc else None
    expiry        = integration.token_expiry

    creds = Credentials(
        token=access_token,
        refresh_token=refresh_token,
        token_uri='https://oauth2.googleapis.com/token',
        client_id=settings.GOOGLE_GMAIL_CLIENT_ID,
        client_secret=settings.GOOGLE_GMAIL_CLIENT_SECRET,
    )
    if expiry:
        import datetime as _dt
        _expiry = expiry if isinstance(expiry, _dt.datetime) else _dt.datetime.fromisoformat(str(expiry))
        if _expiry.tzinfo is None:
            _expiry = _expiry.replace(tzinfo=_dt.timezone.utc)
        creds.expiry = _expiry

    if creds.refresh_token:
        creds.refresh(Request())
        # Persist refreshed token
        from .crypto import encrypt_token
        integration.access_token_enc = encrypt_token(creds.token)
        integration.token_expiry     = creds.expiry
        integration.save(update_fields=['access_token_enc', 'token_expiry'])

    service = build('gmail', 'v1', credentials=creds)

    msg = MIMEMultipart('alternative')
    msg['Subject'] = subject
    msg['From']    = integration.email
    msg['To']      = ', '.join(to)
    msg.attach(MIMEText(body, 'plain'))

    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
    service.users().messages().send(userId='me', body={'raw': raw}).execute()


def _send_via_outlook(integration: EmailIntegration, to: list[str], subject: str, body: str) -> None:
    """
    Send via Microsoft Graph API.
    Refreshes access token via Microsoft token endpoint if expired.
    """
    import requests as http

    access_token = decrypt_token(integration.access_token_enc)

    # Refresh if expired
    if integration.token_expiry and integration.token_expiry <= datetime.now(timezone.utc):
        refresh_token = decrypt_token(integration.refresh_token_enc)
        resp = http.post(
            'https://login.microsoftonline.com/common/oauth2/v2.0/token',
            data={
                'grant_type':    'refresh_token',
                'client_id':     settings.OUTLOOK_CLIENT_ID,
                'client_secret': settings.OUTLOOK_CLIENT_SECRET,
                'refresh_token': refresh_token,
                'scope':         'Mail.Send offline_access',
            },
        )
        resp.raise_for_status()
        token_data  = resp.json()
        access_token = token_data['access_token']
        from .crypto import encrypt_token
        import dateutil.parser
        from datetime import timedelta
        integration.access_token_enc  = encrypt_token(access_token)
        integration.refresh_token_enc = encrypt_token(token_data.get('refresh_token', refresh_token))
        integration.token_expiry      = datetime.now(timezone.utc) + timedelta(seconds=token_data.get('expires_in', 3600))
        integration.save(update_fields=['access_token_enc', 'refresh_token_enc', 'token_expiry'])

    payload = {
        'message': {
            'subject': subject,
            'body': {'contentType': 'Text', 'content': body},
            'toRecipients': [{'emailAddress': {'address': addr}} for addr in to],
        },
        'saveToSentItems': True,
    }
    resp = http.post(
        'https://graph.microsoft.com/v1.0/me/sendMail',
        json=payload,
        headers={'Authorization': f'Bearer {access_token}', 'Content-Type': 'application/json'},
    )
    resp.raise_for_status()


def _send_via_smtp(integration: EmailIntegration, to: list[str], subject: str, body: str) -> None:
    """Send via user's custom SMTP server."""
    password = decrypt_token(integration.smtp_password_enc) if integration.smtp_password_enc else ''
    port     = integration.smtp_port or 587
    host     = integration.smtp_host

    msg = MIMEMultipart('alternative')
    msg['Subject'] = subject
    msg['From']    = integration.email or integration.smtp_username
    msg['To']      = ', '.join(to)
    msg.attach(MIMEText(body, 'plain'))

    with smtplib.SMTP(host, port, timeout=15) as server:
        if integration.smtp_use_tls:
            server.starttls()
        if integration.smtp_username and password:
            server.login(integration.smtp_username, password)
        server.sendmail(msg['From'], to, msg.as_string())


def _send_via_django(to: list[str], subject: str, body: str) -> None:
    """Fallback: Django's configured EMAIL_HOST backend."""
    send_mail(
        subject=subject,
        message=body,
        from_email=getattr(settings, 'DEFAULT_FROM_EMAIL', None),
        recipient_list=to,
        fail_silently=False,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Dispatch table — add new providers here without touching send_email()
# ─────────────────────────────────────────────────────────────────────────────

SENDERS = {
    'gmail':   _send_via_gmail,
    'outlook': _send_via_outlook,
    'smtp':    _send_via_smtp,
}


# ─────────────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────────────

def send_email(
    user,
    to: list[str],
    subject: str,
    body: str,
    integration_id: str | None = None,
) -> dict:
    """
    Send an email on behalf of `user`.

    Lookup order:
      1. If integration_id given, use that specific integration.
      2. Otherwise use the user's default integration (is_default=True).
      3. If no integration found, fall back to Django's EMAIL_HOST backend.

    Returns {'sent': True, 'via': provider_name}.
    Raises ValueError if the specified integration_id is not found.
    Raises Exception (from provider) if sending fails.
    """
    integration = None

    if integration_id:
        integration = EmailIntegration.objects.filter(
            pk=integration_id,
            user=user,
            is_deleted=False,
        ).first()
        if not integration:
            raise ValueError(f'EmailIntegration {integration_id} not found for user.')
    else:
        integration = EmailIntegration.objects.filter(
            user=user,
            is_default=True,
            is_deleted=False,
        ).first()

    if integration is None:
        # Fallback to Django's configured email backend
        _send_via_django(to, subject, body)
        return {'sent': True, 'via': 'django'}

    sender_fn = SENDERS.get(integration.provider)
    if not sender_fn:
        raise ValueError(f"Unknown provider '{integration.provider}'")

    sender_fn(integration, to, subject, body)
    return {'sent': True, 'via': integration.provider}
