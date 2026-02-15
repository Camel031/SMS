import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  RentalAgreementList,
  RentalAgreementDetail,
  RentalAgreementCreateUpdate,
  RentalAgreementLine,
  RentalAgreementLineCreate,
  EquipmentItemMinimal,
  PaginatedResponse,
} from "@/types/rental";

// ─── Agreement CRUD ─────────────────────────────────────────────────

export function useRentalAgreements(params?: Record<string, string>) {
  return useQuery({
    queryKey: ["rental-agreements", params],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<RentalAgreementList>>(
        "/rentals/agreements/",
        { params },
      );
      return data;
    },
  });
}

export function useRentalAgreement(uuid: string) {
  return useQuery({
    queryKey: ["rental-agreements", uuid],
    queryFn: async () => {
      const { data } = await api.get<RentalAgreementDetail>(
        `/rentals/agreements/${uuid}/`,
      );
      return data;
    },
    enabled: !!uuid,
  });
}

export function useCreateRentalAgreement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: RentalAgreementCreateUpdate) => {
      const { data } = await api.post<RentalAgreementDetail>(
        "/rentals/agreements/",
        payload,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rental-agreements"] });
    },
  });
}

export function useUpdateRentalAgreement(uuid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<RentalAgreementCreateUpdate>) => {
      const { data } = await api.patch<RentalAgreementDetail>(
        `/rentals/agreements/${uuid}/`,
        payload,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rental-agreements"] });
      qc.invalidateQueries({ queryKey: ["rental-agreements", uuid] });
    },
  });
}

export function useDeleteRentalAgreement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (uuid: string) => {
      await api.delete(`/rentals/agreements/${uuid}/`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rental-agreements"] });
    },
  });
}

// ─── Agreement Lines ────────────────────────────────────────────────

export function useAgreementLines(uuid: string) {
  return useQuery({
    queryKey: ["agreement-lines", uuid],
    queryFn: async () => {
      const { data } = await api.get<RentalAgreementLine[]>(
        `/rentals/agreements/${uuid}/lines/`,
      );
      return data;
    },
    enabled: !!uuid,
  });
}

export function useAddAgreementLine(uuid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: RentalAgreementLineCreate) => {
      const { data } = await api.post<RentalAgreementLine>(
        `/rentals/agreements/${uuid}/lines/`,
        payload,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agreement-lines", uuid] });
      qc.invalidateQueries({ queryKey: ["rental-agreements", uuid] });
    },
  });
}

export function useUpdateAgreementLine(uuid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      pk,
      payload,
    }: {
      pk: number;
      payload: Partial<RentalAgreementLineCreate>;
    }) => {
      const { data } = await api.patch<RentalAgreementLine>(
        `/rentals/agreements/${uuid}/lines/${pk}/`,
        payload,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agreement-lines", uuid] });
      qc.invalidateQueries({ queryKey: ["rental-agreements", uuid] });
    },
  });
}

export function useDeleteAgreementLine(uuid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (pk: number) => {
      await api.delete(`/rentals/agreements/${uuid}/lines/${pk}/`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agreement-lines", uuid] });
      qc.invalidateQueries({ queryKey: ["rental-agreements", uuid] });
    },
  });
}

// ─── Agreement Actions ──────────────────────────────────────────────

export function useActivateAgreement(uuid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post<RentalAgreementDetail>(
        `/rentals/agreements/${uuid}/activate/`,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rental-agreements"] });
      qc.invalidateQueries({ queryKey: ["rental-agreements", uuid] });
    },
  });
}

export function useReceiveEquipment(uuid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      item_uuids: string[];
      deploy_to_schedule_uuid?: string;
      notes?: string;
    }) => {
      const { data } = await api.post<RentalAgreementDetail>(
        `/rentals/agreements/${uuid}/receive/`,
        payload,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rental-agreements"] });
      qc.invalidateQueries({ queryKey: ["rental-agreements", uuid] });
      qc.invalidateQueries({ queryKey: ["agreement-equipment", uuid] });
    },
  });
}

export function useReturnToVendor(uuid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      item_uuids: string[];
      notes?: string;
    }) => {
      const { data } = await api.post<RentalAgreementDetail>(
        `/rentals/agreements/${uuid}/return/`,
        payload,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rental-agreements"] });
      qc.invalidateQueries({ queryKey: ["rental-agreements", uuid] });
      qc.invalidateQueries({ queryKey: ["agreement-equipment", uuid] });
    },
  });
}

export function useExtendAgreement(uuid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { new_end_date: string }) => {
      const { data } = await api.post<RentalAgreementDetail>(
        `/rentals/agreements/${uuid}/extend/`,
        payload,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rental-agreements"] });
      qc.invalidateQueries({ queryKey: ["rental-agreements", uuid] });
    },
  });
}

export function useCancelAgreement(uuid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post<RentalAgreementDetail>(
        `/rentals/agreements/${uuid}/cancel/`,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rental-agreements"] });
      qc.invalidateQueries({ queryKey: ["rental-agreements", uuid] });
    },
  });
}

// ─── Agreement Equipment ────────────────────────────────────────────

export function useAgreementEquipment(uuid: string) {
  return useQuery({
    queryKey: ["agreement-equipment", uuid],
    queryFn: async () => {
      const { data } = await api.get<EquipmentItemMinimal[]>(
        `/rentals/agreements/${uuid}/equipment/`,
      );
      return data;
    },
    enabled: !!uuid,
  });
}
