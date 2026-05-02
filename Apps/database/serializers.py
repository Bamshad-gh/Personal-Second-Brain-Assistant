# Apps/database/serializers.py
#
# Serializers for the database block system.
#
# PropertyDefinitionSerializer is imported from properties app — reused, not rebuilt.
# DatabaseColumnSerializer wraps it with ordering info.
# DatabaseCellSerializer mirrors PropertyValueSerializer pattern.
# DatabaseRowSerializer nests cells for read.
# DatabaseViewSerializer nests columns + row count for read.

from rest_framework import serializers
from Apps.properties.serializers import PropertyDefinitionSerializer
from .models import DatabaseCell, DatabaseColumn, DatabaseRow, DatabaseView


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Cell
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class DatabaseCellSerializer(serializers.ModelSerializer):
    class Meta:
        model  = DatabaseCell
        fields = [
            'id', 'row', 'definition',
            'value_text', 'value_number', 'value_date',
            'value_bool', 'value_json',
        ]
        read_only_fields = ['id']


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Column
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class DatabaseColumnSerializer(serializers.ModelSerializer):
    # Full definition object on read
    definition = PropertyDefinitionSerializer(read_only=True)
    # Accept definition UUID on write
    definition_id = serializers.UUIDField(write_only=True)

    class Meta:
        model  = DatabaseColumn
        fields = ['id', 'database_view', 'definition', 'definition_id', 'order']
        read_only_fields = ['id', 'database_view']


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Row
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class DatabaseRowSerializer(serializers.ModelSerializer):
    cells = DatabaseCellSerializer(many=True, read_only=True)

    class Meta:
        model  = DatabaseRow
        fields = ['id', 'database_view', 'page', 'order', 'cells']
        read_only_fields = ['id', 'database_view', 'cells']


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# View
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class DatabaseViewSerializer(serializers.ModelSerializer):
    columns   = serializers.SerializerMethodField()
    row_count = serializers.SerializerMethodField()

    class Meta:
        model  = DatabaseView
        fields = [
            'id', 'block', 'custom_page_type', 'view_type',
            'filters', 'sorts', 'hidden_fields',
            'columns', 'row_count',
        ]
        read_only_fields = ['id', 'block', 'columns', 'row_count']

    def get_columns(self, obj):
        if obj.custom_page_type_id:
            # Query mode: columns come from the page type's PropertyDefinitions
            props = obj.custom_page_type.properties.filter(is_deleted=False)
            return [
                {
                    'id':            str(prop.id),
                    'database_view': str(obj.id),
                    'order':         prop.order,
                    'definition':    PropertyDefinitionSerializer(prop).data,
                }
                for prop in props
            ]
        return DatabaseColumnSerializer(
            obj.columns.filter(is_deleted=False), many=True
        ).data

    def get_row_count(self, obj) -> int:
        if obj.custom_page_type_id:
            from Apps.pages.models import Page
            return Page.objects.filter(
                custom_page_type=obj.custom_page_type,
                workspace=obj.block.page.workspace,
                is_deleted=False,
            ).count()
        return obj.rows.filter(is_deleted=False).count()
