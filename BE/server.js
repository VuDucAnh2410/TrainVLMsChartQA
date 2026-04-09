import cors from "cors";
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import { randomUUID } from "crypto";
import { spawn } from "child_process";
import readline from "readline";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const service = (process.env.CIA_SERVICE || "qwen").trim();
const port = Number.parseInt(
  process.env.PORT || (service === "intern" ? "8001" : "8002"),
  10,
);

const storageRoot = path.join(__dirname, "storage", service);
const uploadsRoot = path.join(storageRoot, "uploads");
const dbPath = path.join(storageRoot, "db.json");

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function readJSON(p, fallback) {
  try {
    if (!fs.existsSync(p)) return fallback;
    const raw = fs.readFileSync(p, "utf-8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJSONAtomic(p, data) {
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tmp, p);
}

ensureDir(uploadsRoot);
const db = readJSON(dbPath, { charts: [], predictLog: {}, upstream: {} });
if (!db.upstream || typeof db.upstream !== "object") db.upstream = {};
if (!db.upstream.convMap || typeof db.upstream.convMap !== "object")
  db.upstream.convMap = {};
if (!db.upstream.imageUploaded || typeof db.upstream.imageUploaded !== "object")
  db.upstream.imageUploaded = {};
if (typeof db.upstream.lastError !== "string") db.upstream.lastError = "";

function guessPythonExec() {
  const explicit = String(process.env.CIA_PYTHON || "").trim();
  if (explicit) return explicit;
  const venv = String(process.env.VIRTUAL_ENV || "").trim();
  if (!venv) return "python";
  const candidate =
    process.platform === "win32"
      ? path.join(venv, "Scripts", "python.exe")
      : path.join(venv, "bin", "python");
  if (fs.existsSync(candidate)) return candidate;
  return "python";
}

const pythonExec = guessPythonExec();
const enableModel =
  (process.env.CIA_ENABLE_MODEL || "false").trim().toLowerCase() === "true";
const workerTimeoutMs = Number.parseInt(
  process.env.CIA_WORKER_TIMEOUT_MS || "600000",
  10,
);
const repoRoot = path.resolve(__dirname, "..");

function assertNodeRuntime() {
  const major = Number.parseInt(
    String(process.versions.node || "0").split(".")[0] || "0",
    10,
  );
  if (Number.isFinite(major) && major < 18) {
    throw new Error(
      `Node ${process.versions.node} is too old. Please use Node >= 18 (required for fetch/FormData/Blob).`,
    );
  }
}

const upstreamBaseUrl = String(process.env.CIA_UPSTREAM_BASE_URL || "")
  .trim()
  .replace(/\/+$/g, "");
const upstreamPrefer =
  (process.env.CIA_UPSTREAM_PREFER || "true").trim().toLowerCase() === "true";
const upstreamFallbackLocal =
  (process.env.CIA_FALLBACK_LOCAL || "true").trim().toLowerCase() === "true";
const upstreamTimeoutMs = Number.parseInt(
  process.env.CIA_UPSTREAM_TIMEOUT_MS || "8000",
  10,
);
const upstreamPredictTimeoutMs = Number.parseInt(
  process.env.CIA_UPSTREAM_PREDICT_TIMEOUT_MS || "600000",
  10,
);

let workerReady = false;
let workerLastError = "";
let workerStarted = false;
let workerPid = 0;

async function upstreamFetch(url, init, timeoutMs) {
  if (!globalThis.fetch) throw new Error("fetch not available");
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

async function upstreamJson(method, p, body, timeoutMs) {
  const url = `${upstreamBaseUrl}${p}`;
  const resp = await upstreamFetch(
    url,
    {
      method,
      headers: { "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    },
    timeoutMs,
  );
  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(
      `upstream ${method} ${p} failed: ${resp.status} ${txt}`.slice(0, 2000),
    );
  }
  return await resp.json();
}

async function upstreamUploadImage(remoteId, absImage, fileName, timeoutMs) {
  const url = `${upstreamBaseUrl}/conversations/${encodeURIComponent(remoteId)}/image`;
  const buf = fs.readFileSync(absImage);
  const form = new FormData();
  form.append("file", new Blob([buf]), fileName);
  const resp = await upstreamFetch(
    url,
    { method: "POST", body: form },
    timeoutMs,
  );
  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(
      `upstream image upload failed: ${resp.status} ${txt}`.slice(0, 2000),
    );
  }
  return await resp.json();
}

async function ensureUpstreamConversation(chart) {
  const localId = String(chart.id);
  const existing = db.upstream.convMap[localId];
  if (existing) return String(existing);
  const created = await upstreamJson(
    "POST",
    "/conversations",
    {
      title: chart.title || "Cuộc trò chuyện mới",
      description: chart.description || "",
      course: chart.course || "",
    },
    upstreamTimeoutMs,
  );
  const remoteId = String(created.id || "");
  if (!remoteId) throw new Error("upstream create conversation missing id");
  db.upstream.convMap[localId] = remoteId;
  writeJSONAtomic(dbPath, db);
  return remoteId;
}

let worker = null;

function startWorker() {
  const proc = spawn(
    pythonExec,
    [
      "-u",
      path.join(__dirname, "worker.py"),
      "--service",
      service,
      "--repo_root",
      repoRoot,
    ],
    { stdio: ["pipe", "pipe", "pipe"], windowsHide: true },
  );

  const rl = readline.createInterface({ input: proc.stdout });
  const pending = new Map();

  workerReady = true;
  workerStarted = true;
  workerLastError = "";
  workerPid = proc.pid || 0;

  process.stderr.write(
    `CIA worker started pid=${workerPid} python=${pythonExec} service=${service}\n`,
  );

  proc.stdin.on("error", (e) => {
    workerLastError = String(e && e.message ? e.message : e);
    process.stderr.write(`CIA worker stdin error: ${workerLastError}\n`);
  });

  rl.on("line", (line) => {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    const id = msg && msg.requestId;
    if (!id) return;
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    if (msg.error) {
      const err = new Error(String(msg.error));
      if (msg.trace) err.trace = String(msg.trace);
      p.reject(err);
    } else p.resolve(msg);
  });

  proc.on("error", (err) => {
    workerReady = false;
    workerLastError = String(err && err.message ? err.message : err);
    worker = null;
    process.stderr.write(`CIA worker error: ${workerLastError}\n`);
  });

  proc.on("exit", (code) => {
    workerReady = false;
    workerLastError = `worker exited: ${code}`;
    workerPid = 0;
    for (const [, p] of pending.entries()) {
      p.reject(new Error(`worker exited: ${code}`));
    }
    pending.clear();
    worker = null;
    process.stderr.write(`CIA worker exit: ${workerLastError}\n`);
  });

  proc.stderr.on("data", (buf) => {
    const s = String(buf || "");
    if (s.trim()) {
      workerLastError = s.trim().slice(-2000);
      process.stderr.write(`CIA worker stderr: ${workerLastError}\n`);
    }
  });

  try {
    if (proc.stdin.writable) proc.stdin.write("\n");
  } catch (e) {
    workerLastError = String(e && e.message ? e.message : e);
    process.stderr.write(
      `CIA worker initial write failed: ${workerLastError}\n`,
    );
  }

  const call = (payload, timeoutMs = workerTimeoutMs) => {
    if (!workerReady)
      return Promise.reject(new Error(workerLastError || "worker not ready"));
    const requestId = `w_${Math.random().toString(36).slice(2, 10)}`;
    const msg = { requestId, ...payload };

    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        pending.delete(requestId);
        reject(new Error("worker timeout"));
      }, timeoutMs);

      pending.set(requestId, {
        resolve: (v) => {
          clearTimeout(t);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(t);
          reject(e);
        },
      });

      try {
        if (!proc.stdin.writable) throw new Error("worker stdin not writable");
        proc.stdin.write(`${JSON.stringify(msg)}\n`);
      } catch (e) {
        pending.delete(requestId);
        reject(new Error(String(e && e.message ? e.message : e)));
      }
    });
  };

  return { call };
}

