# ════════════════════════════════════════════════════════════════
# config/settings/prod.py — your server only
# ════════════════════════════════════════════════════════════════
from .base import *

DEBUG = False   # ← NEVER True in production — exposes source code and errors

SECRET_KEY    = env('SECRET_KEY')           # must be in server's .env
ALLOWED_HOSTS = env.list('ALLOWED_HOSTS')   # e.g. ALLOWED_HOSTS=myapp.com,www.myapp.com

# PostgreSQL — production database
DATABASES = {
    'default': {
        'ENGINE':       'django.db.backends.postgresql',
        'NAME':         env('DB_NAME'),
        'USER':         env('DB_USER'),
        'PASSWORD':     env('DB_PASSWORD'),
        'HOST':         env('DB_HOST', default='localhost'),
        'PORT':         env('DB_PORT', default='5432'),
        'CONN_MAX_AGE': 60,   # reuse DB connections for 60s (performance)
    }
}

# Real email via SMTP
EMAIL_BACKEND  = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST     = env('EMAIL_HOST', default='smtp.gmail.com')
EMAIL_PORT     = 587
EMAIL_USE_TLS  = True
EMAIL_HOST_USER     = env('EMAIL_HOST_USER')
EMAIL_HOST_PASSWORD = env('EMAIL_HOST_PASSWORD')
DEFAULT_FROM_EMAIL  = env('DEFAULT_FROM_EMAIL', default=EMAIL_HOST_USER)

# HTTPS security headers — required once SSL is set up on the server
SECURE_SSL_REDIRECT              = True    # redirect all HTTP → HTTPS
SECURE_HSTS_SECONDS              = 31536000  # tell browsers: always use HTTPS for 1 year
SECURE_HSTS_INCLUDE_SUBDOMAINS   = True
SECURE_HSTS_PRELOAD              = True
SESSION_COOKIE_SECURE            = True    # only send session cookie over HTTPS
CSRF_COOKIE_SECURE               = True    # only send CSRF cookie over HTTPS
X_FRAME_OPTIONS                  = 'DENY'  # prevent clickjacking

# CORS — only allow your actual frontend domain
CORS_ALLOWED_ORIGINS = env.list('CORS_ALLOWED_ORIGINS')
# In .env: CORS_ALLOWED_ORIGINS=https://myapp.com,https://www.myapp.com

# Logging — write errors to a file on the server
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {
        'file': {
            'level': 'ERROR',
            'class': 'logging.FileHandler',
            'filename': BASE_DIR / 'logs' / 'django_errors.log',
        },
    },
    'loggers': {
        'django': {
            'handlers': ['file'],
            'level':    'ERROR',
            'propagate': True,
        },
    },
}
