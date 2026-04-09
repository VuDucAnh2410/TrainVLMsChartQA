import {
  Box,
  Button,
  Card,
  Checkbox,
  Divider,
  IconButton,
  Menu,
  MenuItem,
  Skeleton,
  TextField,
  Typography,
  CircularProgress,
} from "@mui/material";
import { MoreVertical, Trash2, ChevronDown, CheckSquare } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useChartsService, useDeleteConversationService } from "@/api/queries";
import type { ChartItem } from "@/api/types";
import type { ModelService } from "@/api/types";
import StatusChip from "@/components/StatusChip";
import EmptyState from "@/components/EmptyState";
import { useChatStore } from "@/store/chat";
import { useSettingsStore } from "@/store/settings";

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("vi-VN");
}

function ChartCard({ chart, service, selected, onSelect, showCheckbox }: {
  chart: ChartItem;
  service: ModelService;
  selected: boolean;
  onSelect: (id: string) => void;
  showCheckbox: boolean;
}) {
  const nav = useNavigate();
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);
  const deleteConv = useDeleteConversationService(service);

  // Get baseURL for resolving image URLs
  const qwenBaseURL = useSettingsStore((s) => s.qwenBaseURL);
  const internBaseURL = useSettingsStore((s) => s.internBaseURL);
  const serviceBaseURL = service === 'intern' ? internBaseURL : qwenBaseURL;

  // Resolve image URL to full URL
  const resolvedImageUrl = useMemo(() => {
    if (!chart.imageUrl) return '';
    if (chart.imageUrl.startsWith('http://') || chart.imageUrl.startsWith('https://')) {
      return chart.imageUrl;
    }
    if (!serviceBaseURL) return chart.imageUrl;
    return `${serviceBaseURL.replace(/\/$/, '')}${chart.imageUrl.startsWith('/') ? '' : '/'}${chart.imageUrl}`;
  }, [chart.imageUrl, serviceBaseURL]);

  const lastMessage = useChatStore((s) => {
    const rows = s.byChartId[chart.id];
    if (!rows || rows.length === 0) return undefined;
    return rows[rows.length - 1];
  });

  const handleDelete = async () => {
    console.log('[DELETE] Deleting:', chart.id, chart.title);
    setAnchor(null);

    if (confirm(`Xóa "${chart.title}"?`)) {
      try {
        await deleteConv.mutateAsync({ chatId: chart.id });
        console.log('[DELETE] Success:', chart.id);
      } catch (error) {
        console.error('[DELETE] Error:', error);
        alert('Lỗi khi xóa: ' + JSON.stringify(error));
      }
    }
  };

  return (
    <Card
      sx={{
        p: 2,
        display: "flex",
        gap: 2,
        alignItems: "stretch",
        cursor: showCheckbox ? "default" : "pointer",
        ":hover": { boxShadow: "0 10px 28px rgba(15,23,42,0.08)" },
        border: selected ? "2px solid" : "1px solid",
        borderColor: selected ? "primary.main" : "divider",
        opacity: deleteConv.isPending ? 0.5 : 1,
      }}
      onClick={(e) => {
        if (showCheckbox) return;
        if (e.target instanceof HTMLElement && e.target.closest('input[type="checkbox"]')) {
          return;
        }
        console.log('[NAVIGATE] To chat:', chart.id);
        nav(`/chat/${chart.id}`);
      }}
    >
      <Box
        sx={{
          width: 116,
          height: 76,
          borderRadius: 2,
          overflow: "hidden",
          border: "1px solid",
          borderColor: "divider",
          bgcolor: "background.default",
          flex: "0 0 auto",
          display: "grid",
          placeItems: "center",
        }}
      >
        {resolvedImageUrl ? (
          <Box
            component="img"
            src={resolvedImageUrl}
            alt={chart.title}
            sx={{ width: "100%", height: "100%", objectFit: "cover" }}
            onError={(e) => {
              console.error('[IMAGE] Load failed:', resolvedImageUrl);
              e.currentTarget.style.display = 'none';
            }}
            onLoad={() => {
              console.log('[IMAGE] Loaded:', resolvedImageUrl);
            }}
          />
        ) : (
          <Typography variant="caption" color="text.secondary">
            No context
          </Typography>
        )}
      </Box>

      <Box
        sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          {showCheckbox && (
            <Checkbox
              checked={selected}
              onChange={(_e, checked) => {
                // Don't use the checked state - toggle based on chart.id instead
                onSelect(chart.id);
                console.log('[SELECT] Checkbox clicked for chart:', chart.id, 'was selected:', selected);
              }}
              onClick={(e) => e.stopPropagation()}
            />
          )}
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography sx={{ fontWeight: 800 }} noWrap>
              {chart.title}
            </Typography>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ mt: 0.25 }}
              noWrap
            >
              {lastMessage ? lastMessage.content : chart.description || "—"}
            </Typography>
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <StatusChip status={chart.status} />
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                setAnchor(e.currentTarget);
              }}
            >
              <MoreVertical size={18} />
            </IconButton>
            <Menu
              anchorEl={anchor}
              open={!!anchor}
              onClose={() => setAnchor(null)}
              onClick={(e) => e.stopPropagation()}
            >
              <MenuItem onClick={handleDelete} sx={{ color: "error.main" }} disabled={deleteConv.isPending}>
                <Trash2 size={16} style={{ marginRight: 8 }} />
                Xóa cuộc trò chuyện
              </MenuItem>
            </Menu>
          </Box>
        </Box>
        <Divider sx={{ my: 1.25 }} />
        <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
          <Typography variant="caption" color="text.secondary">
            Ngày: {formatDate(chart.createdAt)}
          </Typography>
        </Box>
      </Box>
    </Card>
  );
}

