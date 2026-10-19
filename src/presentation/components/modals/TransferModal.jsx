import { useState } from "react";
import { T, inputStyle, selectStyle } from "../../theme/tokens.js";
import { fmt } from "../../utils/format.js";
import { isFundAsset, isStockAsset } from "../../../domain/portfolio/assetCalculations.js";
import { STOCK_GROUP_TYPES } from "../../../domain/portfolio/constants.js";
import Modal from "../common/Modal.jsx";
import Field from "../common/Field.jsx";

function canTransfer(asset) {
  if (STOCK_GROUP_TYPES.has(asset.type)) return false;
  if (isFundAsset(asset) || isStockAsset(asset)) return false;
  return true;
}

export default function TransferModal({ assets, onTransfer, onClose, usdThbRate }) {
  const eligible = (assets || []).filter(canTransfer);
  const [fromId, setFromId] = useState(eligible[0]?.id || "");
  const [toId, setToId] = useState(eligible[1]?.id || eligible[0]?.id || "");
  const [amount, setAmount] = useState("");
  const [fee, setFee] = useState("0");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");

  const from = eligible.find(a => a.id === fromId);
  const to = eligible.find(a => a.id === toId);
  const isUSD = from?.currency === "USD";
  const amt = parseFloat(amount) || 0;
  const feeAmt = Math.max(0, parseFloat(fee) || 0);

  const handleSubmit = async () => {
    if (!from || !to) return alert("Select source and destination assets");
    if (from.id === to.id) return alert("Choose two different assets");
    if (from.currency !== to.currency) return alert("Transfers must use the same currency (both THB or both USD)");
    if (amt <= 0) return alert("Amount must be greater than 0");
    if (feeAmt < 0) return alert("Fee cannot be negative");

    await onTransfer({
      fromAssetId: from.id,
      toAssetId: to.id,
      amount: amt,
      fee: feeAmt,
      date,
      notes: notes.trim() || null,
    });
  };

  return (
    <Modal title="Transfer between assets" onClose={onClose}>
      {eligible.length < 2 ? (
        <p style={{ fontSize: 13, color: T.muted, margin: 0 }}>
          Add at least two cash-style assets (e.g. savings, forex, crypto) to transfer between them. Funds and stocks are not supported here — log a sell and buy instead.
        </p>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="From">
              <select style={selectStyle} value={fromId} onChange={e => setFromId(e.target.value)}>
                {eligible.map(a => (
                  <option key={a.id} value={a.id}>{a.name} ({a.currency === "USD" ? "$" : "฿"}{fmt(a.currentValue)})</option>
                ))}
              </select>
            </Field>
            <Field label="To">
              <select style={selectStyle} value={toId} onChange={e => setToId(e.target.value)}>
                {eligible.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </Field>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <Field label={`Amount received (${isUSD ? "$" : "฿"})`}>
              <input style={inputStyle} type="number" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" autoFocus />
            </Field>
            <Field label={`Transfer fee (${isUSD ? "$" : "฿"})`} hint="Optional — deducted from source">
              <input style={inputStyle} type="number" step="0.01" min="0" value={fee} onChange={e => setFee(e.target.value)} placeholder="0" />
            </Field>
            <Field label="Date">
              <input style={inputStyle} type="date" value={date} onChange={e => setDate(e.target.value)} />
            </Field>
          </div>

          {from && amt > 0 && (
            <p style={{ margin: "0 0 12px", fontSize: 11, color: T.dim }}>
              Source leaves: {isUSD ? "$" : "฿"}{fmt(amt + feeAmt, 2)}
              {feeAmt > 0 ? ` (includes ฿${fmt(feeAmt, 2)} fee)` : ""}
              {isUSD && ` · ≈ ฿${fmt((amt + feeAmt) * usdThbRate, 2)}`}
            </p>
          )}

          <Field label="Notes (optional)">
            <input style={inputStyle} value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Move profit to core savings" />
          </Field>

          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: "11px 0", borderRadius: 10, border: `1px solid ${T.border}`, background: "transparent", color: T.muted, cursor: "pointer", fontSize: 14, fontFamily: "inherit" }}>Cancel</button>
            <button type="button" onClick={handleSubmit} style={{ flex: 2, padding: "11px 0", borderRadius: 10, border: "none", background: T.accent, color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 700, fontFamily: "inherit" }}>Transfer</button>
          </div>
        </>
      )}
    </Modal>
  );
}
