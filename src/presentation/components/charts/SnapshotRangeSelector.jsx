import { T } from "../../theme/tokens.js";
import { SNAPSHOT_RANGES } from "../../../domain/portfolio/snapshotSeries.js";

export default function SnapshotRangeSelector({ snapshotRange, setSnapshotRange }) {
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
      {SNAPSHOT_RANGES.map(r => (
        <button
          key={r.label}
          onClick={() => setSnapshotRange(r.days)}
          style={{
            flex: 1, padding: "8px 0", borderRadius: 8,
            border: `1px solid ${snapshotRange === r.days ? T.accent : T.border}`,
            background: snapshotRange === r.days ? T.accentGlow : "transparent",
            color: snapshotRange === r.days ? T.accent : T.muted,
            cursor: "pointer", fontFamily: "inherit", fontSize: 12,
            fontWeight: snapshotRange === r.days ? 700 : 400,
          }}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}
