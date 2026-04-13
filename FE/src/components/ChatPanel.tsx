import {
  Avatar,
  Box,
  Button,
  Chip,
  Divider,
  MenuItem,
  Paper,
  Select,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { Download, Send, Sparkles, Bot } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { usePredict, usePredictLog } from "@/api/queries";
import type { PredictAnswer } from "@/api/types";
import { useSettingsStore } from "@/store/settings";
import { useToastStore } from "@/store/toast";
import { useChatStore } from "@/store/chat";

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}

function ellipsis(s: string, max: number) {
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1))}…`;
}

function exportJsonl(rows: PredictAnswer[]) {
  const lines = rows.map((r) => JSON.stringify(r)).join("\n");
  const blob = new Blob([lines], { type: "application/jsonl;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "predict_log.jsonl";
  a.click();
  URL.revokeObjectURL(url);
}

export default function ChatPanel({
  chartId,
  chartTitle,
}: {
  chartId: string;
  chartTitle: string;
}) {
  const [tab, setTab] = useState<"qa" | "log" | "label">("qa");
  const [text, setText] = useState("");
  const pushToast = useToastStore((s) => s.push);
  const singleModel = useSettingsStore((s) => s.singleModel);
  const decode = useSettingsStore((s) => s.decode);

  const messages = useChatStore((s) => s.byChartId[chartId] || []);
  const add = useChatStore((s) => s.add);
  const clear = useChatStore((s) => s.clear);
  const listRef = useRef<HTMLDivElement | null>(null);

  const predict = usePredict();
  const logQuery = usePredictLog(chartId);

  useEffect(() => {
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length]);

  const suggestions = useMemo(
    () => [
      "Tổng doanh thu Q4?",
      "Kiểm tra tỷ lệ trục",
      "Giải thích sự sụt giảm",
      "Nêu điểm bất thường",
    ],
    []
  );

  const send = async (q: string) => {
    const question = q.trim();
    if (!question) return;

    const now = new Date().toISOString();
    add(chartId, {
      id: `m_${Math.random().toString(36).slice(2, 8)}`,
      role: "user",
      content: question,
      createdAt: now,
    });
    setText("");

    try {
      const ans = await predict.mutateAsync({
        chartId,
        question,
        params: {
          max_new_tokens: decode.max_new_tokens,
          temperature: decode.temperature,
        },
      });
      add(chartId, {
        id: `m_${Math.random().toString(36).slice(2, 8)}`,
        role: "assistant",
        content: ans.reasoning,
        createdAt: ans.createdAt,
        answer: { result: ans.answer, reasoning: ans.reasoning },
      });
      pushToast("success", "Đã có kết quả dự đoán");
    } catch {
      pushToast("error", "Lỗi khi dự đoán. Vui lòng thử lại.");
    }
  };

  return (
    <Paper
      elevation={0}
      sx={{
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 3,
        overflow: "hidden",
        width: { xs: "100%", md: 400 },
        flex: "0 0 auto",
      }}
    >
      <Box
        sx={{
          p: 2,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1,
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontWeight: 800 }}>Trợ lý CIA</Typography>
          <Typography variant="caption" color="text.secondary" noWrap>
            Biểu đồ: {chartTitle}
          </Typography>
        </Box>
        <Button
          size="small"
          variant="outlined"
          onClick={() => clear(chartId)}
          sx={{ borderRadius: 2 }}
        >
          New chat
        </Button>
      </Box>

      <Divider />

      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        variant="fullWidth"
        sx={{
          px: 1,
          "& .MuiTab-root": { fontWeight: 700, textTransform: "none" },
        }}
      >
        <Tab value="qa" label="Hỏi đáp (Q&A)" />
        <Tab value="log" label="Nhật ký dự đoán" />
        <Tab value="label" label="Gán nhãn chuyên gia" />
      </Tabs>

      <Divider />

      {tab === "qa" ? (
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            height: { xs: 520, md: "calc(100vh - 56px - 64px - 40px)" },
          }}
        >
          <Box sx={{ p: 2 }}>
            <Typography
              variant="caption"
              sx={{
                fontWeight: 800,
                color: "text.secondary",
                letterSpacing: 0.6,
              }}
            >
              TRÍ TUỆ NHÂN TẠO
            </Typography>
            <Box
              sx={{
                mt: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 1,
              }}
            >
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                Mô hình
              </Typography>
              <Select
                size="small"
                value="InternVL-Chat"
                disabled={singleModel}
                sx={{ minWidth: 200, borderRadius: 2 }}
              >
                <MenuItem value="InternVL-Chat">
                  InternVL-Chat (Selected)
                </MenuItem>
              </Select>
            </Box>
          </Box>

          <Box ref={listRef} sx={{ px: 2, pb: 2, flex: 1, overflow: "auto" }}>
            {messages.map((m) => {
              const isUser = m.role === "user";
              return (
                <Box
                  key={m.id}
                  sx={{
                    display: "flex",
                    justifyContent: isUser ? "flex-end" : "flex-start",
                    alignItems: "flex-start",
                    gap: 1,
                    mb: 1.25,
                  }}
                >
                  {!isUser && (
                    <Avatar
                      sx={{
                        width: 32,
                        height: 32,
                        bgcolor: "primary.main",
                        flexShrink: 0,
                      }}
                    >
                      <Bot size={18} />
                    </Avatar>
                  )}
                  <Box
                    sx={{
                      maxWidth: isUser ? "88%" : "calc(88% - 40px)",
                      px: 1.5,
                      py: 1,
                      borderRadius: 2,
                      bgcolor: isUser
                        ? "rgba(79,70,229,0.12)"
                        : "background.default",
                      border: "1px solid",
                      borderColor: isUser ? "rgba(79,70,229,0.18)" : "divider",
                    }}
                  >
                    <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                      {m.content}
                    </Typography>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ fontWeight: 0, display: "block", mt: 0.5 }}
                    >
                      {formatTime(m.createdAt)}
                    </Typography>
                    {m.answer ? (
                      <Box
                        sx={{
                          mt: 1,
                          p: 1.5,
                          borderRadius: 2,
                          bgcolor: "background.paper",
                          border: "1px solid",
                          borderColor: "divider",
                        }}
                      >
                        <Box
                          sx={{ display: "flex", alignItems: "center", gap: 1 }}
                        >
                          <Box
                            sx={{
                              width: 28,
                              height: 28,
                              borderRadius: 2,
                              bgcolor: "rgba(79,70,229,0.12)",
                              display: "grid",
                              placeItems: "center",
                              color: "primary.main",
                            }}
                          >
                            <Sparkles size={14} />
                          </Box>
                          <Typography
                            variant="caption"
                            sx={{ fontWeight: 400, color: "text.secondary" }}
                          >
                            KẾT QUẢ
                          </Typography>
                        </Box>
                        <Typography
                          variant="body2"
                          sx={{
                            mt: 0.75,
                            color: "text.primary",
                            whiteSpace: "pre-wrap",
                            lineHeight: 1.6,
                          }}
                          dangerouslySetInnerHTML={{
                            __html: m.answer.result
                              .replace(/(\d+[\.\)]\s)/g, "<br/>$1")
                              .replace(/(-\s)/g, "<br/>$1")
                              .replace(/(•\s)/g, "<br/>$1"),
                          }}
                        />
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ mt: 0.5, display: "block" }}
                        >
                          CĂN CỨ & DIỄN GIẢI
                        </Typography>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ mt: 0.5, display: "block" }}
                        >
                          {ellipsis(m.answer.reasoning, 180)}
                        </Typography>
                      </Box>
                    ) : null}
                  </Box>
                </Box>
              );
            })}

            {messages.length === 0 ? (
              <Box sx={{ mt: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  Bắt đầu bằng một câu hỏi. Bạn có thể thử các gợi ý bên dưới.
                </Typography>
              </Box>
            ) : null}
          </Box>

          <Box sx={{ px: 2, pb: 2 }}>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mb: 1.5 }}>
              {suggestions.map((s) => (
                <Chip
                  key={s}
                  label={s}
                  onClick={() => send(s)}
                  sx={{ bgcolor: "background.default", borderColor: "divider" }}
                  variant="outlined"
                />
              ))}
            </Box>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                p: 1,
                borderRadius: 3,
                border: "1px solid",
                borderColor: "divider",
                bgcolor: "background.paper",
                
              }}
            >
              <TextField
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Đặt câu hỏi thông minh về biểu đồ này…"
                variant="standard"
                multiline
                minRows={1}
                maxRows={4}
                sx={{ flex: 4 }}
                fullWidth
                InputProps={{ disableUnderline: true }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send(text);
                  }
                }}
              />
              <Button
                onClick={() => send(text)}
                disabled={!text.trim() || predict.isPending}
                variant="contained"
                sx={{
                  minWidth: 44,
                  width: 44,
                  height: 44,
                  borderRadius: 999,
                  flex: 1,
                  //transform: "translateY(-50%)",
                  backgroundColor: "#4F46E5",
                  "&:hover": {
                    backgroundColor: "#4338ca",
                  },
                }}
              >
                <Send size={20} />
              </Button>
            </Box>
          </Box>
        </Box>
      ) : null}

      {tab === "log" ? (
        <Box sx={{ p: 2 }}>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 1,
            }}
          >
            <Typography sx={{ fontWeight: 800 }}>Nhật ký dự đoán</Typography>
            <Button
              size="small"
              variant="outlined"
              startIcon={<Download size={18} />}
              onClick={() => {
                const rows = logQuery.data || [];
                exportJsonl(rows);
                pushToast("info", "Đã xuất JSONL");
              }}
              disabled={!logQuery.data?.length}
              sx={{ borderRadius: 2 }}
            >
              Export JSONL
            </Button>
          </Box>

          <Box sx={{ mt: 2, display: "grid", gap: 1 }}>
            {(logQuery.data || []).map((r) => (
              <Box
                key={r.id}
                sx={{
                  p: 1.5,
                  borderRadius: 2,
                  border: "1px solid",
                  borderColor: "divider",
                  bgcolor: "background.paper",
                }}
              >
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 1,
                  }}
                >
                  <Typography variant="caption" color="text.secondary">
                    {new Date(r.createdAt).toLocaleString("vi-VN")}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {r.latencyMs}ms
                  </Typography>
                </Box>
                <Typography variant="body2" sx={{ fontWeight: 700, mt: 0.5 }}>
                  {ellipsis(r.question, 120)}
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mt: 0.5 }}
                >
                  {ellipsis(r.answer, 120)}
                </Typography>
              </Box>
            ))}

            {!logQuery.isLoading && !(logQuery.data || []).length ? (
              <Typography variant="body2" color="text.secondary">
                Chưa có log.
              </Typography>
            ) : null}
          </Box>
        </Box>
      ) : null}

      {tab === "label" ? <ExpertLabelForm chartId={chartId} /> : null}
    </Paper>
  );
}

function ExpertLabelForm({ chartId }: { chartId: string }) {
  const pushToast = useToastStore((s) => s.push);
  const [verdict, setVerdict] = useState<"true" | "false">("true");
  const [taxonomy, setTaxonomy] = useState<string>("OCR");
  const [note, setNote] = useState("");

  return (
    <Box sx={{ p: 2 }}>
      <Typography sx={{ fontWeight: 800 }}>Gán nhãn chuyên gia</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
        Chart: {chartId}
      </Typography>

      <Box sx={{ mt: 2, display: "grid", gap: 1.5 }}>
        <TextField
          select
          label="Đúng / Sai"
          value={verdict}
          onChange={(e) => setVerdict(e.target.value as "true" | "false")}
        >
          <MenuItem value="true">Đúng</MenuItem>
          <MenuItem value="false">Sai</MenuItem>
        </TextField>

        {verdict === "false" ? (
          <TextField
            select
            label="Taxonomy lỗi"
            value={taxonomy}
            onChange={(e) => setTaxonomy(e.target.value)}
          >
            {[
              "OCR",
              "Axis",
              "Legend",
              "Numeric",
              "Arithmetic",
              "Multi-hop",
              "Hallucination",
            ].map((t) => (
              <MenuItem key={t} value={t}>
                {t}
              </MenuItem>
            ))}
          </TextField>
        ) : null}

        <TextField
          label="Ghi chú"
          placeholder="Mô tả ngắn lý do…"
          multiline
          minRows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />

        <Button
          variant="contained"
          onClick={() => {
            pushToast("success", "Đã lưu nhãn");
            setNote("");
          }}
        >
          Save label
        </Button>
      </Box>
    </Box>
  );
}
