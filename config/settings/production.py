from .base import *
import os

DEBUG = False
SECRET_KEY = os.environ['SECRET_KEY']

ALLOWED_HOSTS = [
    os.environ.get('DOMAIN', ''),
    os.environ.get('VPS_IP', ''),
]

# Database — PostgreSQL
DATABASES = {
    'default': {
        'ENGINE':   'django.db.backends.postgresql',
        'NAME':     os.environ['DB_NAME'],
        'USER':     os.environ['DB_USER'],
        'PASSWORD': os.environ['DB_PASSWORD'],
        'HOST':     os.environ.get('DB_HOST', 'localhost'),
        'PORT':     os.environ.get('DB_PORT', '5432'),
        'CONN_MAX_AGE': 60,
    }
}

# Security
SECURE_BROWSER_XSS_FILTER      = True
SECURE_CONTENT_TYPE_NOSNIFF    = True
X_FRAME_OPTIONS                = 'SAMEORIGIN'
SECURE_SSL_REDIRECT            = False
SESSION_COOKIE_SECURE          = False
CSRF_COOKIE_SECURE             = False
CSRF_TRUSTED_ORIGINS = ['http://37.27.42.231']
SECURE_HSTS_SECONDS            = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True

# CORS — allow Vercel frontend
CORS_ALLOW_ALL_ORIGINS = False
CORS_ALLOWED_ORIGINS = [
    f"http://{os.environ.get('FRONTEND_DOMAIN', '')}",
    f"https://{os.environ.get('FRONTEND_DOMAIN', '')}",
    'http://37.27.42.231',
    'https://spatialscribe.com',
    'https://www.spatialscribe.com',
]
CORS_ALLOW_CREDENTIALS = True

# Static + Media
STATIC_ROOT = BASE_DIR / 'staticfiles'
STATIC_URL  = '/static/'
MEDIA_ROOT  = BASE_DIR / 'media'
MEDIA_URL   = f"https://{os.environ.get('DOMAIN', '')}/media/"

# Whitenoise — serve static files efficiently from Django/Gunicorn
MIDDLEWARE = ['whitenoise.middleware.WhiteNoiseMiddleware'] + MIDDLEWARE
STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'

# Email (for password reset)
EMAIL_BACKEND       = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST          = os.environ.get('EMAIL_HOST', '')
EMAIL_PORT          = 587
EMAIL_USE_TLS       = True
EMAIL_HOST_USER     = os.environ.get('EMAIL_USER', '')
EMAIL_HOST_PASSWORD = os.environ.get('EMAIL_PASSWORD', '')

# Logging
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '{asctime} {levelname} {module} {message}',
            'style':  '{',
        },
    },
    'handlers': {
        'file': {
            'class':     'logging.FileHandler',
            'filename':  '/var/log/spatialscribe/django.log',
            'formatter': 'verbose',
        },
    },
    'root': {
        'handlers': ['file'],
        'level':    'WARNING',
    },
}
