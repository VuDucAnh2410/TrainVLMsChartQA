export type ChartType = "bar" | "line" | "pie" | "other";

export type ChartStatus = "new" | "processed" | "running" | "error";

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

export interface PredictRequest {
  chartId: string;
  question: string;
  params?: {
    max_new_tokens?: number;
    temperature?: number;
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

export interface ConversationRecord {
  item: ChartItem;
  imageFile?: string;
}

export interface DbShape {
  conversations: Record<string, ConversationRecord>;
  predictLog: Record<string, PredictAnswer[]>;
}

export interface ApiErrorBody {
  message: string;
  code: string;
}

