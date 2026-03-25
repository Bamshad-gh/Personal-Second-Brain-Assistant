from .base import *
import os

DEBUG = False
SECRET_KEY = os.environ.get('SECRET_KEY', 'fallback-key-change-this')
ALLOWED_HOSTS = ['*']

import dj_database_url
DATABASES = {
    'default': dj_database_url.config(
        default=os.environ.get('DATABASE_URL', 'sqlite:///db.sqlite3')
    )
}

CORS_ALLOW_ALL_ORIGINS = True
STATIC_ROOT = BASE_DIR / 'staticfiles'
STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'

MIDDLEWARE = ['whitenoise.middleware.WhiteNoiseMiddleware'] + MIDDLEWARE
