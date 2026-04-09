export type ChartType = "bar" | "line" | "pie" | "other";

export type ModelService = "qwen" | "intern";

export type ChartStatus = "new" | "processed" | "running" | "error";

export type AccessLevel = "private" | "class" | "company";

export interface ChartItem {
  id: string;
  title: string;
  description?: string;
  course?: string;
  type: ChartType;
  status: ChartStatus;
  createdAt: string;
  fileName?: string;
  imageUrl?: string;
}

export interface UploadChartInput {
  file: File;
  title: string;
  description?: string;
  course?: string;
  access: AccessLevel;
}

export interface PredictRequest {
  chartId: string;
  question: string;
  params?: {
    max_new_tokens?: number;
    temperature?: number;
    lang?: "vi" | "en";
  };
}

export interface PredictAnswer {
  id: string;
  chartId: string;
  question: string;
  answer: string;
  reasoning: string;
  latencyMs: number;
  status: "ok" | "error";
  createdAt: string;
}

export type BatchRunStatus = "Running" | "Done" | "Error";

export interface BatchRun {
  id: string;
  total: number;
  processed: number;
  status: BatchRunStatus;
  metrics?: {
    em?: number;
    yesNo?: number;
    relaxedNumeric?: number;
  };
  breakdown?: Array<{ label: string; value: number }>;
  files?: {
    jsonl?: string;
    csv?: string;
  };
}
