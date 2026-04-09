import path from "node:path";

import cors from "cors";
import express from "express";
import multer from "multer";
import { nanoid } from "nanoid";

import { generateAnswer } from "./answer.js";
import { ensureDataDirs, readDb, uploadsDir, writeDb } from "./storage.js";
import type { ApiErrorBody, ChartItem, PredictAnswer, PredictRequest } from "./types.js";

const port = Number(process.env.PORT || 8000);

ensureDataDirs();

const app = express();
app.disable("x-powered-by");

app.use(cors({ origin: true }));
app.use(express.json({ limit: "2mb" }));

app.use("/uploads", express.static(uploadsDir));

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || "").toLowerCase() || ".bin";
      cb(null, `img_${Date.now()}_${nanoid(8)}${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const apiError = (res: express.Response, status: number, code: string, message: string) => {
  const body: ApiErrorBody = { code, message };
  return res.status(status).json(body);
};

const absoluteUrl = (req: express.Request, p: string) => {
  const proto = req.header("x-forwarded-proto") || req.protocol;
  const host = req.header("x-forwarded-host") || req.get("host");
  return `${proto}://${host}${p.startsWith("/") ? p : `/${p}`}`;
};

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/charts", (_req, res) => {
  const db = readDb();
  const rows = Object.values(db.conversations)
    .map((r) => r.item)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  res.json(rows);
});

app.get("/charts/:chartId", (req, res) => {
  const chartId = String(req.params.chartId || "");
  const db = readDb();
  const row = db.conversations[chartId];
  if (!row) return apiError(res, 404, "NOT_FOUND", "Không tìm thấy cuộc trò chuyện");
  res.json(row.item);
});

app.post("/conversations", (req, res) => {
  const body = (req.body || {}) as { course?: string; title?: string };
  const now = new Date().toISOString();
  const id = `c_${nanoid(8)}`;
  const item: ChartItem = {
    id,
    title: String(body.title || "Cuộc trò chuyện mới"),
    description: "Bắt đầu bằng cách tải ảnh (tuỳ chọn) và đặt câu hỏi.",
    course: body.course ? String(body.course) : "Mô-đun A",
    type: "other",
    status: "new",
    createdAt: now,
  };

  const db = readDb();
  db.conversations[id] = { item };
  writeDb(db);

  res.status(201).json(item);
});

app.patch("/conversations/:chatId", (req, res) => {
  const chatId = String(req.params.chatId || "");
  const title = String((req.body || {}).title || "").trim();
  if (!title) return apiError(res, 400, "BAD_REQUEST", "Thiếu title");

  const db = readDb();
  const row = db.conversations[chatId];
  if (!row) return apiError(res, 404, "NOT_FOUND", "Không tìm thấy cuộc trò chuyện");
  row.item.title = title;
  db.conversations[chatId] = row;
  writeDb(db);
  res.status(204).send();
});

app.post("/conversations/:chatId/image", upload.single("file"), (req, res) => {
  const chatId = String(req.params.chatId || "");
  console.log('[BACKEND UPLOAD] chatId:', chatId, 'filename:', req.file?.filename);
  const db = readDb();
  const row = db.conversations[chatId];
  if (!row) {
    console.error('[BACKEND UPLOAD] Chat not found:', chatId);
    return apiError(res, 404, "NOT_FOUND", "Không tìm thấy cuộc trò chuyện");
  }
  if (!req.file) {
    console.error('[BACKEND UPLOAD] No file uploaded');
    return apiError(res, 400, "BAD_REQUEST", "Thiếu file upload");
  }

  row.imageFile = req.file.filename;
  row.item.fileName = req.file.originalname;
  // Use relative path instead of absolute URL for better frontend compatibility
  row.item.imageUrl = `/uploads/${encodeURIComponent(req.file.filename)}`;
  row.item.status = "processed";

  console.log('[BACKEND UPLOAD] Saving imageUrl:', row.item.imageUrl);
  db.conversations[chatId] = row;
  writeDb(db);
  console.log('[BACKEND UPLOAD] Saved successfully');
  res.status(204).send();
});

app.post("/predict", async (req, res) => {
  const start = performance.now();
  const body = (req.body || {}) as PredictRequest;
  const chartId = String(body.chartId || "");
  const question = String(body.question || "").trim();
  if (!chartId || !question) return apiError(res, 400, "BAD_REQUEST", "Thiếu chartId hoặc question");

  const db = readDb();
  const row = db.conversations[chartId];
  if (!row) return apiError(res, 404, "NOT_FOUND", "Không tìm thấy cuộc trò chuyện");

  const hasImage = !!row.imageFile;
  const { answer, reasoning } = generateAnswer(question, hasImage);
  const item: PredictAnswer = {
    id: `pa_${nanoid(10)}`,
    chartId,
    question,
    answer,
    reasoning,
    latencyMs: Math.round(performance.now() - start),
    status: "ok",
    createdAt: new Date().toISOString(),
  };

  db.predictLog[chartId] = [item, ...(db.predictLog[chartId] || [])].slice(0, 200);
  writeDb(db);
  res.json(item);
});

app.get("/predict/log", (req, res) => {
  const chartId = String(req.query.chartId || "");
  if (!chartId) return apiError(res, 400, "BAD_REQUEST", "Thiếu chartId");
  const db = readDb();
  res.json(db.predictLog[chartId] || []);
});

app.delete("/conversations/:chatId", (req, res) => {
  const chatId = String(req.params.chatId || "");
  console.log('[DELETE BACKEND] Deleting conversation:', chatId);
  const db = readDb();
  const row = db.conversations[chatId];
  if (!row) {
    console.log('[DELETE BACKEND] Conversation not found:', chatId);
    return apiError(res, 404, "NOT_FOUND", "Không tìm thấy cuộc trò chuyện");
  }

  // Delete image file if exists
  if (row.imageFile) {
    const imagePath = path.join(uploadsDir, row.imageFile);
    try {
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
        console.log('[DELETE BACKEND] Deleted image file:', imagePath);
      }
    } catch (e) {
      console.error('[DELETE BACKEND] Failed to delete image:', e);
    }
  }

  // Delete from conversations
  delete db.conversations[chatId];

  // Delete from predict log
  delete db.predictLog[chatId];

  writeDb(db);
  console.log('[DELETE BACKEND] Successfully deleted conversation:', chatId);
  res.status(204).send();
});

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const msg = err instanceof Error ? err.message : "Unknown error";
  apiError(res, 500, "INTERNAL_ERROR", msg);
});

app.listen(port, "127.0.0.1", () => {
  console.log(`BE listening on http://127.0.0.1:${port}`);
});
