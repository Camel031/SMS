from rest_framework.permissions import BasePermission


class CanCheckOut(BasePermission):
    def has_permission(self, request, view) -> bool:
        return request.user.is_authenticated and request.user.can_check_out


class CanCheckIn(BasePermission):
    def has_permission(self, request, view) -> bool:
        return request.user.is_authenticated and request.user.can_check_in


class CanManageEquipment(BasePermission):
    def has_permission(self, request, view) -> bool:
        return request.user.is_authenticated and request.user.can_manage_equipment


class CanManageSchedules(BasePermission):
    def has_permission(self, request, view) -> bool:
        return request.user.is_authenticated and request.user.can_manage_schedules


class CanManageUsers(BasePermission):
    def has_permission(self, request, view) -> bool:
        return request.user.is_authenticated and request.user.can_manage_users


class CanViewReports(BasePermission):
    def has_permission(self, request, view) -> bool:
        return request.user.is_authenticated and request.user.can_view_reports