function getWorker() {
  if (!enableModel) return null;
  if (worker) return worker;
  worker = startWorker();
  return worker;
}

function nowISO() {
  return new Date().toISOString();
}

function toChartItem(row) {
  return {
    id: String(row.id),
    title: String(row.title || "Cuộc trò chuyện mới"),
    description: row.description ? String(row.description) : undefined,
    course: row.course ? String(row.course) : undefined,
    type: row.type || "other",
    status: row.status || "new",
    createdAt: row.createdAt || nowISO(),
    fileName: row.fileName ? String(row.fileName) : undefined,
    imageUrl: row.imageUrl ? String(row.imageUrl) : undefined,
  };
}

function findChart(id) {
  return db.charts.find((c) => String(c.id) === String(id));
}

function upsertChart(next) {
  const idx = db.charts.findIndex((c) => String(c.id) === String(next.id));
  if (idx >= 0) db.charts[idx] = next;
  else db.charts.unshift(next);
  writeJSONAtomic(dbPath, db);
}

function appendPredictLog(chartId, entry) {
  const key = String(chartId);
  if (!db.predictLog[key]) db.predictLog[key] = [];
  db.predictLog[key].push(entry);
  if (db.predictLog[key].length > 200) {
    db.predictLog[key] = db.predictLog[key].slice(-200);
  }
  writeJSONAtomic(dbPath, db);
}

