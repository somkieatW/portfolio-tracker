import { useState } from "react";
import { T, inputStyle } from "../../theme/tokens.js";
import { fmt } from "../../utils/format.js";
import Modal from "../common/Modal.jsx";
import Field from "../common/Field.jsx";

// UpdateValueModal: if asset.currency === 'USD', input in $ and convert to THB on save
export default function UpdateValueModal({ asset, onSave, onClose, usdThbRate }) {
  const isUSD = asset.currency === "USD";
  const rate = usdThbRate;
  const initVal = isUSD && asset.currentValue ? +((asset.currentValue / rate)).toFixed(2) : asset.currentValue;
  const [val, setVal] = useState(initVal);
  const currentThb = isUSD ? parseFloat(val || 0) * rate : parseFloat(val || 0);
  const pl = currentThb - asset.invested;
  const plPct = asset.invested > 0 ? (pl / asset.invested) * 100 : 0;
  return (
    <Modal title={`Update — ${asset.name}`} onClose={onClose}>
      <Field label={isUSD ? "Current Market Value ($)" : "Current Market Value (฿)"} hint={isUSD ? `Will be stored as ฿${fmt(parseFloat(val || 0) * rate, 2)} at rate ฿${fmt(rate, 2)}/$` : "Enter today's latest value"}>
        <input style={inputStyle} type="number" value={val} onChange={e => setVal(e.target.value)} autoFocus />
      </Field>
      {asset.invested > 0 && (
        <div style={{ background: T.surface, borderRadius: 10, padding: "12px 16px", marginBottom: 16 }}>
          <p style={{ margin: "0 0 4px", fontSize: 12, color: T.muted }}>Preview P&L</p>
          <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: pl >= 0 ? T.green : T.red }}>
            {pl >= 0 ? "+" : ""}{plPct.toFixed(2)}% &nbsp;
            <span style={{ fontSize: 14 }}>(฿{fmt(Math.abs(pl), 0)})</span>
          </p>
        </div>
      )}
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={onClose} style={{ flex: 1, padding: "11px 0", borderRadius: 10, border: `1px solid ${T.border}`, background: "transparent", color: T.muted, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
        <button onClick={() => onSave(isUSD ? +(parseFloat(val || 0) * rate).toFixed(2) : parseFloat(val) || 0)} style={{ flex: 2, padding: "11px 0", borderRadius: 10, border: "none", background: T.green, color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 700, fontFamily: "inherit" }}>Update Value</button>
      </div>
    </Modal>
  );
}
