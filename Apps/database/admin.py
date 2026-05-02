from django.contrib import admin
from .models import DatabaseCell, DatabaseColumn, DatabaseRow, DatabaseView


@admin.register(DatabaseView)
class DatabaseViewAdmin(admin.ModelAdmin):
    list_display  = ['id', 'block', 'view_type', 'is_deleted', 'created_at']
    list_filter   = ['view_type', 'is_deleted']
    raw_id_fields = ['block', 'custom_page_type']


@admin.register(DatabaseColumn)
class DatabaseColumnAdmin(admin.ModelAdmin):
    list_display  = ['id', 'database_view', 'definition', 'order', 'is_deleted']
    list_filter   = ['is_deleted']
    raw_id_fields = ['database_view', 'definition']


@admin.register(DatabaseRow)
class DatabaseRowAdmin(admin.ModelAdmin):
    list_display  = ['id', 'database_view', 'order', 'is_deleted', 'created_at']
    list_filter   = ['is_deleted']
    raw_id_fields = ['database_view', 'page']


@admin.register(DatabaseCell)
class DatabaseCellAdmin(admin.ModelAdmin):
    list_display  = ['id', 'row', 'definition', 'value_text', 'value_number', 'is_deleted']
    list_filter   = ['is_deleted']
    raw_id_fields = ['row', 'definition']
