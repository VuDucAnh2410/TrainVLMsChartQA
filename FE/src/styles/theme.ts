import { createTheme } from "@mui/material/styles";

import { colors, radii, shadows } from "./tokens";

export const theme = createTheme({
  palette: {
    mode: "light",
    primary: { main: colors.primary },
    success: { main: colors.success },
    warning: { main: colors.warning },
    error: { main: colors.danger },
    background: { default: colors.background, paper: colors.surface },
    text: { primary: colors.textPrimary, secondary: colors.textSecondary },
    divider: colors.border,
  },
  shape: { borderRadius: radii.button },
  typography: {
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial",
    h1: { fontSize: 22, fontWeight: 600 },
    h2: { fontSize: 18, fontWeight: 600 },
    body1: { fontSize: 15 },
    body2: { fontSize: 14 },
    caption: { fontSize: 12 },
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: radii.card,
          boxShadow: shadows.card,
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: radii.button,
          textTransform: "none",
          fontWeight: 600,
        },
        containedPrimary: {
          boxShadow: "none",
          ":hover": {
            boxShadow: "none",
            backgroundColor: colors.primaryHover,
          },
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: radii.button,
        },
      },
    },
  },
});
