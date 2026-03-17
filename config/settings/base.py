# ════════════════════════════════════════════════════════════════
# config/settings/base.py — shared by ALL environments
# ════════════════════════════════════════════════════════════════
from pathlib import Path
import environ
from decouple import config

env = environ.Env(DEBUG=(bool, False))

# BASE_DIR must go up 3 levels: base.py → settings/ → config/ → project root
BASE_DIR = Path(__file__).resolve().parent.parent.parent

environ.Env.read_env(BASE_DIR / '.env')   # load .env file

SECRET_KEY = env('SECRET_KEY')            # from .env — never hardcode

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    # Third party apps
    'rest_framework',
    'corsheaders',
    'django_filters',
    'social_django',
    # my apps
    'Apps.accounts',
    'Apps.workspaces',
    'Apps.pages',
    'Apps.blocks',
    'Apps.properties',
    'Apps.relations',
    'Apps.ai_agent'


]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',           # must be first — adds CORS headers before any other middleware can short-circuit the response
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'

AUTH_USER_MODEL = 'accounts.User'

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]
# OAuth authentication backends (in addition to normal Django auth)
AUTHENTICATION_BACKENDS = [
    'social_core.backends.google.GoogleOAuth2',
    'social_core.backends.github.GithubOAuth2',
    'django.contrib.auth.backends.ModelBackend',   # keep for email/password
]

LANGUAGE_CODE = 'en-us'
TIME_ZONE     = 'UTC'
USE_I18N      = True
USE_TZ        = True

STATIC_URL  = '/static/'
STATICFILES_DIRS = [BASE_DIR / 'static']
STATIC_ROOT = BASE_DIR / 'staticfiles'

MEDIA_URL  = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_FILTER_BACKENDS': [
        'django_filters.rest_framework.DjangoFilterBackend',
        'rest_framework.filters.SearchFilter',
        'rest_framework.filters.OrderingFilter',
    ],
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 20,
}

# ── AI provider configuration ────────────────────────────────────────────────
#
# HOW TO ADD / SWITCH AI PROVIDERS
# ─────────────────────────────────
# 1. Set AI_PROVIDER to 'anthropic' or 'openai' in your .env file
# 2. Add the corresponding API key to .env
# 3. To add a brand-new provider: see Apps/ai_agent/services.py → PROVIDERS dict
#
# WHERE TO FIND THINGS:
#   Provider classes:   Apps/ai_agent/services.py
#   API endpoints:      Apps/ai_agent/views.py + urls.py (registered as /api/ai/)
#   Action list:        Apps/ai_agent/services.py → SYSTEM_PROMPTS
#   Frontend panel:     src/components/ai/AiPanel.tsx → QUICK_ACTIONS
#   Frontend API call:  src/lib/api.ts → aiApi

AI_PROVIDER = config('AI_PROVIDER', default='anthropic')  # 'anthropic' | 'openai'

# API keys — set these in your .env file, never hardcode them here
ANTHROPIC_API_KEY = config('ANTHROPIC_API_KEY', default='')
OPENAI_API_KEY    = config('OPENAI_API_KEY',    default='')

# Model IDs per provider.
# To change the model: update the value here and restart the backend.
# 'default' = used for most actions (more capable)
# 'fast'    = used for quick/simple actions (cheaper, faster)
AI_MODELS = {
    'anthropic': {
        'default': 'claude-sonnet-4-6',          # Claude Sonnet 4.6
        'fast':    'claude-haiku-4-5-20251001',   # Claude Haiku 4.5
    },
    'openai': {
        'default': 'gpt-4o',
        'fast':    'gpt-4o-mini',
    },
}

# Max tokens the AI can return in a single response
AI_MAX_TOKENS = 2048

# Google credentials (from console.cloud.google.com → Credentials → OAuth 2.0)
# SOCIAL_AUTH_GOOGLE_OAUTH2_KEY    = config('GOOGLE_CLIENT_ID')
# SOCIAL_AUTH_GOOGLE_OAUTH2_SECRET = config('GOOGLE_CLIENT_SECRET')
# SOCIAL_AUTH_GOOGLE_OAUTH2_SCOPE  = ['email', 'profile']

# # GitHub credentials (from github.com → Settings → Developer settings → OAuth Apps)
# SOCIAL_AUTH_GITHUB_KEY    = config('GITHUB_CLIENT_ID')
# SOCIAL_AUTH_GITHUB_SECRET = config('GITHUB_CLIENT_SECRET')
# SOCIAL_AUTH_GITHUB_SCOPE  = ['user:email']

SOCIAL_AUTH_PIPELINE = (
    'social_core.pipeline.social_auth.social_details',
    'social_core.pipeline.social_auth.social_uid',
    'social_core.pipeline.social_auth.auth_allowed',
    'social_core.pipeline.social_auth.social_user',
    'social_core.pipeline.user.get_username',
    'social_core.pipeline.user.create_user',
    'social_core.pipeline.social_auth.associate_user',
    'social_core.pipeline.social_auth.load_extra_data',
    'users.pipeline.save_profile',      # your custom step: save avatar, name
)

LOGIN_REDIRECT_URL  = '/dashboard/'
LOGOUT_REDIRECT_URL = '/login/'