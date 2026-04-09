import { Avatar, Box, Button, IconButton, Typography } from "@mui/material";
import { Bell, HelpCircle } from "lucide-react";
import { useLocation } from "react-router-dom";

const titleByPath = (pathname: string) => {
  if (pathname.startsWith("/chat")) return "Chatbox";
  if (pathname.startsWith("/charts")) return "Kho trò chuyện";
  if (pathname.startsWith("/settings")) return "Cài đặt";
  return "CIA Assistant";
};

export default function TopBar() {
  const loc = useLocation();
  const title = titleByPath(loc.pathname);

  return (
    <Box
      sx={{
        height: 56,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        px: 2,
        borderBottom: "1px solid",
        borderColor: "divider",
        bgcolor: "background.default",
      }}
    >
      <Typography sx={{ fontWeight: 700, color: "text.primary" }}>
        {title}
      </Typography>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Button size="small" variant="outlined" sx={{ borderRadius: 2 }}>
          Chọn khóa học
        </Button>
        <IconButton size="small">
          <Bell size={18} />
        </IconButton>
        <IconButton size="small">
          <HelpCircle size={18} />
        </IconButton>
        <Avatar sx={{ width: 28, height: 28, bgcolor: "primary.main" }}>
          A
        </Avatar>
      </Box>
    </Box>
  );
}
