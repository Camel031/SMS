export interface User {
  uuid: string;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
  is_external: boolean;
  can_check_in: boolean;
  can_check_out: boolean;
  requires_confirmation: boolean;
  can_manage_equipment: boolean;
  can_manage_schedules: boolean;
  can_manage_users: boolean;
  can_view_reports: boolean;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  access: string;
  refresh: string;
}

export interface ChangePasswordRequest {
  old_password: string;
  new_password: string;
}
