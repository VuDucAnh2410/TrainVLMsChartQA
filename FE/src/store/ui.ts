import { create } from "zustand";

interface UIState {
  uploadOpen: boolean;
  setUploadOpen: (open: boolean) => void;
  selectedChartId?: string;
  setSelectedChartId: (chartId?: string) => void;
}

export const useUIStore = create<UIState>((set) => ({
  uploadOpen: false,
  setUploadOpen: (open) => set({ uploadOpen: open }),
  selectedChartId: undefined,
  setSelectedChartId: (chartId) => set({ selectedChartId: chartId }),
}));
