import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getApi } from "./client";
import {
  createConversation,
  getPredictLog,
  mockCharts,
  mockPredict,
  renameConversation,
  setConversationImage,
} from "./mock";
import type { ChartItem, ModelService, PredictAnswer, PredictRequest } from "./types";

const MOCK_MODE = import.meta.env.VITE_MOCK_MODE === "true";

export const useCharts = () => {
  return useQuery<ChartItem[]>({
    queryKey: ["charts"],
    queryFn: async () => {
      if (MOCK_MODE) return [...mockCharts];
      const { data } = await getApi("qwen").get("/charts");
      return data;
    },
  });
};

export const useChartsService = (service: ModelService) => {
  return useQuery<ChartItem[]>({
    queryKey: ["charts", service],
    queryFn: async () => {
      if (MOCK_MODE) return [...mockCharts];
      const { data } = await getApi(service).get("/charts");
      return data;
    },
  });
};

export const useChart = (chartId?: string) => {
  return useQuery<ChartItem | undefined>({
    queryKey: ["charts", chartId],
    enabled: !!chartId,
    queryFn: async () => {
      if (!chartId) return undefined;
      if (MOCK_MODE) return mockCharts.find((c) => c.id === chartId);
      const { data } = await getApi("qwen").get(`/charts/${chartId}`);
      return data;
    },
  });
};

export const useChartService = (service: ModelService, chartId?: string) => {
  return useQuery<ChartItem | undefined>({
    queryKey: ["charts", service, chartId],
    enabled: !!chartId,
    queryFn: async () => {
      if (!chartId) return undefined;
      if (MOCK_MODE) return mockCharts.find((c) => c.id === chartId);
      const { data } = await getApi(service).get(`/charts/${chartId}`);
      return data;
    },
  });
};

export const useCreateConversation = () => {
  const qc = useQueryClient();

  return useMutation<ChartItem, unknown, { course?: string; title?: string }>({
    mutationFn: async (seed) => {
      if (MOCK_MODE) return createConversation(seed);
      const { data } = await getApi("qwen").post("/conversations", seed);
      return data;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["charts"] });
    },
  });
};

export const useCreateConversationService = (service: ModelService) => {
  const qc = useQueryClient();

  return useMutation<ChartItem, unknown, { course?: string; title?: string }>({
    mutationFn: async (seed) => {
      if (MOCK_MODE) return createConversation(seed);
      const { data } = await getApi(service).post("/conversations", seed);
      return data;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["charts", service] });
    },
  });
};

export const useSetConversationImage = () => {
  const qc = useQueryClient();

  return useMutation<void, unknown, { chatId: string; file: File }>({
    mutationFn: async ({ chatId, file }) => {
      if (MOCK_MODE) return setConversationImage(chatId, file);

      const form = new FormData();
      form.append("file", file);
      const { data } = await getApi("qwen").post(
        `/conversations/${encodeURIComponent(chatId)}/image`,
        form,
      );
      return data;
    },
    onSuccess: async (_data, vars) => {
      await qc.invalidateQueries({ queryKey: ["charts"] });
      await qc.invalidateQueries({ queryKey: ["charts", vars.chatId] });
    },
  });
};

export const useSetConversationImageService = (service: ModelService) => {
  const qc = useQueryClient();

  return useMutation<void, unknown, { chatId: string; file: File }>({
    mutationFn: async ({ chatId, file }) => {
      console.log('[UPLOAD IMAGE] Uploading for chat:', chatId, 'file:', file.name, 'service:', service);
      if (MOCK_MODE) return setConversationImage(chatId, file);

      const form = new FormData();
      form.append("file", file);
      const { data } = await getApi(service).post(
        `/conversations/${encodeURIComponent(chatId)}/image`,
        form,
      );
      console.log('[UPLOAD IMAGE] Upload response:', data);
      return data;
    },
    onSuccess: async (_data, vars) => {
      console.log('[UPLOAD IMAGE] Invalidating queries for:', service, vars.chatId);
      await qc.invalidateQueries({ queryKey: ["charts", service] });
      await qc.invalidateQueries({ queryKey: ["charts", service, vars.chatId] });
      console.log('[UPLOAD IMAGE] Queries invalidated, refetching...');
    },
    onError: (error, vars) => {
      console.error('[UPLOAD IMAGE] Failed:', error, vars.chatId);
    },
  });
};

