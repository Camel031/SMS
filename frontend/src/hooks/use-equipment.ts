import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  CategoryFormData,
  CustomFieldDefinition,
  CustomFieldFormData,
  EquipmentCategory,
  EquipmentCategoryTree,
  EquipmentItem,
  EquipmentItemDetail,
  EquipmentItemFormData,
  EquipmentModel,
  EquipmentModelDetail,
  EquipmentModelFormData,
  EquipmentStatusLog,
  FaultFormData,
  FaultRecord,
  InventoryByStatusItem,
  InventorySummary,
  PaginatedResponse,
} from "@/types/equipment";

// ─── Categories ─────────────────────────────────────────────────────

export function useCategories(params?: Record<string, string>) {
  return useQuery({
    queryKey: ["categories", params],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<EquipmentCategory>>(
        "/equipment/categories/",
        { params },
      );
      return data;
    },
  });
}

export function useCategoryTree() {
  return useQuery({
    queryKey: ["categories", "tree"],
    queryFn: async () => {
      const { data } = await api.get<EquipmentCategoryTree[]>(
        "/equipment/categories/tree/",
      );
      return data;
    },
  });
}

export function useCategory(uuid: string) {
  return useQuery({
    queryKey: ["categories", uuid],
    queryFn: async () => {
      const { data } = await api.get<EquipmentCategory>(
        `/equipment/categories/${uuid}/`,
      );
      return data;
    },
    enabled: !!uuid,
  });
}

export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CategoryFormData) => {
      const { data } = await api.post<EquipmentCategory>(
        "/equipment/categories/",
        payload,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["categories"] });
    },
  });
}

export function useUpdateCategory(uuid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<CategoryFormData>) => {
      const { data } = await api.patch<EquipmentCategory>(
        `/equipment/categories/${uuid}/`,
        payload,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["categories"] });
    },
  });
}

export function useDeleteCategory(uuid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await api.delete(`/equipment/categories/${uuid}/`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["categories"] });
    },
  });
}

// ─── Equipment Models ───────────────────────────────────────────────

export function useEquipmentModels(params?: Record<string, string>) {
  return useQuery({
    queryKey: ["equipment-models", params],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<EquipmentModel>>(
        "/equipment/models/",
        { params },
      );
      return data;
    },
    placeholderData: keepPreviousData,
  });
}

export function useEquipmentModel(uuid: string) {
  return useQuery({
    queryKey: ["equipment-models", uuid],
    queryFn: async () => {
      const { data } = await api.get<EquipmentModelDetail>(
        `/equipment/models/${uuid}/`,
      );
      return data;
    },
    enabled: !!uuid,
  });
}

export function useCreateEquipmentModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: EquipmentModelFormData) => {
      const { data } = await api.post<EquipmentModel>(
        "/equipment/models/",
        payload,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["equipment-models"] });
    },
  });
}

export function useUpdateEquipmentModel(uuid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<EquipmentModelFormData>) => {
      const { data } = await api.patch<EquipmentModel>(
        `/equipment/models/${uuid}/`,
        payload,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["equipment-models"] });
      qc.invalidateQueries({ queryKey: ["equipment-models", uuid] });
    },
  });
}

// ─── Equipment Items ────────────────────────────────────────────────

export function useEquipmentItems(params?: Record<string, string>) {
  return useQuery({
    queryKey: ["equipment-items", params],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<EquipmentItem>>(
        "/equipment/items/",
        { params },
      );
      return data;
    },
    placeholderData: keepPreviousData,
  });
}

export function useEquipmentItem(uuid: string) {
  return useQuery({
    queryKey: ["equipment-items", uuid],
    queryFn: async () => {
      const { data } = await api.get<EquipmentItemDetail>(
        `/equipment/items/${uuid}/`,
      );
      return data;
    },
    enabled: !!uuid,
  });
}

export function useCreateEquipmentItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: EquipmentItemFormData) => {
      const { data } = await api.post<EquipmentItem>(
        "/equipment/items/",
        payload,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["equipment-items"] });
      qc.invalidateQueries({ queryKey: ["equipment-models"] });
    },
  });
}

export function useUpdateEquipmentItem(uuid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<EquipmentItemFormData>) => {
      const { data } = await api.patch<EquipmentItem>(
        `/equipment/items/${uuid}/`,
        payload,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["equipment-items"] });
      qc.invalidateQueries({ queryKey: ["equipment-items", uuid] });
    },
  });
}

// ─── Item History ───────────────────────────────────────────────────

export function useItemHistory(uuid: string) {
  return useQuery({
    queryKey: ["equipment-items", uuid, "history"],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<EquipmentStatusLog>>(
        `/equipment/items/${uuid}/history/`,
      );
      return data;
    },
    enabled: !!uuid,
  });
}

// ─── Fault Records ──────────────────────────────────────────────────

export function useFaults(params?: Record<string, string>) {
  return useQuery({
    queryKey: ["faults", params],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<FaultRecord>>(
        "/equipment/faults/",
        { params },
      );
      return data;
    },
  });
}

export function useCreateFault(itemUuid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: FaultFormData) => {
      const { data } = await api.post<FaultRecord>(
        `/equipment/items/${itemUuid}/fault/`,
        payload,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["faults"] });
      qc.invalidateQueries({ queryKey: ["equipment-items"] });
    },
  });
}

export function useResolveFault(uuid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (notes: string) => {
      const { data } = await api.post<FaultRecord>(
        `/equipment/faults/${uuid}/resolve/`,
        { resolution_notes: notes },
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["faults"] });
      qc.invalidateQueries({ queryKey: ["equipment-items"] });
    },
  });
}

// ─── Custom Fields ──────────────────────────────────────────────────

export function useCustomFields(params?: Record<string, string>) {
  return useQuery({
    queryKey: ["custom-fields", params],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<CustomFieldDefinition>>(
        "/custom-fields/definitions/",
        { params },
      );
      return data;
    },
  });
}

export function useCreateCustomField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CustomFieldFormData) => {
      const { data } = await api.post<CustomFieldDefinition>(
        "/custom-fields/definitions/",
        payload,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["custom-fields"] });
    },
  });
}

export function useUpdateCustomField(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<CustomFieldFormData>) => {
      const { data } = await api.patch<CustomFieldDefinition>(
        `/custom-fields/definitions/${id}/`,
        payload,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["custom-fields"] });
    },
  });
}

export function useDeleteCustomField(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await api.delete(`/custom-fields/definitions/${id}/`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["custom-fields"] });
    },
  });
}

// ─── Inventory ──────────────────────────────────────────────────────

export function useInventorySummary() {
  return useQuery({
    queryKey: ["inventory", "summary"],
    queryFn: async () => {
      const { data } = await api.get<InventorySummary>(
        "/equipment/inventory/",
      );
      return data;
    },
  });
}

export function useInventoryByStatus(status?: string) {
  return useQuery({
    queryKey: ["inventory", "by-status", status],
    queryFn: async () => {
      const { data } = await api.get<InventoryByStatusItem[]>(
        "/equipment/inventory/by-status/",
        { params: status ? { status } : undefined },
      );
      return data;
    },
  });
}
