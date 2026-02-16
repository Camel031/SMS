import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Loader2,
  Plus,
  Search,
  Shield,
  Trash2,
  UserCog,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useUsers,
  useCreateUser,
  useUpdateUser,
  useUpdateUserPermissions,
  useDeleteUser,
} from "@/hooks/use-users";
import type { User, UserPermissionPayload } from "@/types/auth";

// ─── Zod Schemas ────────────────────────────────────────────────────

const createUserSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  email: z.string().email().optional().or(z.literal("")),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  phone: z.string().optional(),
});

type CreateUserValues = z.infer<typeof createUserSchema>;

const editUserSchema = z.object({
  email: z.string().email().optional().or(z.literal("")),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  phone: z.string().optional(),
});

type EditUserValues = z.infer<typeof editUserSchema>;

// ─── Permission Labels ─────────────────────────────────────────────

const PERMISSION_LABELS: { key: keyof UserPermissionPayload; label: string }[] =
  [
    { key: "can_check_in", label: "Check In" },
    { key: "can_check_out", label: "Check Out" },
    { key: "requires_confirmation", label: "Requires Confirmation" },
    { key: "can_manage_equipment", label: "Manage Equipment" },
    { key: "can_manage_schedules", label: "Manage Schedules" },
    { key: "can_manage_users", label: "Manage Users" },
    { key: "can_view_reports", label: "View Reports" },
  ];

// ─── Page Component ─────────────────────────────────────────────────

