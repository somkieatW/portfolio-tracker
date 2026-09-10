import { T } from "../../theme/tokens.js";
import { fmt } from "../../utils/format.js";

export function CustomTip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: "10px 14px" }}>
      <p style={{ color: d.color || T.accent, fontWeight: 700, margin: "0 0 2px", fontSize: 13 }}>{d.name}</p>
      <p style={{ color: T.text, margin: 0, fontSize: 13 }}>฿{fmt(d.value)}</p>
      {d.pct && <p style={{ color: T.muted, margin: 0, fontSize: 11 }}>{d.pct}%</p>}
    </div>
  );
}

export function PnLTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const val = payload[0].value;
  const color = val >= 0 ? T.green : T.red;
  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: "10px 14px", fontSize: 12 }}>
      <p style={{ margin: "0 0 4px", color: T.muted }}>{payload[0].payload.date}</p>
      <p style={{ margin: 0, fontWeight: 700, color }}>
        {val >= 0 ? "+" : "-"}฿{fmt(Math.abs(val))}
      </p>
      <p style={{ margin: 0, fontSize: 10, color: T.dim }}>Daily Change</p>
    </div>
  );
}

export function OhlcTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const isUp = d.close >= d.open;
  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, padding: "10px", borderRadius: 8, fontSize: 11 }}>
      <p style={{ margin: "0 0 6px", fontWeight: 700, color: T.muted }}>{d.date}</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 12px" }}>
        <span>Open:</span> <span style={{ textAlign: "right", fontWeight: 600 }}>฿{fmt(d.open)}</span>
        <span>High:</span> <span style={{ textAlign: "right", fontWeight: 600 }}>฿{fmt(d.high)}</span>
        <span>Low:</span> <span style={{ textAlign: "right", fontWeight: 600 }}>฿{fmt(d.low)}</span>
        <span>Close:</span> <span style={{ textAlign: "right", fontWeight: 700, color: isUp ? T.green : T.red }}>฿{fmt(d.close)}</span>
      </div>
    </div>
  );
}
