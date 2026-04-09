import { Box } from "@mui/material";

import SideNav from "@/components/SideNav";
import ToastHost from "@/components/ToastHost";
import TopBar from "@/components/TopBar";

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <Box
      sx={{
        display: "flex",
        minHeight: "100vh",
        bgcolor: "background.default",
      }}
    >
      <SideNav />
      <Box
        sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}
      >
        <TopBar />
        <Box sx={{ flex: 1, p: 2 }}>{children}</Box>
      </Box>
      <ToastHost />
    </Box>
  );
}
