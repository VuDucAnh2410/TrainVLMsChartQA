import { create } from "zustand";

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  imageUrl?: string;
  imageName?: string;
  answer?: {
    result: string;
    reasoning: string;
  };
}

interface ChatState {
  byChartId: Record<string, ChatMessage[]>;
  add: (chartId: string, msg: ChatMessage) => void;
  update: (chartId: string, msgId: string, updates: Partial<ChatMessage>) => void;
  clear: (chartId: string) => void;
  _loadFromStorage: () => void;
  _saveToStorage: () => void;
}

const STORAGE_KEY = 'cia_chat_messages';

// Helper functions to load/save from localStorage
const loadFromStorage = (): Record<string, ChatMessage[]> => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    console.log('[CHAT STORAGE] Loaded messages for', Object.keys(parsed).length, 'chats');
    return parsed;
  } catch (e) {
    console.error('[CHAT STORAGE] Failed to load:', e);
    return {};
  }
};

const saveToStorage = (data: Record<string, ChatMessage[]>) => {
  try {
    // Only keep last 100 messages per chat to avoid overflow
    const trimmed: Record<string, ChatMessage[]> = {};
    for (const [key, msgs] of Object.entries(data)) {
      trimmed[key] = msgs.slice(-100);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch (e) {
    console.error('[CHAT STORAGE] Failed to save:', e);
  }
};

export const useChatStore = create<ChatState>((set, get) => ({
  byChartId: loadFromStorage(),

  add: (chartId, msg) => {
    console.log('[CHAT STORE] Adding message to', chartId, ':', msg.id);
    set((s) => {
      const nextState = {
        byChartId: {
          ...s.byChartId,
          [chartId]: [...(s.byChartId[chartId] || []), msg],
        },
      };
      saveToStorage(nextState.byChartId);
      return nextState;
    });
  },

  update: (chartId, msgId, updates) => {
    console.log('[CHAT STORE] Updating message', msgId, 'in', chartId);
    set((s) => {
      const messages = s.byChartId[chartId] || [];
      const index = messages.findIndex(m => m.id === msgId);

      if (index === -1) {
        console.warn('[CHAT STORE] Message not found:', msgId, 'in', chartId);
        return s;
      }

      const updatedMessages = [...messages];
      updatedMessages[index] = { ...messages[index], ...updates };

      const nextState = {
        byChartId: {
          ...s.byChartId,
          [chartId]: updatedMessages,
        },
      };
      saveToStorage(nextState.byChartId);
      return nextState;
    });
  },

  clear: (chartId) => {
    console.log('[CHAT STORE] Clearing messages for', chartId);
    set((s) => {
      const nextState = {
        byChartId: {
          ...s.byChartId,
          [chartId]: [],
        },
      };
      saveToStorage(nextState.byChartId);
      return nextState;
    });
  },

  _loadFromStorage: () => {
    const loaded = loadFromStorage();
    console.log('[CHAT STORE] Manual load:', Object.keys(loaded).length, 'chats');
    set({ byChartId: loaded });
  },

  _saveToStorage: () => {
    saveToStorage(get().byChartId);
    console.log('[CHAT STORE] Manual save completed');
  },
}));
