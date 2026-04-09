import {
  Box,
  Button,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
} from "@mui/material";
import { BookOpen, MessageSquare, Plus, Settings2 } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

import { useCreateConversationService } from "@/api/queries";

function NavItem({
  to,
  label,
  icon,
}: {
  to: string;
  label: string;
  icon: React.ReactNode;
}) {
  const nav = useNavigate();
  const loc = useLocation();
  const active = loc.pathname === to || loc.pathname.startsWith(`${to}/`);

  return (
    <ListItemButton
      selected={active}
      onClick={() => nav(to)}
      sx={{
        borderRadius: 2,
        mb: 0.5,
        py: 1,
        "&.Mui-selected": { bgcolor: "rgba(79,70,229,0.10)" },
      }}
    >
      <ListItemIcon
        sx={{ minWidth: 36, color: active ? "primary.main" : "text.secondary" }}
      >
        {icon}
      </ListItemIcon>
      <ListItemText
        primary={label}
        primaryTypographyProps={{
          fontWeight: active ? 700 : 600,
          color: active ? "text.primary" : "text.secondary",
        }}
      />
    </ListItemButton>
  );
}

export default function SideNav() {
  const nav = useNavigate();
  const createConv = useCreateConversationService("qwen");

  return (
    <Box
      sx={{
        width: 248,
        flex: "0 0 248px",
        borderRight: "1px solid",
        borderColor: "divider",
        p: 2,
        display: "flex",
        flexDirection: "column",
        gap: 2,
        bgcolor: "background.paper",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Box
          sx={{
            width: 36,
            height: 36,
            borderRadius: 2,
            bgcolor: "primary.main",
            display: "grid",
            placeItems: "center",
            color: "common.white",
          }}
        >
          <MessageSquare size={18} />
        </Box>
        <Box sx={{ lineHeight: 1.1 }}>
          <Typography sx={{ fontWeight: 800 }}>CIA Assistant</Typography>
          <Typography variant="caption" color="text.secondary">
            LMS MODULE V2
          </Typography>
        </Box>
      </Box>

      <List dense disablePadding>
        <NavItem
          to="/chat"
          label="Chat box"
          icon={<MessageSquare size={18} />}
        />
        <NavItem
          to="/charts"
          label="Kho dữ liệu"
          icon={<BookOpen size={18} />}
        />
        <NavItem
          to="/settings"
          label="Cài đặt"
          icon={<Settings2 size={18} />}
        />
      </List>

      <Box sx={{ mt: 1 }}>
        <Button
          fullWidth
          variant="contained"
          startIcon={<Plus size={18} />}
          disabled={createConv.isPending}
          onClick={async () => {
            const convo = await createConv.mutateAsync({});
            nav(`/chat/${convo.id}`);
          }}
          sx={{ height: 44, borderRadius: 2 }}
        >
          Cuộc trò chuyện mới
        </Button>
      </Box>

      <Box sx={{ flex: 1 }} />

      <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
        <Button
          variant="text"
          startIcon={<BookOpen size={18} />}
          sx={{ justifyContent: "flex-start", px: 1.25 }}
        >
          Tài liệu hướng dẫn
        </Button>
        <Button variant="text" sx={{ justifyContent: "flex-start", px: 1.25 }}>
          Trạng thái hệ thống
        </Button>
      </Box>
    </Box>
  );
}
