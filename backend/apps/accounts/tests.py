import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

User = get_user_model()


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


@pytest.fixture
def admin_user(db) -> User:
    return User.objects.create_user(
        username="admin",
        password="testpass123",
        email="admin@test.com",
        can_manage_users=True,
        can_check_in=True,
        can_check_out=True,
        can_manage_equipment=True,
        can_manage_schedules=True,
    )


@pytest.fixture
def normal_user(db) -> User:
    return User.objects.create_user(
        username="user1",
        password="testpass123",
        email="user1@test.com",
        can_check_in=True,
        can_check_out=True,
    )


@pytest.mark.django_db
class TestUserModel:
    def test_create_user(self, admin_user: User) -> None:
        assert admin_user.username == "admin"
        assert admin_user.can_manage_users is True
        assert admin_user.can_check_in is True

    def test_user_str(self, admin_user: User) -> None:
        assert str(admin_user) == "admin"

    def test_user_str_with_full_name(self, db) -> None:
        user = User.objects.create_user(
            username="john",
            password="testpass123",
            first_name="John",
            last_name="Doe",
        )
        assert str(user) == "John Doe"

    def test_user_uuid_is_generated(self, admin_user: User) -> None:
        assert admin_user.uuid is not None


@pytest.mark.django_db
class TestAuthAPI:
    def test_login_success(self, api_client: APIClient, admin_user: User) -> None:
        response = api_client.post(
            "/api/v1/auth/login/",
            {"username": "admin", "password": "testpass123"},
        )
        assert response.status_code == 200
        assert "access" in response.data
        assert "refresh" in response.data

    def test_login_wrong_password(self, api_client: APIClient, admin_user: User) -> None:
        response = api_client.post(
            "/api/v1/auth/login/",
            {"username": "admin", "password": "wrong"},
        )
        assert response.status_code == 401

    def test_me_authenticated(self, api_client: APIClient, admin_user: User) -> None:
        api_client.force_authenticate(user=admin_user)
        response = api_client.get("/api/v1/auth/me/")
        assert response.status_code == 200
        assert response.data["username"] == "admin"

    def test_me_unauthenticated(self, api_client: APIClient) -> None:
        response = api_client.get("/api/v1/auth/me/")
        assert response.status_code == 401

    def test_me_update(self, api_client: APIClient, admin_user: User) -> None:
        api_client.force_authenticate(user=admin_user)
        response = api_client.patch(
            "/api/v1/auth/me/",
            {"first_name": "Updated"},
        )
        assert response.status_code == 200
        admin_user.refresh_from_db()
        assert admin_user.first_name == "Updated"

    def test_change_password(self, api_client: APIClient, admin_user: User) -> None:
        api_client.force_authenticate(user=admin_user)
        response = api_client.post(
            "/api/v1/auth/change-password/",
            {"old_password": "testpass123", "new_password": "newpass456"},
        )
        assert response.status_code == 200
        admin_user.refresh_from_db()
        assert admin_user.check_password("newpass456")

    def test_change_password_wrong_old(
        self, api_client: APIClient, admin_user: User
    ) -> None:
        api_client.force_authenticate(user=admin_user)
        response = api_client.post(
            "/api/v1/auth/change-password/",
            {"old_password": "wrong", "new_password": "newpass456"},
        )
        assert response.status_code == 400

    def test_logout(self, api_client: APIClient, admin_user: User) -> None:
        login_response = api_client.post(
            "/api/v1/auth/login/",
            {"username": "admin", "password": "testpass123"},
        )
        refresh = login_response.data["refresh"]
        api_client.force_authenticate(user=admin_user)
        response = api_client.post("/api/v1/auth/logout/", {"refresh": refresh})
        assert response.status_code == 204


@pytest.mark.django_db
class TestUserManagementAPI:
    def test_list_users(self, api_client: APIClient, admin_user: User) -> None:
        api_client.force_authenticate(user=admin_user)
        response = api_client.get("/api/v1/users/")
        assert response.status_code == 200

    def test_list_users_no_permission(
        self, api_client: APIClient, normal_user: User
    ) -> None:
        api_client.force_authenticate(user=normal_user)
        response = api_client.get("/api/v1/users/")
        assert response.status_code == 403

    def test_create_user(self, api_client: APIClient, admin_user: User) -> None:
        api_client.force_authenticate(user=admin_user)
        response = api_client.post(
            "/api/v1/users/",
            {
                "username": "newuser",
                "password": "testpass123",
                "email": "new@test.com",
                "can_check_out": True,
            },
        )
        assert response.status_code == 201
        assert User.objects.filter(username="newuser").exists()

    def test_update_permissions(
        self, api_client: APIClient, admin_user: User, normal_user: User
    ) -> None:
        api_client.force_authenticate(user=admin_user)
        response = api_client.patch(
            f"/api/v1/users/{normal_user.uuid}/permissions/",
            {"can_manage_equipment": True},
        )
        assert response.status_code == 200
        normal_user.refresh_from_db()
        assert normal_user.can_manage_equipment is True
