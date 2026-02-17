import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  EquipmentTemplate,
  EquipmentTemplateDetail,
  EquipmentTemplateFormData,
  PaginatedResponse,
} from "@/types/equipment-template";

// ─── List ───────────────────────────────────────────────────────────

export function useEquipmentTemplates(params?: Record<string, string>) {
  return useQuery({
    queryKey: ["equipment-templates", params],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<EquipmentTemplate>>(
        "/equipment/templates/",
        { params },
      );
      return data;
    },
    placeholderData: keepPreviousData,
  });
}

// ─── Detail ─────────────────────────────────────────────────────────

export function useEquipmentTemplate(uuid: string) {
  return useQuery({
    queryKey: ["equipment-templates", uuid],
    queryFn: async () => {
      const { data } = await api.get<EquipmentTemplateDetail>(
        `/equipment/templates/${uuid}/`,
      );
      return data;
    },
    enabled: !!uuid,
  });
}

// ─── Create ─────────────────────────────────────────────────────────

export function useCreateEquipmentTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: EquipmentTemplateFormData) => {
      const { data } = await api.post<EquipmentTemplateDetail>(
        "/equipment/templates/",
        payload,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["equipment-templates"] });
    },
  });
}

// ─── Update ─────────────────────────────────────────────────────────

export function useUpdateEquipmentTemplate(uuid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: EquipmentTemplateFormData) => {
      const { data } = await api.patch<EquipmentTemplateDetail>(
        `/equipment/templates/${uuid}/`,
        payload,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["equipment-templates"] });
    },
  });
}

// ─── Delete ─────────────────────────────────────────────────────────

export function useDeleteEquipmentTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (uuid: string) => {
      await api.delete(`/equipment/templates/${uuid}/`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["equipment-templates"] });
    },
  });
}
