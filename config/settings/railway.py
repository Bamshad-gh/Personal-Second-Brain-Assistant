from .base import *
import os

DEBUG = False

# Fail fast at startup if SECRET_KEY is not set — never use a default in prod
SECRET_KEY = os.environ['SECRET_KEY']

# ALLOWED_HOSTS: comma-separated env var, e.g. "myapp.railway.app,api.myapp.com"
_hosts_env = os.environ.get('ALLOWED_HOSTS', '')
ALLOWED_HOSTS = [h.strip() for h in _hosts_env.split(',') if h.strip()]
if not ALLOWED_HOSTS:
    raise RuntimeError('ALLOWED_HOSTS env var must be set in production.')

import dj_database_url
DATABASES = {
    'default': dj_database_url.config(
        default=os.environ.get('DATABASE_URL', 'sqlite:///db.sqlite3')
    )
}

# CORS: whitelist specific frontend origin(s) via env var
# e.g. CORS_ALLOWED_ORIGINS="https://spatialscribe.vercel.app"
_cors_origins = os.environ.get('CORS_ALLOWED_ORIGINS', '')
CORS_ALLOW_ALL_ORIGINS = False
CORS_ALLOWED_ORIGINS = [o.strip() for o in _cors_origins.split(',') if o.strip()]

STATIC_ROOT = BASE_DIR / 'staticfiles'
STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'

MIDDLEWARE = ['whitenoise.middleware.WhiteNoiseMiddleware'] + MIDDLEWARE
