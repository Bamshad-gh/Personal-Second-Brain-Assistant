from django.core import signing
from django.conf import settings


def encrypt_token(plaintext: str) -> str:
    """Encrypt a sensitive string (token, password) for storage in the DB."""
    return signing.dumps(plaintext, salt=settings.INTEGRATION_TOKEN_SALT)


def decrypt_token(ciphertext: str) -> str:
    """Decrypt a previously encrypted token. Raises signing.BadSignature if tampered."""
    return signing.loads(ciphertext, salt=settings.INTEGRATION_TOKEN_SALT)
