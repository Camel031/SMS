import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Plus,
  ChevronRight,
  ChevronDown,
  Pencil,
  Trash2,
  FolderTree,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useCategories,
  useCategoryTree,
  useCreateCategory,
  useUpdateCategory,
  useDeleteCategory,
} from "@/hooks/use-equipment";
import { usePermission } from "@/hooks/use-auth";
import type {
  EquipmentCategory,
  EquipmentCategoryTree,
  CategoryFormData,
} from "@/types/equipment";

// ─── Slugify helper ──────────────────────────────────────────────────

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ─── Flatten tree for parent select dropdown ─────────────────────────

interface FlatCategory {
  id: number;
  uuid: string;
  name: string;
  depth: number;
}

function flattenTree(
  nodes: EquipmentCategoryTree[] | undefined,
  depth = 0,
): FlatCategory[] {
  if (!nodes) return [];
  const result: FlatCategory[] = [];
  for (const node of nodes) {
    result.push({ id: node.id, uuid: node.uuid, name: node.name, depth });
    result.push(...flattenTree(node.children, depth + 1));
  }
  return result;
}

// ─── Category Form Dialog ────────────────────────────────────────────

interface CategoryFormState {
  name: string;
  slug: string;
  parent: string; // stored as string for Select; "" means no parent
  sort_order: string;
}

const EMPTY_FORM: CategoryFormState = {
  name: "",
  slug: "",
  parent: "",
  sort_order: "0",
};

