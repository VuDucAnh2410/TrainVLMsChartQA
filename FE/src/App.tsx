import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { Box, Skeleton } from "@mui/material";

import AppShell from "@/components/AppShell";

const Chatbox = lazy(() => import("@/pages/Chatbox"));
const ChartsList = lazy(() => import("@/pages/ChartsList"));
const Settings = lazy(() => import("@/pages/Settings"));

function RouteFallback() {
  return (
    <Box sx={{ display: "grid", gap: 1.5 }}>
      <Skeleton variant="rounded" height={56} />
      <Skeleton variant="rounded" height={420} />
      <Skeleton variant="rounded" height={280} />
    </Box>
  );
}

export default function App() {
  return (
    <AppShell>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<Navigate to="/chat" replace />} />

          <Route path="/chat" element={<Chatbox service="qwen" />} />
          <Route path="/chat/:chatId" element={<Chatbox service="qwen" />} />

          <Route path="/charts" element={<ChartsList service="qwen" />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/chat" replace />} />
        </Routes>
      </Suspense>
    </AppShell>
  );
}
