from rest_framework import serializers
from django.contrib.auth import get_user_model
import re


User =get_user_model()

class RegisterSerializer(serializers.ModelSerializer):
    """Validates and creates a new user account."""

    password = serializers.CharField(write_only = True, min_length=8) # write_only=True: never include password in API responses
    password2 =serializers.CharField(write_only = True, label='confirm password')

    class Meta:
        model = User
        fields=['email','full_name','password','password2']

    def validate(self, data):

        password = data["password"]
        password2 = data["password2"]

        errors = {}

        if password != password2:
            errors["password"] = "Passwords do not match."

        if len(password) < 8:
            errors["password"] = "Password must be at least 8 characters."

        if not re.search(r"[A-Za-z]", password):
            errors["password"] = "Password must contain at least one letter."

        if not re.search(r"[0-9]", password):
            errors["password"] = "Password must contain at least one number."

        if errors:
            raise serializers.ValidationError(errors)

        return data
        
    def create(self, validated_data):
            validated_data.pop('password2')
            # create_user() from our UserManager — handles password hashing
            return User.objects.create_user(**validated_data)

class UserSerializer(serializers.ModelSerializer):
    """
    Read serializer — defines what the API returns about a user.
    full_name is a @property on the model — serializer exposes it as a field.
    """
    display_name = serializers.CharField(read_only=True)

    class Meta:
        model  = User
        fields = ['id', 'email', 'display_name',
                  'avatar', 'created_at']
        read_only_fields = ['id', 'created_at']

class UpdateProfileSerializer(serializers.ModelSerializer):
    """Write serializer for profile updates — intentionally limited fields."""
    class Meta:
        model  = User
        fields = ['full_name', 'avatar', 'bio','full_name']

