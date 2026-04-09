import fs from "node:fs";
import path from "node:path";

import type { DbShape } from "./types.js";

export const dataDir = path.join(process.cwd(), "data");
export const uploadsDir = path.join(dataDir, "uploads");
const dbPath = path.join(dataDir, "db.json");

const emptyDb = (): DbShape => ({
  conversations: {},
  predictLog: {},
});

export const ensureDataDirs = () => {
  fs.mkdirSync(uploadsDir, { recursive: true });
};

export const readDb = (): DbShape => {
  ensureDataDirs();
  if (!fs.existsSync(dbPath)) return emptyDb();
  try {
    const raw = fs.readFileSync(dbPath, "utf-8");
    const parsed = JSON.parse(raw) as DbShape;
    if (!parsed || typeof parsed !== "object") return emptyDb();
    return {
      conversations: parsed.conversations || {},
      predictLog: parsed.predictLog || {},
    };
  } catch {
    return emptyDb();
  }
};

export const writeDb = (next: DbShape) => {
  ensureDataDirs();
  const tmp = dbPath + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2), "utf-8");
  fs.renameSync(tmp, dbPath);
};
