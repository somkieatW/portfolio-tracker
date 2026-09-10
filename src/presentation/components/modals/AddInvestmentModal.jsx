import { useState, useEffect } from "react";
import { T, inputStyle, selectStyle } from "../../theme/tokens.js";
import { fmt } from "../../utils/format.js";
import { STOCK_GROUP_TYPES } from "../../../domain/portfolio/constants.js";
import Modal from "../common/Modal.jsx";
import Field from "../common/Field.jsx";

export default function AddInvestmentModal({ asset, subAsset, initialTx, onSave, onClose, usdThbRate }) {
  const target = subAsset || asset;
  const isUSD = target.currency === "USD";
  const rate = usdThbRate;
  const isFund = !!target.finnomenaCode?.trim();
  const isStock = !!target.yahooSymbol?.trim() || STOCK_GROUP_TYPES.has(target.type) || target.type === "stock" || target.type === "us_stocks" || target.type === "thai_stocks";

  // When editing, initialTx fields might be negative (for sells).
  // We want to work with positive values in the form UI and handle negating on submit.
  const [form, setForm] = useState({
    type: initialTx?.type || "buy",
    amount: initialTx ? Math.abs(isUSD ? initialTx.amount_usd : initialTx.amount_thb) : "",
    units: initialTx ? Math.abs(initialTx.units || 0) : "",
    qty: initialTx ? Math.abs(initialTx.qty || 0) : "",
    price: initialTx?.price_per_unit || "",
    date: initialTx?.date || new Date().toISOString().split("T")[0],
    notes: initialTx?.notes || ""
  });

  // If price is missing but we have amount and units/qty, derive it for the UI
  useEffect(() => {
    if (initialTx && !initialTx.price_per_unit) {
      const amt = Math.abs(isUSD ? initialTx.amount_usd : initialTx.amount_thb);
      const uCount = Math.abs(initialTx.units || initialTx.qty || 0);
      if (amt > 0 && uCount > 0) {
        setForm(f => ({ ...f, price: +(amt / uCount).toFixed(4) }));
      }
    }
  }, [initialTx, isUSD]);

  const set = (k, v) => {
    setForm(p => {
      const next = { ...p, [k]: v };

      // Auto-calculate logic
      const a = parseFloat(k === 'amount' ? v : next.amount) || 0;
      const pr = parseFloat(k === 'price' ? v : next.price) || 0;
      const u = parseFloat(k === 'units' ? v : next.units) || 0;
      const q = parseFloat(k === 'qty' ? v : next.qty) || 0;

      if (k === 'amount' || k === 'price') {
        if (pr > 0) {
          if (isFund) next.units = +(a / pr).toFixed(4);
          else if (isStock) next.qty = +(a / pr).toFixed(4);
        }
      } else if (k === 'units' || k === 'qty') {
        if (pr > 0) {
          next.amount = +((isFund ? u : q) * pr).toFixed(2);
        }
      }
      return next;
    });
  };

  const handleSubmit = async () => {
    const amt = parseFloat(form.amount) || 0;
    if (amt <= 0 && form.type !== 'dividend') return alert("Amount must be greater than 0");

    // Construct the transaction object
    const tx = {
      ...(initialTx?.id ? { id: initialTx.id } : {}), // Keep ID if editing
      asset_id: asset.id,
      sub_asset_id: subAsset?.id || null,
      type: form.type,
      currency: target.currency || 'THB',
      date: form.date,
      price_per_unit: parseFloat(form.price) || null,
      notes: form.notes.trim() || null,
    };

    if (isUSD) {
      tx.amount_usd = form.type === 'sell' ? -amt : amt;
      tx.amount_thb = +(tx.amount_usd * rate).toFixed(2);
    } else {
      tx.amount_thb = form.type === 'sell' ? -amt : amt;
    }

    if (isFund) {
      const u = parseFloat(form.units) || 0;
      tx.units = form.type === 'sell' ? -u : u;
    } else if (isStock) {
      const q = parseFloat(form.qty) || 0;
      tx.qty = form.type === 'sell' ? -q : q;
    }

    await onSave(tx);
  };

  return (
    <Modal title={initialTx ? `Edit Transaction — ${target.name}` : `Log Transaction — ${target.name}`} onClose={onClose}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Transaction Type">
          <select style={selectStyle} value={form.type} onChange={e => set("type", e.target.value)}>
            <option value="buy">Buy / Top Up</option>
            <option value="sell">Sell / Withdraw</option>
            <option value="dividend">Dividend</option>
            <option value="fee">Fee</option>
          </select>
        </Field>
        <Field label="Date">
          <input style={inputStyle} type="date" value={form.date} onChange={e => set("date", e.target.value)} />
        </Field>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        <Field label={`Amount (${isUSD ? '$' : '฿'})`}>
          <input style={inputStyle} type="number" step="0.01" value={form.amount} onChange={e => set("amount", e.target.value)} placeholder="0.00" autoFocus />
        </Field>
        <Field label={isFund ? "NAV (Price)" : "Price per Share"}>
          <input style={inputStyle} type="number" step="0.0001" value={form.price} onChange={e => set("price", e.target.value)} placeholder="0.0000" />
        </Field>
        {isFund && (
          <Field label="Units">
            <input style={inputStyle} type="number" step="0.0001" value={form.units} onChange={e => set("units", e.target.value)} placeholder="0.0000" />
          </Field>
        )}
        {isStock && (
          <Field label="Shares">
            <input style={inputStyle} type="number" step="0.0001" value={form.qty} onChange={e => set("qty", e.target.value)} placeholder="0" />
          </Field>
        )}
      </div>

      {isUSD && parseFloat(form.amount) > 0 && (
        <p style={{ margin: "-8px 0 12px", fontSize: 11, color: T.dim }}>
          Recorded as ≈ ฿{fmt(parseFloat(form.amount) * rate, 2)} at rate ฿{fmt(rate, 2)}/$
        </p>
      )}

      <Field label="Notes (Optional)">
        <input style={inputStyle} value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="e.g. Monthly DCA" />
      </Field>

      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <button onClick={onClose} style={{ flex: 1, padding: "11px 0", borderRadius: 10, border: `1px solid ${T.border}`, background: "transparent", color: T.muted, cursor: "pointer", fontSize: 14, fontFamily: "inherit" }}>Cancel</button>
        <button onClick={handleSubmit} style={{ flex: 2, padding: "11px 0", borderRadius: 10, border: "none", background: T.accent, color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 700, fontFamily: "inherit" }}>{initialTx ? "Save Changes" : "Save Transaction"}</button>
      </div>
    </Modal>
  );
}
