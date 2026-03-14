# Apps/pages/serializers.py
from rest_framework import serializers
from .models import Page


class PageSerializer(serializers.ModelSerializer):
    """
    Full page serializer for read operations.
    """

    created_by_name = serializers.CharField(source='created_by.display_name', read_only=True)
    children_count = serializers.SerializerMethodField()
    block_count = serializers.SerializerMethodField()

    class Meta:
        model = Page
        fields = [
            'id',
            'workspace',
            'parent',
            'created_by',
            'created_by_name',
            'page_type',
            'view_mode',
            'title',
            'icon',
            'header_pic',
            'is_pinned',
            'children_count',
            'block_count',
            'is_locked',
            'enc_tier',
            'ai_consent',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_by', 'created_at', 'updated_at']

    def get_children_count(self, obj):
        return obj.children.filter(is_deleted=False).count()

    def get_block_count(self, obj):
        return obj.blocks.filter(is_deleted=False).count()


class PageCreateSerializer(serializers.ModelSerializer):
    """
    Serializer for creating a new page.
    'id' is read-only so the backend assigns it, but it IS returned in the
    response — the frontend needs it to navigate to the newly created page.
    """

    class Meta:
        model = Page
        fields = ['id', 'workspace', 'parent', 'page_type', 'title', 'icon', 'view_mode']
        read_only_fields = ['id']

    def validate_parent(self, value):
        """Ensure parent belongs to the same workspace."""
        if value:
            workspace = self.initial_data.get('workspace')
            if str(value.workspace_id) != str(workspace):
                raise serializers.ValidationError(
                    "Parent page must be in the same workspace."
                )
        return value


class PageUpdateSerializer(serializers.ModelSerializer):
    """
    Serializer for updating page details.
    """

    class Meta:
        model = Page
        fields = ['title', 'icon', 'header_pic', 'is_pinned', 'parent', 'page_type', 'view_mode']

    def validate_parent(self, value):
        """Prevent making page a child of itself."""
        if value and value.id == self.instance.id:
            raise serializers.ValidationError(
                "A page cannot be its own parent."
            )
        return value


class PageTreeSerializer(serializers.ModelSerializer):
    """
    Serializer for hierarchical page tree in sidebar.
    Includes children recursively.
    """

    children = serializers.SerializerMethodField()

    class Meta:
        model = Page
        fields = [
            'id',
            'title',
            'icon',
            'page_type',
            'is_pinned',
            'is_locked',
            'children',
        ]

    def get_children(self, obj):
        """Get non-deleted children of this page."""
        # Use prefetched pages if available, otherwise query
        if hasattr(self.context.get('all_pages'), '__iter__'):
            # Filter from passed pages queryset (more efficient)
            children = [p for p in self.context['all_pages'] if p.parent_id == obj.id]
        else:
            children = obj.children.filter(is_deleted=False)

        return PageTreeSerializer(children, many=True, context=self.context).data


class PageListSerializer(serializers.ModelSerializer):
    """
    Minimal serializer for listing pages.
    """

    class Meta:
        model = Page
        fields = [
            'id',
            'title',
            'icon',
            'page_type',
            'is_pinned',
            'is_locked',
            'updated_at',
        ]


class PageWithBlocksSerializer(serializers.ModelSerializer):
    """
    Full page with all blocks for editor view.
    """

    blocks = serializers.SerializerMethodField()

    class Meta:
        model = Page
        fields = [
            'id',
            'workspace',
            'parent',
            'page_type',
            'view_mode',
            'title',
            'icon',
            'header_pic',
            'is_pinned',
            'is_locked',
            'enc_tier',
            'ai_consent',
            'created_at',
            'updated_at',
            'blocks',
        ]

    def get_blocks(self, obj):
        """Get all blocks for this page."""
        from Apps.blocks.serializers import BlockSerializer
        blocks = obj.blocks.filter(is_deleted=False, parent__isnull=True).order_by('order')
        return BlockSerializer(blocks, many=True).data