function CategoryFormDialog({
  open,
  onOpenChange,
  title,
  initial,
  flatCategories,
  excludeId,
  onSubmit,
  isSubmitting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  initial: CategoryFormState;
  flatCategories: FlatCategory[];
  excludeId?: number;
  onSubmit: (data: CategoryFormData) => void;
  isSubmitting: boolean;
}) {
  const [form, setForm] = useState<CategoryFormState>(initial);
  const [slugManual, setSlugManual] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(initial);
      setSlugManual(false);
    }
  }, [open, initial]);

  const handleNameChange = (name: string) => {
    setForm((prev) => ({
      ...prev,
      name,
      slug: slugManual ? prev.slug : slugify(name),
    }));
  };

  const handleSlugChange = (slug: string) => {
    setSlugManual(true);
    setForm((prev) => ({ ...prev, slug }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.slug.trim()) return;
    onSubmit({
      name: form.name.trim(),
      slug: form.slug.trim(),
      parent: form.parent ? Number(form.parent) : null,
      sort_order: Number(form.sort_order) || 0,
    });
  };

  // Filter out the category being edited (and its descendants) from parent options
  const availableParents = excludeId
    ? flatCategories.filter((c) => c.id !== excludeId)
    : flatCategories;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cat-name">Name</Label>
            <Input
              id="cat-name"
              value={form.name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g. Lighting"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cat-slug">Slug</Label>
            <Input
              id="cat-slug"
              value={form.slug}
              onChange={(e) => handleSlugChange(e.target.value)}
              placeholder="auto-generated-from-name"
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Auto-generated from name. Edit to customize.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cat-parent">Parent Category</Label>
            <Select
              value={form.parent}
              onValueChange={(v) =>
                setForm((prev) => ({
                  ...prev,
                  parent: v === "none" ? "" : v,
                }))
              }
            >
              <SelectTrigger id="cat-parent">
                <SelectValue placeholder="None (top-level)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None (top-level)</SelectItem>
                {availableParents.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {"\u00A0\u00A0".repeat(c.depth) + c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cat-sort">Sort Order</Label>
            <Input
              id="cat-sort"
              type="number"
              value={form.sort_order}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, sort_order: e.target.value }))
              }
              min={0}
              className="w-24"
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !form.name.trim() || !form.slug.trim()}
            >
              {isSubmitting ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Delete Confirmation Dialog ──────────────────────────────────────

function DeleteCategoryDialog({
  category,
  open,
  onOpenChange,
}: {
  category: EquipmentCategory | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const deleteMutation = useDeleteCategory(category?.uuid ?? "");

  const handleDelete = () => {
    deleteMutation.mutate(undefined, {
      onSuccess: () => onOpenChange(false),
    });
  };

  if (!category) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Category</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete the category{" "}
            <span className="font-semibold text-foreground">
              {category.name}
            </span>
            ? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        {category.children_count > 0 && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            This category has {category.children_count} child{" "}
            {category.children_count === 1 ? "category" : "categories"}.
            Deleting it may affect its children.
          </div>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={deleteMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? "Deleting..." : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit Category Wrapper ───────────────────────────────────────────
// useUpdateCategory requires a uuid at call-time, so we wrap the mutation
// in its own component that only mounts when editing a specific category.

function EditCategoryDialog({
  category,
  open,
  onOpenChange,
  flatCategories,
}: {
  category: EquipmentCategory;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  flatCategories: FlatCategory[];
}) {
  const updateMutation = useUpdateCategory(category.uuid);

  const initial: CategoryFormState = {
    name: category.name,
    slug: category.slug,
    parent: category.parent ? String(category.parent) : "",
    sort_order: String(category.sort_order),
  };

  return (
    <CategoryFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Edit Category"
      initial={initial}
      flatCategories={flatCategories}
      excludeId={category.id}
      isSubmitting={updateMutation.isPending}
      onSubmit={(data) => {
        updateMutation.mutate(data, {
          onSuccess: () => onOpenChange(false),
        });
      }}
    />
  );
}

// ─── Tree Row ────────────────────────────────────────────────────────

function CategoryTreeRow({
  node,
  depth,
  flatList,
  flatCategories,
  canManage,
}: {
  node: EquipmentCategoryTree;
  depth: number;
  flatList: EquipmentCategory[];
  flatCategories: FlatCategory[];
  canManage: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Find the flat category data for this node (needed for edit/delete)
  const flatData = flatList.find((c) => c.uuid === node.uuid);
  const hasChildren = node.children && node.children.length > 0;

  return (
    <>
      <TableRow className="group">
        <TableCell>
          <div
            className="flex items-center gap-1"
            style={{ paddingLeft: `${depth * 24}px` }}
          >
            {hasChildren ? (
              <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                {expanded ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
              </button>
            ) : (
              <span className="w-5" />
            )}
            <FolderTree className="h-3.5 w-3.5 text-muted-foreground mr-1.5" />
            <span className="font-medium text-foreground">{node.name}</span>
          </div>
        </TableCell>
        <TableCell className="font-mono text-sm text-muted-foreground">
          {node.slug}
        </TableCell>
        <TableCell className="text-center font-mono text-sm">
          {node.sort_order}
        </TableCell>
        <TableCell className="text-center">
          {hasChildren ? (
            <Badge variant="secondary">{node.children.length}</Badge>
          ) : (
            <span className="text-muted-foreground">0</span>
          )}
        </TableCell>
        <TableCell className="text-right">
          {canManage && (
            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setEditOpen(true)}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:text-destructive"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </TableCell>
      </TableRow>

      {/* Child rows */}
      {expanded &&
        hasChildren &&
        node.children.map((child) => (
          <CategoryTreeRow
            key={child.uuid}
            node={child}
            depth={depth + 1}
            flatList={flatList}
            flatCategories={flatCategories}
            canManage={canManage}
          />
        ))}

      {/* Edit dialog */}
      {flatData && editOpen && (
        <EditCategoryDialog
          category={flatData}
          open={editOpen}
          onOpenChange={setEditOpen}
          flatCategories={flatCategories}
        />
      )}

      {/* Delete dialog */}
      {flatData && deleteOpen && (
        <DeleteCategoryDialog
          category={flatData}
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
        />
      )}
    </>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────

export default function CategoriesPage() {
  const perms = usePermission();
  const categoryTree = useCategoryTree();
  const categories = useCategories();
  const createMutation = useCreateCategory();

  const [createOpen, setCreateOpen] = useState(false);

  const flatCategories = flattenTree(categoryTree.data);
  const flatList = categories.data?.results ?? [];

  const isLoading = categoryTree.isLoading || categories.isLoading;
  const isEmpty =
    !isLoading &&
    (!categoryTree.data || categoryTree.data.length === 0);

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link
          to="/equipment"
          className="hover:text-foreground transition-colors"
        >
          Equipment
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground">Categories</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Categories</h1>
          <p className="text-sm text-muted-foreground">
            Manage equipment categories in a tree structure
          </p>
        </div>
        {perms.canManageEquipment && (
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            New Category
          </Button>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <TreeSkeleton />
      ) : isEmpty ? (
        <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-border py-16">
          <FolderTree className="h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 text-sm text-muted-foreground">
            No categories created yet
          </p>
          {perms.canManageEquipment && (
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="h-4 w-4" />
              Create First Category
            </Button>
          )}
        </div>
      ) : (
        <div className="rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead className="text-center">Sort Order</TableHead>
                <TableHead className="text-center">Children</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {categoryTree.data?.map((node) => (
                <CategoryTreeRow
                  key={node.uuid}
                  node={node}
                  depth={0}
                  flatList={flatList}
                  flatCategories={flatCategories}
                  canManage={perms.canManageEquipment}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create dialog */}
      <CategoryFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="New Category"
        initial={EMPTY_FORM}
        flatCategories={flatCategories}
        isSubmitting={createMutation.isPending}
        onSubmit={(data) => {
          createMutation.mutate(data, {
            onSuccess: () => setCreateOpen(false),
          });
        }}
      />
    </div>
  );
}

// ─── Loading skeleton ────────────────────────────────────────────────

function TreeSkeleton() {
  return (
    <div className="rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              <Skeleton className="h-4 w-20" />
            </TableHead>
            <TableHead>
              <Skeleton className="h-4 w-16" />
            </TableHead>
            <TableHead className="text-center">
              <Skeleton className="mx-auto h-4 w-16" />
            </TableHead>
            <TableHead className="text-center">
              <Skeleton className="mx-auto h-4 w-14" />
            </TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 5 }).map((_, i) => (
            <TableRow key={i}>
              <TableCell>
                <div className="flex items-center gap-2" style={{ paddingLeft: `${(i % 3) * 24}px` }}>
                  <Skeleton className="h-4 w-4" />
                  <Skeleton className="h-4 w-28" />
                </div>
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-20" />
              </TableCell>
              <TableCell className="text-center">
                <Skeleton className="mx-auto h-4 w-8" />
              </TableCell>
              <TableCell className="text-center">
                <Skeleton className="mx-auto h-4 w-8" />
              </TableCell>
              <TableCell>
                <Skeleton className="ml-auto h-4 w-16" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
