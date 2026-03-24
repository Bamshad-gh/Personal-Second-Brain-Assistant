"""
Apps/pages/management/commands/seed_gallery.py

Downloads 6 curated Unsplash cover images into media/gallery/.
Idempotent — skips files that already exist.

Usage:
    python manage.py seed_gallery
"""

import os
import urllib.request
from django.core.management.base import BaseCommand


IMAGES = [
    ('gallery_01.jpg', 'https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=1200&q=80'),
    ('gallery_02.jpg', 'https://images.unsplash.com/photo-1518020382113-a7e8fc38eac9?w=1200&q=80'),
    ('gallery_03.jpg', 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200&q=80'),
    ('gallery_04.jpg', 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1200&q=80'),
    ('gallery_05.jpg', 'https://images.unsplash.com/photo-1477346611705-65d1883cee1e?w=1200&q=80'),
    ('gallery_06.jpg', 'https://images.unsplash.com/photo-1501854140801-50d01698950b?w=1200&q=80'),
]


class Command(BaseCommand):
    help = 'Download 6 starter cover images into media/gallery/'

    def handle(self, *args, **options):
        dest = os.path.join('media', 'gallery')
        os.makedirs(dest, exist_ok=True)

        for name, url in IMAGES:
            path = os.path.join(dest, name)
            if os.path.exists(path):
                self.stdout.write(f'  skip  {name} (already exists)')
                continue
            self.stdout.write(f'  fetch {name} ...')
            try:
                urllib.request.urlretrieve(url, path)
                self.stdout.write(self.style.SUCCESS(f'  saved {path}'))
            except Exception as exc:
                self.stderr.write(self.style.ERROR(f'  FAILED {name}: {exc}'))

        self.stdout.write(self.style.SUCCESS('Done.'))
