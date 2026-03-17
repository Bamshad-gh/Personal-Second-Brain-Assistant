from rest_framework import serializers
from .models import CustomPageType, PropertyDefinition, PropertyValue


class CustomPageTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model  = CustomPageType
        fields = ['id', 'workspace', 'name', 'icon', 'description']
        read_only_fields = ['id']


class PropertyDefinitionSerializer(serializers.ModelSerializer):
    class Meta:
        model  = PropertyDefinition
        fields = [
            'id', 'workspace', 'custom_page_type', 'page_type',
            'name', 'prop_type', 'options', 'order', 'is_global',
        ]
        read_only_fields = ['id']


class PropertyValueSerializer(serializers.ModelSerializer):
    class Meta:
        model  = PropertyValue
        fields = [
            'id', 'page', 'definition',
            'value_text', 'value_number', 'value_date',
            'value_bool', 'value_json',
        ]
        read_only_fields = ['id']
