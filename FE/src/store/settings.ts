import { create } from "zustand";

const BASE_URL_KEY = "cia_base_url";
const BASE_URL_QWEN_KEY = "cia_base_url_qwen";
const BASE_URL_INTERN_KEY = "cia_base_url_intern";
const SINGLE_MODEL_KEY = "cia_single_model";
const DECODE_KEY = "cia_decode";

interface DecodeSettings {
  max_new_tokens: number;
  temperature: number;
}

interface SettingsState {
  baseURL: string;
  qwenBaseURL: string;
  internBaseURL: string;
  singleModel: boolean;
  decode: DecodeSettings;
  setBaseURL: (v: string) => void;
  setQwenBaseURL: (v: string) => void;
  setInternBaseURL: (v: string) => void;
  setSingleModel: (v: boolean) => void;
  setDecode: (patch: Partial<DecodeSettings>) => void;
}

const readJSON = <T>(key: string, fallback: T): T => {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const initialBaseURL =
  localStorage.getItem(BASE_URL_KEY) || "http://127.0.0.1:8000";
const initialQwenBaseURL =
  localStorage.getItem(BASE_URL_QWEN_KEY) || "http://127.0.0.1:8002";
const initialInternBaseURL =
  localStorage.getItem(BASE_URL_INTERN_KEY) || "http://127.0.0.1:8001";
const initialSingleModel = readJSON<boolean>(SINGLE_MODEL_KEY, true);
const initialDecode = readJSON<DecodeSettings>(DECODE_KEY, {
  max_new_tokens: 64,
  temperature: 0.2,
});

export const useSettingsStore = create<SettingsState>((set, get) => ({
  baseURL: initialBaseURL,
  qwenBaseURL: initialQwenBaseURL,
  internBaseURL: initialInternBaseURL,
  singleModel: initialSingleModel,
  decode: initialDecode,
  setBaseURL: (v) => {
    localStorage.setItem(BASE_URL_KEY, v);
    set({ baseURL: v });
  },
  setQwenBaseURL: (v) => {
    localStorage.setItem(BASE_URL_QWEN_KEY, v);
    set({ qwenBaseURL: v });
  },
  setInternBaseURL: (v) => {
    localStorage.setItem(BASE_URL_INTERN_KEY, v);
    set({ internBaseURL: v });
  },
  setSingleModel: (v) => {
    localStorage.setItem(SINGLE_MODEL_KEY, JSON.stringify(v));
    set({ singleModel: v });
  },
  setDecode: (patch) => {
    const next = { ...get().decode, ...patch };
    localStorage.setItem(DECODE_KEY, JSON.stringify(next));
    set({ decode: next });
  },
}));
