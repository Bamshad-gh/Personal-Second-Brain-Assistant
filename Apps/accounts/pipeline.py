
def save_profile(backend, user, response, *args, **kwargs):
    """
    Called after social auth creates or finds the user.
    Maps the provider's profile data to your User model fields.
    'response' = the raw data Google/GitHub sent back.
    """
    changed = False

    if backend.name == 'google-oauth2':
        # Google provides: given_name, family_name, picture, email
        if not user.first_name and response.get('given_name') or not user.last_name and response.get('family_name') :
            user.full_name = response['given_name'] + response['family_name']
            changed = True
        if not user.last_name and response.get('family_name'):
            user.last_name = response['family_name']
            changed = True
        if not user.avatar and response.get('picture'):
            user.avatar = response['picture']
            changed = True

    elif backend.name == 'github':
        # GitHub provides: name (full name), avatar_url, login (username)
        if not user.first_name and response.get('name'):
            parts = response['name'].split(' ', 1)
            user.first_name = parts[0]
            if len(parts) > 1:
                user.last_name = parts[1]
            changed = True
        if not user.avatar and response.get('avatar_url'):
            user.avatar = response['avatar_url']
            changed = True

    if changed:
        user.save()