export const useRenameConversation = () => {
  const qc = useQueryClient();

  return useMutation<void, unknown, { chatId: string; title: string }>({
    mutationFn: async ({ chatId, title }) => {
      if (MOCK_MODE) return renameConversation(chatId, title);
      const { data } = await getApi("qwen").patch(
        `/conversations/${encodeURIComponent(chatId)}`,
        { title },
      );
      return data;
    },
    onSuccess: async (_data, vars) => {
      await qc.invalidateQueries({ queryKey: ["charts"] });
      await qc.invalidateQueries({ queryKey: ["charts", vars.chatId] });
    },
  });
};

export const useRenameConversationService = (service: ModelService) => {
  const qc = useQueryClient();

  return useMutation<void, unknown, { chatId: string; title: string }>({
    mutationFn: async ({ chatId, title }) => {
      if (MOCK_MODE) return renameConversation(chatId, title);
      const { data } = await getApi(service).patch(
        `/conversations/${encodeURIComponent(chatId)}`,
        { title },
      );
      return data;
    },
    onSuccess: async (_data, vars) => {
      await qc.invalidateQueries({ queryKey: ["charts", service] });
      await qc.invalidateQueries({ queryKey: ["charts", service, vars.chatId] });
    },
  });
};

export const useDeleteConversationService = (service: ModelService) => {
  const qc = useQueryClient();

  return useMutation<void, unknown, { chatId: string }>({
    mutationFn: async ({ chatId }) => {
      console.log('[DELETE API] Deleting conversation:', chatId, 'type:', typeof chatId, 'service:', service);

      // Validate chatId before making request
      if (typeof chatId !== 'string' || chatId.length === 0) {
        console.error('[DELETE API] Invalid chatId:', chatId, typeof chatId);
        throw new Error(`Invalid chatId: ${chatId} (type: ${typeof chatId})`);
      }

      if (chatId === 'true' || chatId === 'false' || chatId === 'undefined' || chatId === 'null') {
        console.error('[DELETE API] Suspicious chatId value:', chatId);
        throw new Error(`Suspicious chatId value: ${chatId}`);
      }

      const url = `/conversations/${encodeURIComponent(chatId)}`;
      console.log('[DELETE API] Full URL:', url);

      await getApi(service).delete(url);
      console.log('[DELETE API] Delete API call completed');
    },
    onSuccess: async (_data, vars) => {
      console.log('[DELETE SUCCESS] Deleted conversation:', vars.chatId, 'Invalidating queries for service:', service);
      await qc.invalidateQueries({ queryKey: ["charts", service] });
      console.log('[DELETE SUCCESS] Queries invalidated');
    },
    onError: (error, vars) => {
      console.error('[DELETE ERROR] Failed to delete:', vars.chatId, error);
    },
  });
};

export const usePredict = () => {
  return useMutation<PredictAnswer, unknown, PredictRequest>({
    mutationFn: async (req) => {
      if (MOCK_MODE) return mockPredict(req);
      const { data } = await getApi("qwen").post("/predict", req);
      return data;
    },
  });
};

export const usePredictService = (service: ModelService) => {
  return useMutation<PredictAnswer, unknown, PredictRequest>({
    mutationFn: async (req) => {
      if (MOCK_MODE) return mockPredict(req);
      const { data } = await getApi(service).post("/predict", req);
      return data;
    },
  });
};

export const usePredictLog = (chartId: string) => {
  return useQuery<PredictAnswer[]>({
    queryKey: ["predictLog", chartId],
    enabled: !!chartId,
    queryFn: async () => {
      if (MOCK_MODE) return getPredictLog(chartId);
      const { data } = await getApi("qwen").get(
        `/predict/log?chartId=${encodeURIComponent(chartId)}`,
      );
      return data;
    },
    refetchInterval: 3000,
  });
};

export const usePredictLogService = (service: ModelService, chartId: string) => {
  return useQuery<PredictAnswer[]>({
    queryKey: ["predictLog", service, chartId],
    enabled: !!chartId,
    queryFn: async () => {
      if (MOCK_MODE) return getPredictLog(chartId);
      const { data } = await getApi(service).get(
        `/predict/log?chartId=${encodeURIComponent(chartId)}`,
      );
      return data;
    },
    refetchInterval: 3000,
  });
};
