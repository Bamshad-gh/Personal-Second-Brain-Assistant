# Apps/workspaces/serializers.py
from rest_framework import serializers
from .models import Workspace


class WorkspaceSerializer(serializers.ModelSerializer):
    """
    Full workspace serializer for read operations.
    Includes computed fields for frontend convenience.
    """

    page_count = serializers.SerializerMethodField()
    owner_name = serializers.CharField(source='owner.display_name', read_only=True)

    class Meta:
        model = Workspace
        fields = [
            'id',
            'name',
            'icon',
            'color',
            'description',
            'is_personal',
            'storage_used_mb',
            'owner_name',
            'page_count',
            'is_locked',
            'enc_tier',
            'ai_consent',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'owner', 'created_at', 'updated_at', 'storage_used_mb']

    def get_page_count(self, obj):
        """Return count of non-deleted pages in this workspace."""
        return obj.pages.filter(is_deleted=False).count()


class WorkspaceCreateSerializer(serializers.ModelSerializer):
    """
    Serializer for creating a new workspace.
    Owner is automatically set from request.user.
    """

    class Meta:
        model = Workspace
        fields = ['name', 'icon', 'color', 'description']

    def create(self, validated_data):
        validated_data['owner'] = self.context['request'].user
        return super().create(validated_data)


class WorkspaceUpdateSerializer(serializers.ModelSerializer):
    """
    Serializer for updating workspace details.
    Only allows updating specific fields.
    """

    class Meta:
        model = Workspace
        fields = ['name', 'icon', 'color', 'description']


class WorkspaceListSerializer(serializers.ModelSerializer):
    """
    Minimal serializer for listing workspaces in sidebar.
    """

    page_count = serializers.SerializerMethodField()

    class Meta:
        model = Workspace
        fields = ['id', 'name', 'icon', 'color', 'page_count', 'is_locked', 'updated_at']

    def get_page_count(self, obj):
        return obj.pages.filter(is_deleted=False).count()