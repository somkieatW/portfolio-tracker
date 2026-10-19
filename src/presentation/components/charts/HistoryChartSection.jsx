import { T } from "../../theme/tokens.js";

/**
 * Keeps chart layout mounted while snapshot range reloads; dims content and shows a light overlay.
 */
export default function HistoryChartSection({ loading, hasData, emptyState, children }) {
  if (!hasData) {
    if (loading) {
      return (
        <div style={{ textAlign: "center", padding: 40, color: T.muted, fontSize: 13 }}>
          Loading history…
        </div>
      );
    }
    return emptyState;
  }

  return (
    <div style={{ position: "relative" }}>
      {loading && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 2,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            paddingTop: 24,
            background: "rgba(8, 12, 24, 0.35)",
            borderRadius: 14,
            pointerEvents: "none",
          }}
        >
          <span style={{ fontSize: 11, color: T.muted, letterSpacing: 0.3 }}>Updating range…</span>
        </div>
      )}
      <div style={{ opacity: loading ? 0.5 : 1, transition: "opacity 0.2s ease" }}>
        {children}
      </div>
    </div>
  );
}
