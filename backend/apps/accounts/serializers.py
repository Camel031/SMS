from django.contrib.auth import get_user_model
from rest_framework import serializers

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = [
            "uuid",
            "username",
            "email",
            "first_name",
            "last_name",
            "phone",
            "is_external",
            "can_check_in",
            "can_check_out",
            "requires_confirmation",
            "can_manage_equipment",
            "can_manage_schedules",
            "can_manage_users",
            "can_view_reports",
        ]
        read_only_fields = ["uuid"]


class UserMeSerializer(serializers.ModelSerializer):
    """Serializer for the authenticated user's own profile."""

    class Meta:
        model = User
        fields = [
            "uuid",
            "username",
            "email",
            "first_name",
            "last_name",
            "phone",
            "is_external",
            "can_check_in",
            "can_check_out",
            "requires_confirmation",
            "can_manage_equipment",
            "can_manage_schedules",
            "can_manage_users",
            "can_view_reports",
        ]
        read_only_fields = [
            "uuid",
            "username",
            "can_check_in",
            "can_check_out",
            "requires_confirmation",
            "can_manage_equipment",
            "can_manage_schedules",
            "can_manage_users",
            "can_view_reports",
        ]


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(required=True)
    new_password = serializers.CharField(required=True, min_length=8)

    def validate_old_password(self, value: str) -> str:
        user = self.context["request"].user
        if not user.check_password(value):
            raise serializers.ValidationError("Old password is incorrect.")
        return value


class UserCreateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = [
            "uuid",
            "username",
            "email",
            "password",
            "first_name",
            "last_name",
            "phone",
            "is_external",
            "can_check_in",
            "can_check_out",
            "requires_confirmation",
            "can_manage_equipment",
            "can_manage_schedules",
            "can_manage_users",
            "can_view_reports",
        ]
        read_only_fields = ["uuid"]

    def create(self, validated_data: dict) -> User:
        password = validated_data.pop("password")
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user


class UserPermissionSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = [
            "can_check_in",
            "can_check_out",
            "requires_confirmation",
            "can_manage_equipment",
            "can_manage_schedules",
            "can_manage_users",
            "can_view_reports",
        ]