export default function ChartsList({ service }: { service: ModelService }) {
  const q = useChartsService(service);
  const deleteConv = useDeleteConversationService(service);

  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectAllAnchor, setSelectAllAnchor] = useState<null | HTMLElement>(null);

  const filtered = useMemo(() => {
    const rows = q.data || [];
    const s = search.trim().toLowerCase();
    return rows.filter((c) => {
      const okSearch =
        !s ||
        c.title.toLowerCase().includes(s) ||
        (c.description || "").toLowerCase().includes(s);
      return okSearch;
    });
  }, [q.data, search]);

  const toggleSelect = (id: string) => {
    console.log('[TOGGLE_SELECT] ID:', id, 'type:', typeof id);
    if (typeof id !== 'string' || id.length === 0) {
      console.error('[TOGGLE_SELECT] Invalid ID:', id, typeof id);
      return;
    }
    setSelectedIds((prev) => {
      const next = new Set(prev);
      // Toggle: if already selected, remove it; otherwise add it
      if (next.has(id)) {
        next.delete(id);
        console.log('[TOGGLE_SELECT] Removed from selection:', id);
      } else {
        next.add(id);
        console.log('[TOGGLE_SELECT] Added to selection:', id);
      }
      console.log('[TOGGLE_SELECT] Total selected:', next.size, 'of', filtered.length);
      console.log('[TOGGLE_SELECT] Selected IDs:', Array.from(next));
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      console.log('[SELECT_ALL] Deselecting all');
      setSelectedIds(new Set());
    } else {
      console.log('[SELECT_ALL] Selecting all:', filtered.length);
      setSelectedIds(new Set(filtered.map((c) => c.id)));
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) {
      alert('Chưa chọn cuộc trò chuyện nào!');
      return;
    }

    // Validate: ensure all IDs are strings
    const validIds = Array.from(selectedIds).filter(id => {
      const isValid = typeof id === 'string' && id.length > 0 && id !== 'true' && id !== 'false';
      if (!isValid) console.warn('[DELETE_SELECTED] Invalid ID filtered out:', id, typeof id);
      return isValid;
    });

    if (validIds.length === 0) {
      alert('Không có ID hợp lệ để xóa!');
      return;
    }

    if (validIds.length !== selectedIds.size) {
      console.warn('[DELETE_SELECTED] Some IDs were invalid. Valid:', validIds.length, 'Total:', selectedIds.size);
    }

    if (!confirm(`Xóa ${validIds.length} cuộc trò chuyện đã chọn?`)) {
      return;
    }

    console.log('[DELETE_SELECTED] Deleting', validIds.length, 'conversations. IDs:', validIds);

    try {
      // Delete all at once (parallel) for speed
      await Promise.all(
        validIds.map(id =>
          deleteConv.mutateAsync({ chatId: id })
        )
      );
      setSelectedIds(new Set());
      setSelectionMode(false);
      console.log('[DELETE_SELECTED] All deleted successfully');
    } catch (error) {
      console.error('[DELETE_SELECTED] Error:', error);
      alert('Lỗi khi xóa: ' + JSON.stringify(error));
    }
  };

  const handleDeleteAll = async () => {
    if (filtered.length === 0) {
      alert('Không có cuộc trò chuyện nào!');
      return;
    }

    // Validate: ensure all chart IDs are valid strings
    const validCharts = filtered.filter(c => {
      const isValid = typeof c.id === 'string' && c.id.length > 0 && c.id !== 'true' && c.id !== 'false';
      if (!isValid) console.warn('[DELETE_ALL] Invalid chart filtered out:', c.id, typeof c.id);
      return isValid;
    });

    if (validCharts.length === 0) {
      alert('Không có cuộc trò chuyện hợp lệ để xóa!');
      return;
    }

    if (validCharts.length !== filtered.length) {
      console.warn('[DELETE_ALL] Some charts were invalid. Valid:', validCharts.length, 'Total:', filtered.length);
    }

    if (!confirm(`Xóa TẤT CẢ ${validCharts.length} cuộc trò chuyện?\n\nThao tác này có thể mất vài giây.`)) {
      return;
    }

    console.log('[DELETE_ALL] Deleting all:', validCharts.length, 'conversations');
    console.log('[DELETE_ALL] Chart IDs:', validCharts.map(c => c.id));

    try {
      // Batch delete in chunks of 10 for performance
      const chunks = [];
      for (let i = 0; i < validCharts.length; i += 10) {
        chunks.push(validCharts.slice(i, i + 10));
      }

      for (let i = 0; i < chunks.length; i++) {
        console.log(`[DELETE_ALL] Processing chunk ${i + 1}/${chunks.length}, size: ${chunks[i].length}`);
        await Promise.all(
          chunks[i].map(chart =>
            deleteConv.mutateAsync({ chatId: chart.id })
          )
        );
      }

      setSelectedIds(new Set());
      setSelectionMode(false);
      console.log('[DELETE_ALL] All deleted successfully');
    } catch (error) {
      console.error('[DELETE_ALL] Error:', error);
      alert('Lỗi khi xóa: ' + JSON.stringify(error));
    }
  };

  return (
    <Box>
      <Box
        sx={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 2,
        }}
      >
        <Box>
          <Typography variant="h1">Kho dữ liệu</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {filtered.length > 0 && `${filtered.length} cuộc trò chuyện`}
          </Typography>
        </Box>
        <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
          {selectionMode && selectedIds.size > 0 && (
            <>
              <Typography variant="body2" color="text.secondary">
                Đã chọn: {selectedIds.size}
              </Typography>
              <Button
                variant="contained"
                color="error"
                startIcon={<Trash2 size={18} />}
                onClick={handleDeleteSelected}
                disabled={deleteConv.isPending}
              >
                Xóa ({selectedIds.size})
              </Button>
            </>
          )}
          {!selectionMode && (
            <Button
              variant="outlined"
              color="error"
              onClick={handleDeleteAll}
              disabled={filtered.length === 0 || deleteConv.isPending}
            >
              Xóa tất cả
            </Button>
          )}
          <Button
            variant="outlined"
            onClick={() => {
              setSelectionMode(!selectionMode);
              setSelectedIds(new Set());
              console.log('[SELECTION_MODE]', !selectionMode);
            }}
            endIcon={<ChevronDown size={16} />}
            sx={{ minWidth: 120 }}
          >
            {selectionMode ? "Thoát chọn" : "Chọn để xóa"}
          </Button>
          {selectionMode && (
            <>
              <Button
                variant="outlined"
                onClick={(e) => setSelectAllAnchor(e.currentTarget)}
                endIcon={<ChevronDown size={16} />}
              >
                {selectedIds.size === filtered.length ? "Bỏ chọn" : "Chọn tất cả"}
              </Button>
              <Menu
                anchorEl={selectAllAnchor}
                open={!!selectAllAnchor}
                onClose={() => setSelectAllAnchor(null)}
              >
                <MenuItem onClick={() => { setSelectedIds(new Set(filtered.map(c => c.id))); setSelectAllAnchor(null); }}>
                  Chọn tất cả ({filtered.length})
                </MenuItem>
                <MenuItem onClick={() => { setSelectedIds(new Set()); setSelectAllAnchor(null); }}>
                  Bỏ chọn
                </MenuItem>
              </Menu>
            </>
          )}
        </Box>
      </Box>

      <Box
        sx={{
          mt: 2,
          p: 2,
          borderRadius: 3,
          border: "1px solid",
          borderColor: "divider",
          bgcolor: "background.paper",
        }}
      >
        <TextField
          fullWidth
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm kiếm theo tên hoặc mô tả"
          label="Tìm kiếm"
        />
      </Box>

      {deleteConv.isPending && (
        <Box sx={{ mt: 2, display: "flex", alignItems: "center", gap: 2, p: 2, bgcolor: "background.paper", borderRadius: 2 }}>
          <CircularProgress size={20} />
          <Typography variant="body2" color="text.secondary">
            Đang xóa {selectedIds.size || filtered.length} cuộc trò chuyện...
          </Typography>
        </Box>
      )}

      <Box sx={{ mt: 2, display: "grid", gap: 1.5 }}>
        {q.isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} sx={{ p: 2, display: "flex", gap: 2 }}>
              <Skeleton variant="rounded" width={116} height={76} />
              <Box sx={{ flex: 1 }}>
                <Skeleton width="52%" />
                <Skeleton width="72%" />
                <Skeleton width="36%" />
              </Box>
            </Card>
          ))
        ) : filtered.length ? (
          filtered.map((c) => (
            <ChartCard
              key={c.id}
              chart={c}
              service={service}
              selected={selectedIds.has(c.id)}
              onSelect={toggleSelect}
              showCheckbox={selectionMode}
            />
          ))
        ) : (
          <EmptyState
            title="Chưa có cuộc trò chuyện"
            subtitle="Tạo một cuộc trò chuyện mới để bắt đầu đặt câu hỏi."
          />
        )}
      </Box>
    </Box>
  );
}
