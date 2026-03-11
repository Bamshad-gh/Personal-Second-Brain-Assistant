# ════════════════════════════════════════════════════════════════
# config/settings/dev.py — your laptop only
# ════════════════════════════════════════════════════════════════
from .base import *   # ← imports everything from base.py, then overrides below

DEBUG = True

ALLOWED_HOSTS = ['localhost', '127.0.0.1']

# SQLite — zero setup, file-based, perfect for development
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME':   BASE_DIR / 'db.sqlite3',
    }
}

# Print emails to the terminal instead of actually sending them
EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'

# Allow React and Vite dev servers to call your API
CORS_ALLOWED_ORIGINS = [
    'http://localhost:3000',
    'http://localhost:5173',
]

# Django Debug Toolbar (optional — pip install django-debug-toolbar)
# INSTALLED_APPS += ['debug_toolbar']
# MIDDLEWARE    += ['debug_toolbar.middleware.DebugToolbarMiddleware']
# INTERNAL_IPS   = ['127.0.0.1']