const app = express();
assertNodeRuntime();
app.use(cors());
app.use(express.json({ limit: "8mb" }));

app.use((err, _req, res, next) => {
  if (err && err instanceof SyntaxError) {
    return res
      .status(400)
      .json({ error: "INVALID_JSON", message: String(err.message || err) });
  }
  return next(err);
});

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service,
    time: nowISO(),
    upstream: {
      enabled: Boolean(upstreamBaseUrl),
      baseUrl: upstreamBaseUrl || "",
      prefer: upstreamPrefer,
      fallbackLocal: upstreamFallbackLocal,
      timeoutMs: upstreamTimeoutMs,
      predictTimeoutMs: upstreamPredictTimeoutMs,
      lastError: String(db.upstream.lastError || ""),
    },
    model: {
      enabled: enableModel,
      workerReady,
      workerStarted,
      workerPid,
      python: pythonExec,
      allowCpu:
        (process.env.CIA_ALLOW_CPU || "false").trim().toLowerCase() === "true",
      lastError: workerReady ? "" : workerLastError,
    },
  });
});

app.get("/charts", (_req, res) => {
  res.json(db.charts.map(toChartItem));
});

app.get("/charts/:id", (req, res) => {
  const chart = findChart(req.params.id);
  if (!chart) return res.status(404).json({ error: "NOT_FOUND" });
  res.json(toChartItem(chart));
});

app.post("/conversations", (req, res) => {
  const seed = req.body && typeof req.body === "object" ? req.body : {};
  const id = randomUUID();
  const chart = {
    id,
    title: seed.title || "Cuộc trò chuyện mới",
    description: seed.description || "",
    course: seed.course || "",
    type: "other",
    status: "new",
    createdAt: nowISO(),
    fileName: "",
    imageUrl: "",
  };
  upsertChart(chart);
  (async () => {
    if (!upstreamBaseUrl) return;
    try {
      await ensureUpstreamConversation(chart);
      db.upstream.lastError = "";
      writeJSONAtomic(dbPath, db);
    } catch (e) {
      db.upstream.lastError = String(e && e.message ? e.message : e);
      writeJSONAtomic(dbPath, db);
    }
  })();
  res.json(toChartItem(chart));
});

