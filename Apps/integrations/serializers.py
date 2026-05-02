from rest_framework import serializers

from .models import EmailIntegration, LinkedInIntegration, ScheduledPost


class EmailIntegrationSerializer(serializers.ModelSerializer):
    """Never expose *_enc fields."""

    class Meta:
        model = EmailIntegration
        fields = [
            'id', 'provider', 'label', 'email', 'is_default',
            'smtp_host', 'smtp_port', 'smtp_use_tls', 'smtp_username',
            'token_expiry', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class LinkedInStatusSerializer(serializers.ModelSerializer):
    connected = serializers.SerializerMethodField()

    class Meta:
        model = LinkedInIntegration
        fields = ['connected', 'display_name', 'token_expiry']

    def get_connected(self, obj) -> bool:
        return bool(obj.access_token_enc)


class ScheduledPostSerializer(serializers.ModelSerializer):
    class Meta:
        model = ScheduledPost
        fields = [
            'id', 'platform', 'status', 'content', 'template',
            'scheduled_at', 'sent_at', 'error_log', 'platform_post_id',
            'source_row', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'status', 'sent_at', 'error_log', 'platform_post_id', 'created_at', 'updated_at']
