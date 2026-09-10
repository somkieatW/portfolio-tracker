import { CHART_PALETTE } from "../../domain/portfolio/constants.js";

export const T = {
  bg: "#080c14", surface: "#0e1420", card: "#131b2e", cardHover: "#1a2440",
  border: "#1e2d4a", borderLight: "#243558", text: "#e8edf5", muted: "#5a7090",
  dim: "#3a5070", accent: "#3b82f6", accentGlow: "#3b82f620",
  green: "#22c55e", red: "#ef4444", yellow: "#eab308",
  orange: "#f97316", purple: "#a855f7", cyan: "#06b6d4", pink: "#ec4899",
};

export const PALETTE = CHART_PALETTE;

export const inputStyle = { width: "100%", boxSizing: "border-box", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, fontSize: 16, padding: "10px 12px", fontFamily: "inherit", outline: "none" };
export const selectStyle = { ...inputStyle, cursor: "pointer" };
