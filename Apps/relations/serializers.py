# Apps/relations/serializers.py
"""
Serializers for the Connection model.

What it does:
  Validates and serializes Connection objects for the relations API.
  ConnectionSerializer     — used by ConnectionCreateView (page links).
  BlockConnectionSerializer — used by BlockConnectionListCreateView /
                              BlockConnectionDetailView (canvas arrows).

Files that import this:
  Apps/relations/views.py → ConnectionCreateView, BlockConnectionListCreateView,
                            BlockConnectionDetailView
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


class BlockConnectionSerializer(serializers.ModelSerializer):
    """
    Input (POST /api/relations/block-connections/):
      source_block — UUID of the source block (ownership checked in the view)
      target_block — UUID of the target block (ownership checked in the view)
      arrow_type   — 'link' (default) or 'flow'
      direction    — 'directed' (default, shows arrowhead) or 'undirected'
      label        — optional display label on the arrow

    conn_type is always 'block_link' — set server-side, never from request.
    is_deleted is read-only — use DELETE endpoint to soft-delete.

    Output:
      id, conn_type, source_block, target_block, arrow_type, direction,
      label, metadata, is_deleted, created_at
    """

    class Meta:
        model = Connection
        fields = [
            'id',
            'conn_type',
            'source_block',
            'target_block',
            'arrow_type',
            'direction',
            'label',
            'metadata',
            'is_deleted',
            'created_at',
        ]
        read_only_fields = ['id', 'conn_type', 'is_deleted', 'created_at']
