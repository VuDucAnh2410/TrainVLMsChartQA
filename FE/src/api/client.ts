import axios from "axios";

const BASE_URL_KEY = "cia_base_url";
const BASE_URL_QWEN_KEY = "cia_base_url_qwen";
const BASE_URL_INTERN_KEY = "cia_base_url_intern";

export type ApiService = "qwen" | "intern";

export const getBaseURL = (service?: ApiService) => {
  if (service === "qwen") {
    return localStorage.getItem(BASE_URL_QWEN_KEY) || "http://127.0.0.1:8080";
  }
  return localStorage.getItem(BASE_URL_KEY) || "http://127.0.0.1:8080";
};

const makeApi = (service?: ApiService) => {
  const instance = axios.create({
    baseURL: getBaseURL(service),
    timeout: 600000,
  });
  instance.interceptors.request.use((cfg) => {
    cfg.baseURL = getBaseURL(service);
    return cfg;
  });
  return instance;
};

export const api = makeApi("qwen");
export const apiQwen = makeApi("qwen");

export const getApi = (service: ApiService) => {
  console.log('[API CLIENT] Getting API for service:', service);
  if (service === "qwen") {
    return apiQwen;
  }
  // Create or return intern API
  const internBaseUrl = localStorage.getItem(BASE_URL_INTERN_KEY) || "http://127.0.0.1:8081";
  const internApi = axios.create({
    baseURL: internBaseUrl,
    timeout: 600000,
  });
  console.log('[API CLIENT] Returning', service, 'API with base URL:', internBaseUrl);
  return internApi;
};
