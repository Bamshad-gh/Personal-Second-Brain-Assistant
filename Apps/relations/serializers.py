# Apps/relations/serializers.py
"""
Serializer for the Connection model.

What it does:
  Validates and serializes Connection objects for the relations API.
  Used by ConnectionCreateView to validate POST input and format output.
  PageBacklinksView uses a custom dict response shape, not this serializer.

Files that import this:
  Apps/relations/views.py → ConnectionCreateView
"""

from rest_framework import serializers
from .models import Connection


class ConnectionSerializer(serializers.ModelSerializer):
    """
    Input (POST /api/relations/):
      conn_type    — ConnectionType choice, e.g. 'page_link'
      source_page  — UUID of the source page (ownership checked in the view)
      target_page  — UUID of the target page (ownership checked in the view)
      metadata     — optional JSON dict; defaults to {}

    Output:
      id, conn_type, source_page, target_page, metadata, created_at
    """

    class Meta:
        model = Connection
        fields = ['id', 'conn_type', 'source_page', 'target_page', 'metadata', 'created_at']
        read_only_fields = ['id', 'created_at']
