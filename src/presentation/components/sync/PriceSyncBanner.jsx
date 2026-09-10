import { T } from "../../theme/tokens.js";
import { formatPriceAge } from "../../../domain/portfolio/performance.js";

export default function PriceSyncBanner({ cacheInfo, lastSnapshot, refreshing, onRefresh }) {
  const priceAge = cacheInfo?.updatedAt ? formatPriceAge(cacheInfo.updatedAt) : { label: "unknown", stale: true };
  const staleCount = cacheInfo?.staleSymbols?.length ?? 0;
  const snapLabel = lastSnapshot?.snapshot_date ?? "none yet";
  const borderColor = priceAge.stale || staleCount > 0 ? T.orange : T.border;

  return (
    <div style={{ background: T.card, border: `1px solid ${borderColor}`, borderRadius: 12, padding: "12px 14px", marginBottom: 16, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ flex: 1, minWidth: 200 }}>
        <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 700, color: T.text }}>Data sync</p>
        <p style={{ margin: 0, fontSize: 11, color: T.muted, lineHeight: 1.5 }}>
          Prices: <span style={{ color: priceAge.stale ? T.orange : T.green }}>{priceAge.label}</span>
          {staleCount > 0 && <span style={{ color: T.orange }}> · {staleCount} stale</span>}
          <br />
          Snapshots: <span style={{ color: T.text }}>{snapLabel}</span>
        </p>
      </div>
      <button
        onClick={onRefresh}
        disabled={refreshing}
        style={{
          padding: "9px 14px", borderRadius: 8, border: `1px solid ${T.accent}55`,
          background: T.accentGlow, color: T.accent, cursor: refreshing ? "wait" : "pointer",
          fontSize: 12, fontWeight: 700, fontFamily: "inherit", opacity: refreshing ? 0.7 : 1,
        }}
      >
        {refreshing ? "Refreshing…" : "↻ Refresh prices"}
      </button>
    </div>
  );
}