export default function UserManagementPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [permUser, setPermUser] = useState<User | null>(null);
  const [deleteUser, setDeleteUser] = useState<User | null>(null);

  const params: Record<string, string> = { page: String(page) };
  if (search) params.search = search;

  const users = useUsers(params);
  const createMutation = useCreateUser();
  const deleteMutation = useDeleteUser();

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <Users className="h-5 w-5" />
            User Management
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage users and their permissions
          </p>
        </div>
        <Button className="gap-1" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          Create User
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search users..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="pl-8 h-8 text-sm"
        />
      </div>

      {/* User Table */}
      {users.isLoading ? (
        <TableSkeleton rows={5} cols={6} />
      ) : users.data?.results.length === 0 ? (
        <EmptyState message="No users found" />
      ) : (
        <>
          <div className="rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Username</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Permissions</TableHead>
                  <TableHead className="w-32" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.data?.results.map((user) => (
                  <TableRow key={user.uuid}>
                    <TableCell className="font-medium">
                      {user.username}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {user.first_name || user.last_name
                        ? `${user.first_name} ${user.last_name}`.trim()
                        : "\u2014"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {user.email || "\u2014"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={user.is_external ? "warning" : "default"}
                      >
                        {user.is_external ? "External" : "Internal"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <PermissionBadges user={user} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 gap-1"
                          onClick={() => setEditUser(user)}
                        >
                          <UserCog className="h-3.5 w-3.5" />
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 gap-1"
                          onClick={() => setPermUser(user)}
                        >
                          <Shield className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                          onClick={() => setDeleteUser(user)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Pagination
            count={users.data?.count ?? 0}
            page={page}
            onPageChange={setPage}
          />
        </>
      )}

      {/* Create User Dialog */}
      <CreateUserDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        mutation={createMutation}
      />

      {/* Edit User Dialog */}
      {editUser && (
        <EditUserDialog
          user={editUser}
          onClose={() => setEditUser(null)}
        />
      )}

      {/* Permissions Dialog */}
      {permUser && (
        <PermissionsDialog
          user={permUser}
          onClose={() => setPermUser(null)}
        />
      )}

      {/* Delete Confirmation */}
      <Dialog
        open={!!deleteUser}
        onOpenChange={(o) => !o && setDeleteUser(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete User</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete user &quot;{deleteUser?.username}
              &quot;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteUser(null)}
              disabled={deleteMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (!deleteUser) return;
                deleteMutation.mutate(deleteUser.uuid, {
                  onSuccess: () => {
                    toast.success("User deleted");
                    setDeleteUser(null);
                  },
                  onError: () => toast.error("Failed to delete user"),
                });
              }}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Create User Dialog ─────────────────────────────────────────────

function CreateUserDialog({
  open,
  onOpenChange,
  mutation,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  mutation: ReturnType<typeof useCreateUser>;
}) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateUserValues>({
    resolver: zodResolver(createUserSchema),
  });

  function onSubmit(values: CreateUserValues) {
    mutation.mutate(values, {
      onSuccess: () => {
        toast.success("User created");
        reset();
        onOpenChange(false);
      },
      onError: () => toast.error("Failed to create user"),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create User</DialogTitle>
          <DialogDescription>
            Create a new user account with initial credentials.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="create-username">Username</Label>
            <Input
              id="create-username"
              {...register("username")}
              placeholder="username"
            />
            {errors.username && (
              <p className="text-xs text-destructive">
                {errors.username.message}
              </p>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="create-password">Password</Label>
            <Input
              id="create-password"
              type="password"
              {...register("password")}
              placeholder="Min 8 characters"
            />
            {errors.password && (
              <p className="text-xs text-destructive">
                {errors.password.message}
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="create-first-name">First Name</Label>
              <Input
                id="create-first-name"
                {...register("first_name")}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="create-last-name">Last Name</Label>
              <Input
                id="create-last-name"
                {...register("last_name")}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="create-email">Email</Label>
            <Input
              id="create-email"
              type="email"
              {...register("email")}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="create-phone">Phone</Label>
            <Input id="create-phone" {...register("phone")} />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : null}
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit User Dialog ───────────────────────────────────────────────

function EditUserDialog({
  user,
  onClose,
}: {
  user: User;
  onClose: () => void;
}) {
  const updateMutation = useUpdateUser(user.uuid);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EditUserValues>({
    resolver: zodResolver(editUserSchema),
    defaultValues: {
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      phone: user.phone,
    },
  });

  function onSubmit(values: EditUserValues) {
    updateMutation.mutate(values, {
      onSuccess: () => {
        toast.success("User updated");
        onClose();
      },
      onError: () => toast.error("Failed to update user"),
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit User: {user.username}</DialogTitle>
          <DialogDescription>
            Update user profile information.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>First Name</Label>
              <Input {...register("first_name")} />
            </div>
            <div className="space-y-1">
              <Label>Last Name</Label>
              <Input {...register("last_name")} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Email</Label>
            <Input type="email" {...register("email")} />
            {errors.email && (
              <p className="text-xs text-destructive">
                {errors.email.message}
              </p>
            )}
          </div>
          <div className="space-y-1">
            <Label>Phone</Label>
            <Input {...register("phone")} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Permissions Dialog ─────────────────────────────────────────────

function PermissionsDialog({
  user,
  onClose,
}: {
  user: User;
  onClose: () => void;
}) {
  const updatePermissions = useUpdateUserPermissions(user.uuid);
  const [perms, setPerms] = useState<UserPermissionPayload>({
    can_check_in: user.can_check_in,
    can_check_out: user.can_check_out,
    requires_confirmation: user.requires_confirmation,
    can_manage_equipment: user.can_manage_equipment,
    can_manage_schedules: user.can_manage_schedules,
    can_manage_users: user.can_manage_users,
    can_view_reports: user.can_view_reports,
  });

  function handleSave() {
    updatePermissions.mutate(perms, {
      onSuccess: () => {
        toast.success("Permissions updated");
        onClose();
      },
      onError: () => toast.error("Failed to update permissions"),
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Permissions: {user.username}</DialogTitle>
          <DialogDescription>
            Toggle permissions for this user.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {PERMISSION_LABELS.map(({ key, label }) => (
            <div
              key={key}
              className="flex items-center justify-between"
            >
              <Label className="text-sm">{label}</Label>
              <Switch
                checked={!!perms[key]}
                onCheckedChange={(v) =>
                  setPerms((p) => ({ ...p, [key]: v }))
                }
              />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={updatePermissions.isPending}
          >
            {updatePermissions.isPending ? "Saving..." : "Save Permissions"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────

function PermissionBadges({ user }: { user: User }) {
  const active: string[] = [];
  if (user.can_check_in) active.push("CI");
  if (user.can_check_out) active.push("CO");
  if (user.can_manage_equipment) active.push("Eq");
  if (user.can_manage_schedules) active.push("Sc");
  if (user.can_manage_users) active.push("Us");
  if (user.can_view_reports) active.push("Rp");

  if (active.length === 0) {
    return (
      <span className="text-xs text-muted-foreground">No permissions</span>
    );
  }

  return (
    <div className="flex flex-wrap gap-1">
      {active.map((p) => (
        <Badge key={p} variant="secondary" className="text-[10px] px-1.5 py-0">
          {p}
        </Badge>
      ))}
    </div>
  );
}

function Pagination({
  count,
  page,
  onPageChange,
  pageSize = 20,
}: {
  count: number;
  page: number;
  onPageChange: (p: number) => void;
  pageSize?: number;
}) {
  const totalPages = Math.ceil(count / pageSize);
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between pt-3">
      <span className="text-xs text-muted-foreground">
        {count} total users
      </span>
      <div className="flex gap-1">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </Button>
        <span className="flex items-center px-3 text-xs text-muted-foreground">
          {page} / {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-border py-16">
      <Users className="h-10 w-10 text-muted-foreground/40" />
      <p className="mt-3 text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

function TableSkeleton({ rows, cols }: { rows: number; cols: number }) {
  return (
    <div className="rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            {Array.from({ length: cols }).map((_, i) => (
              <TableHead key={i}>
                <Skeleton className="h-4 w-20" />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: rows }).map((_, r) => (
            <TableRow key={r}>
              {Array.from({ length: cols }).map((_, c) => (
                <TableCell key={c}>
                  <Skeleton className="h-4 w-24" />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
