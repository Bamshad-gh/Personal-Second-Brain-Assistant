# Apps/properties/serializers.py
#
# Serializers for the properties system.
# Consumed by views.py — one serializer per model.
#
# PageTypeGroupSerializer    — CRUD for named/coloured type groups
# CustomPageTypeSerializer   — CRUD for user-defined page categories
# PropertyDefinitionSerializer — CRUD for typed field schemas
# PropertyValueSerializer    — CRUD for per-page field values

from rest_framework import serializers
from .models import CustomPageType, PageTypeGroup, PropertyDefinition, PropertyValue


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Page Type Group
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class PageTypeGroupSerializer(serializers.ModelSerializer):
    class Meta:
        model  = PageTypeGroup
        fields = ['id', 'workspace', 'name', 'color', 'order', 'created_at']
        read_only_fields = ['id', 'created_at']


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Custom Page Type
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class CustomPageTypeSerializer(serializers.ModelSerializer):
    # Write: accept a group UUID (or null) to assign/unassign the type
    group = serializers.PrimaryKeyRelatedField(
        queryset=PageTypeGroup.objects.filter(is_deleted=False),
        allow_null=True,
        required=False,
    )
    # Read: full nested group object returned alongside the FK id
    group_detail = PageTypeGroupSerializer(source='group', read_only=True)

    class Meta:
        model  = CustomPageType
        fields = [
            'id', 'workspace', 'name', 'icon', 'description',
            'group', 'group_detail', 'is_pinned',
            'default_color', 'default_icon',
        ]
        read_only_fields = ['id']


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Property Definition
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class PropertyDefinitionSerializer(serializers.ModelSerializer):
    class Meta:
        model  = PropertyDefinition
        fields = [
            'id', 'workspace', 'custom_page_type', 'page_type',
            'name', 'prop_type', 'options', 'order', 'is_global',
        ]
        read_only_fields = ['id']


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Property Value
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class PropertyValueSerializer(serializers.ModelSerializer):
    class Meta:
        model  = PropertyValue
        fields = [
            'id', 'page', 'definition',
            'value_text', 'value_number', 'value_date',
            'value_bool', 'value_json',
        ]
        read_only_fields = ['id']
