import { T } from "../../theme/tokens.js";

export default function SaveBadge({ status }) {
  const cfg = {
    saving: { color: T.yellow, icon: "⏳", text: "Saving…" },
    saved: { color: T.green, icon: "✓", text: "Saved" },
    error: { color: T.red, icon: "✕", text: "Error" },
    offline: { color: T.muted, icon: "○", text: "Offline" },
  }[status] || null;
  if (!cfg) return null;
  return (
    <span style={{ fontSize: 11, color: cfg.color, display: "flex", alignItems: "center", gap: 4 }}>
      {cfg.icon} {cfg.text}
    </span>
  );
}
