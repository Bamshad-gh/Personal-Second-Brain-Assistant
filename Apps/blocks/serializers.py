# Apps/blocks/serializers.py

from rest_framework import serializers
from .models import Block, VALID_BLOCK_TYPES


class BlockSerializer(serializers.ModelSerializer):
    """
    Full read serializer for GET responses.

    Includes three computed fields backed by the BLOCK_TYPE_REGISTRY:
      category       — logical group (text, list, code, media, ...)
      has_children   — whether this block type supports nested children
      children_count — count of non-deleted direct children
    """

    children_count = serializers.SerializerMethodField()
    category       = serializers.ReadOnlyField()   # delegates to Block.category property
    has_children   = serializers.ReadOnlyField()   # delegates to Block.has_children property

    class Meta:
        model  = Block
        fields = [
            'id', 'page', 'parent',
            'block_type', 'category', 'has_children',
            'content', 'order',
            'canvas_x', 'canvas_y', 'canvas_w', 'canvas_h', 'canvas_z',
            'doc_visible', 'canvas_visible',
            'bg_color', 'enc_tier', 'ai_consent',
            'is_locked', 'is_deleted',
            'children_count', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_children_count(self, obj):
        return obj.children.filter(is_deleted=False).count()

    def validate_block_type(self, value):
        if value not in VALID_BLOCK_TYPES:
            raise serializers.ValidationError(
                f"Invalid block_type '{value}'. Valid types: {VALID_BLOCK_TYPES}"
            )
        return value


class BlockCreateSerializer(serializers.ModelSerializer):
    """
    Write serializer for POST /api/blocks/.

    'id' is read-only but IS returned in the response — the frontend needs it
    to reference the new block for subsequent PATCH calls.
    Validates block_type against BLOCK_TYPE_REGISTRY (no migration required
    when new types are added — only a registry entry is needed).
    """

    class Meta:
        model  = Block
        fields = [
            'id', 'page', 'parent', 'block_type', 'content', 'order',
            'canvas_x', 'canvas_y', 'canvas_w', 'canvas_h', 'canvas_z',
            'doc_visible', 'canvas_visible', 'bg_color',
        ]
        read_only_fields = ['id']

    def validate_block_type(self, value):
        if value not in VALID_BLOCK_TYPES:
            raise serializers.ValidationError(
                f"Invalid block_type. Valid types: {VALID_BLOCK_TYPES}"
            )
        return value

    def validate_parent(self, value):
        """Ensure the parent block belongs to the same page."""
        if value:
            page = self.initial_data.get('page')
            if str(value.page_id) != str(page):
                raise serializers.ValidationError(
                    "Parent block must be on the same page."
                )
        return value


class BlockUpdateSerializer(serializers.ModelSerializer):
    """
    Write serializer for PATCH /api/blocks/{id}/.

    All fields are optional — the view always calls with partial=True.
    block_type is now accepted here (safe because it is validated against
    BLOCK_TYPE_REGISTRY before saving).
    """

    class Meta:
        model  = Block
        fields = [
            'block_type', 'content', 'order', 'parent',
            'canvas_x', 'canvas_y', 'canvas_w', 'canvas_h', 'canvas_z',
            'doc_visible', 'canvas_visible', 'bg_color',
            'is_locked', 'enc_tier', 'ai_consent',
        ]

    def validate_block_type(self, value):
        # value may be absent in a partial PATCH — only validate when present
        if value and value not in VALID_BLOCK_TYPES:
            raise serializers.ValidationError(
                f"Invalid block_type. Valid types: {VALID_BLOCK_TYPES}"
            )
        return value


class BlockTreeSerializer(serializers.ModelSerializer):
    """
    Recursive read serializer for GET /api/blocks/{id}/tree/.

    Returns the block with all non-deleted children nested under a 'children'
    key. Used for toggle blocks and kanban cards that contain child blocks.
    """

    children = serializers.SerializerMethodField()

    class Meta:
        model  = Block
        fields = [
            'id', 'block_type', 'content', 'order', 'is_locked', 'children',
        ]

    def get_children(self, obj):
        children = obj.children.filter(is_deleted=False).order_by('order')
        return BlockTreeSerializer(children, many=True).data


class BlockReorderSerializer(serializers.Serializer):
    """
    Bulk reorder serializer for POST /api/blocks/reorder/.

    HOW FRACTIONAL ORDERING WORKS:
      Float order values allow insertion without reindexing all siblings:
        [1.0, 2.0, 3.0] → insert between 1 and 2 → order = 1.5
        Insert at start: new_order = first_order - 1.0
        Insert at end:   new_order = last_order  + 1.0
      This prevents the N-update cascade that integer ordering would require.

    Expected payload:
      { "blocks": [{"id": "<uuid>", "order": 1.5}, ...] }
    """

    blocks = serializers.ListField(child=serializers.DictField())

    def validate_blocks(self, value):
        for item in value:
            if 'id' not in item or 'order' not in item:
                raise serializers.ValidationError(
                    "Each item must have 'id' and 'order'."
                )
        return value
