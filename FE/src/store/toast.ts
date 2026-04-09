import { create } from 'zustand'

export type ToastKind = 'success' | 'info' | 'warning' | 'error'

export interface ToastItem {
  id: string
  kind: ToastKind
  message: string
}

interface ToastState {
  queue: ToastItem[]
  push: (kind: ToastKind, message: string) => void
  shift: () => void
}

export const useToastStore = create<ToastState>((set) => ({
  queue: [],
  push: (kind, message) =>
    set((s) => ({
      queue: [
        ...s.queue,
        { id: `t_${Math.random().toString(36).slice(2, 10)}`, kind, message },
      ],
    })),
  shift: () => set((s) => ({ queue: s.queue.slice(1) })),
}))
