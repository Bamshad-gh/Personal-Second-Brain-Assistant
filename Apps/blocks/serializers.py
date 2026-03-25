# Apps/blocks/serializers.py
from rest_framework import serializers
from .models import Block


class BlockSerializer(serializers.ModelSerializer):
    """
    Full block serializer for read operations.
    """

    children_count = serializers.SerializerMethodField()

    class Meta:
        model = Block
        fields = [
            'id',
            'page',
            'parent',
            'block_type',
            'content',
            'order',
            'canvas_x',
            'canvas_y',
            'canvas_w',
            'canvas_h',
            'canvas_z',
            'doc_visible',
            'canvas_visible',
            'bg_color',
            'children_count',
            'is_locked',
            'enc_tier',
            'ai_consent',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_children_count(self, obj):
        return obj.children.filter(is_deleted=False).count()


class BlockCreateSerializer(serializers.ModelSerializer):
    """
    Serializer for creating a new block.
    'id' is read-only but IS returned in the response — the frontend needs
    it to update the block later (useUpdateBlock uses the id for PATCH calls).
    """

    class Meta:
        model = Block
        fields = ['id', 'page', 'parent', 'block_type', 'content', 'order',
                  'canvas_x', 'canvas_y', 'canvas_w', 'canvas_h', 'canvas_z',
                  'doc_visible', 'canvas_visible', 'bg_color']
        read_only_fields = ['id']

    def validate_parent(self, value):
        """Ensure parent belongs to the same page."""
        if value:
            page = self.initial_data.get('page')
            if str(value.page_id) != str(page):
                raise serializers.ValidationError(
                    "Parent block must be on the same page."
                )
        return value


class BlockUpdateSerializer(serializers.ModelSerializer):
    """
    Serializer for updating block content.
    """

    class Meta:
        model = Block
        fields = ['content', 'order', 'parent',
                  'canvas_x', 'canvas_y', 'canvas_w', 'canvas_h', 'canvas_z',
                  'doc_visible', 'canvas_visible', 'bg_color']


class BlockTreeSerializer(serializers.ModelSerializer):
    """
    Serializer for hierarchical block tree (for toggles, kanban cards).
    """

    children = serializers.SerializerMethodField()

    class Meta:
        model = Block
        fields = [
            'id',
            'block_type',
            'content',
            'order',
            'is_locked',
            'children',
        ]

    def get_children(self, obj):
        children = obj.children.filter(is_deleted=False).order_by('order')
        return BlockTreeSerializer(children, many=True).data


class BlockReorderSerializer(serializers.Serializer):
    """
    Serializer for batch reordering blocks.
    """

    blocks = serializers.ListField(
        child=serializers.DictField(
            child=serializers.CharField()
        )
    )

    def validate_blocks(self, value):
        """Validate block IDs and orders."""
        for item in value:
            if 'id' not in item or 'order' not in item:
                raise serializers.ValidationError(
                    "Each block must have 'id' and 'order'."
                )
        return value