app.patch("/conversations/:id", (req, res) => {
  const chart = findChart(req.params.id);
  if (!chart) return res.status(404).json({ error: "NOT_FOUND" });
  const { title } = req.body || {};
  if (title && typeof title === "string") {
    chart.title = title;
  }
  upsertChart(chart);
  (async () => {
    if (!upstreamBaseUrl) return;
    const localId = String(chart.id);
    const remoteId = db.upstream.convMap[localId];
    if (!remoteId) return;
    try {
      await upstreamJson(
        "PATCH",
        `/conversations/${encodeURIComponent(String(remoteId))}`,
        { title: chart.title },
        upstreamTimeoutMs,
      );
      db.upstream.lastError = "";
      writeJSONAtomic(dbPath, db);
    } catch (e) {
      db.upstream.lastError = String(e && e.message ? e.message : e);
      writeJSONAtomic(dbPath, db);
    }
  })();
  res.json({ ok: true });
});

app.delete("/conversations/:id", (req, res) => {
  const idx = db.charts.findIndex((c) => String(c.id) === String(req.params.id));
  if (idx < 0) return res.status(404).json({ error: "NOT_FOUND" });

  const chart = db.charts[idx];
  db.charts.splice(idx, 1);

  // Delete predict log
  delete db.predictLog[String(chart.id)];

  // Delete uploaded image file if exists
  if (chart.fileName) {
    const imagePath = path.join(uploadsRoot, chart.fileName);
    try {
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    } catch (e) {
      console.error(`Failed to delete image: ${e}`);
    }
  }

  writeJSONAtomic(dbPath, db);
  res.json({ ok: true });
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

app.post("/conversations/:id/image", upload.single("file"), (req, res) => {
  const chart = findChart(req.params.id);
  if (!chart) return res.status(404).json({ error: "NOT_FOUND" });
  if (!req.file) return res.status(400).json({ error: "MISSING_FILE" });

  const extFromMime =
    req.file.mimetype === "image/png"
      ? ".png"
      : req.file.mimetype === "image/jpeg"
        ? ".jpg"
        : "";
  const extFromName = path.extname(req.file.originalname || "").toLowerCase();
  const ext = extFromMime || extFromName || ".png";

  const fileName = `${String(chart.id)}${ext}`;
  const absPath = path.join(uploadsRoot, fileName);
  fs.writeFileSync(absPath, req.file.buffer);

  chart.fileName = fileName;
  chart.imageUrl = `/files/${encodeURIComponent(service)}/${encodeURIComponent(fileName)}`;
  chart.status = "processed";
  upsertChart(chart);
  (async () => {
    if (!upstreamBaseUrl) return;
    try {
      const remoteId = await ensureUpstreamConversation(chart);
      await upstreamUploadImage(
        remoteId,
        absPath,
        fileName,
        upstreamPredictTimeoutMs,
      );
      db.upstream.imageUploaded[String(chart.id)] = true;
      db.upstream.lastError = "";
      writeJSONAtomic(dbPath, db);
    } catch (e) {
      db.upstream.lastError = String(e && e.message ? e.message : e);
      writeJSONAtomic(dbPath, db);
    }
  })();
  res.json({ ok: true, imageUrl: chart.imageUrl });
});

app.get("/files/:svc/:file", (req, res) => {
  const svc = String(req.params.svc || "");
  const file = path.basename(String(req.params.file || ""));
  if (
    !svc ||
    !file ||
    file.includes("..") ||
    file.includes("/") ||
    file.includes("\\")
  ) {
    return res.status(400).json({ error: "INVALID_PATH" });
  }
  const p = path.join(__dirname, "storage", svc, "uploads", file);
  if (!fs.existsSync(p)) return res.status(404).end();
  res.sendFile(p);
});

app.post("/predict", async (req, res) => {
  const t0 = Date.now();
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const chartId = String(body.chartId || "");
  const question = String(body.question || "");
  if (!chartId || !question)
    return res.status(400).json({ error: "INVALID_INPUT" });

  const chart = findChart(chartId);
  if (!chart) return res.status(404).json({ error: "NOT_FOUND" });

  let answerText =
    service === "intern"
      ? "(Intern) Backend đã nhận câu hỏi. Model sẽ tích hợp sau."
      : "(Qwen) Backend đã nhận câu hỏi. Model sẽ tích hợp sau.";
  let reasoningText = answerText;
  let status = "ok";
  let upstreamUsed = false;

  const params =
    body.params && typeof body.params === "object" ? body.params : {};
  const lang = (params.lang || "vi").toString().toLowerCase();
  const modelQuestion = question;
  const upstreamQuestion =
    lang === "vi"
      ? `Hãy trả lời bằng tiếng Việt, ngắn gọn và đúng trọng tâm.\nCâu hỏi: ${question}`
      : question;

  const tryUpstream = Boolean(upstreamBaseUrl) && upstreamPrefer;
  if (tryUpstream) {
    try {
      const remoteId = await ensureUpstreamConversation(chart);
      const fileName = chart.fileName ? String(chart.fileName) : "";
      const absImage = fileName ? path.join(uploadsRoot, fileName) : "";
      if (absImage && !db.upstream.imageUploaded[String(chart.id)]) {
        await upstreamUploadImage(
          remoteId,
          absImage,
          fileName,
          upstreamPredictTimeoutMs,
        );
        db.upstream.imageUploaded[String(chart.id)] = true;
        writeJSONAtomic(dbPath, db);
      }

      const remoteResp = await upstreamJson(
        "POST",
        "/predict",
        { chartId: remoteId, question: upstreamQuestion, params },
        upstreamPredictTimeoutMs,
      );
      answerText = String(remoteResp.answer || "");
      reasoningText = String(remoteResp.reasoning || remoteResp.answer || "");
      status = String(remoteResp.status || "ok");
      upstreamUsed = true;
      db.upstream.lastError = "";
      writeJSONAtomic(dbPath, db);
    } catch (e) {
      db.upstream.lastError = String(e && e.message ? e.message : e);
      writeJSONAtomic(dbPath, db);
      status = "error";
      answerText = "UPSTREAM_UNAVAILABLE";
      reasoningText = String(db.upstream.lastError || answerText);
      if (!upstreamFallbackLocal) {
        status = "error";
      }
    }
  }

  if (upstreamUsed) {
  } else {
    const fileName = chart.fileName ? String(chart.fileName) : "";
    const absImage = fileName ? path.join(uploadsRoot, fileName) : "";

    const callOnce = async () => {
      const w = getWorker();
      if (!w) throw new Error("MODEL_DISABLED");
      return await w.call({
        imagePath: absImage,
        question: modelQuestion,
        params,
      });
    };

    if (enableModel) {
      try {
        const resp = await callOnce();
        answerText = String(resp.answer || "");
        reasoningText = String(resp.reasoning || resp.answer || "");
        status = "ok";
      } catch (e) {
        const msg = String(e && e.message ? e.message : e);
        const retriable =
          msg.startsWith("worker exited") ||
          msg.includes("worker stdin") ||
          msg.includes("worker not ready");
        if (retriable) {
          worker = null;
          try {
            const resp2 = await callOnce();
            answerText = String(resp2.answer || "");
            reasoningText = String(resp2.reasoning || resp2.answer || "");
            status = "ok";
          } catch (e2) {
            status = "error";
            answerText = String(e2 && e2.message ? e2.message : "MODEL_ERROR");
            reasoningText = answerText;
            workerLastError = answerText;
            if (e2 && e2.trace) process.stderr.write(String(e2.trace) + "\n");
          }
        } else {
          status = "error";
          answerText = msg;
          reasoningText = answerText;
          workerLastError = answerText;
          if (e && e.trace) process.stderr.write(String(e.trace) + "\n");
        }
      }
    }
  }
  const createdAt = nowISO();
  const out = {
    id: `p_${Math.random().toString(36).slice(2, 10)}`,
    chartId,
    question,
    answer: answerText,
    reasoning: reasoningText,
    latencyMs: Date.now() - t0,
    status,
    createdAt,
  };
  appendPredictLog(chartId, out);
  res.json(out);
});

app.get("/predict/log", (req, res) => {
  const chartId = String(req.query.chartId || "");
  if (!chartId) return res.status(400).json({ error: "INVALID_INPUT" });
  const rows = db.predictLog[chartId] || [];
  res.json(rows);
});

app.listen(port, () => {
  process.stdout.write(`CIA BE service=${service} port=${port}\n`);
});
