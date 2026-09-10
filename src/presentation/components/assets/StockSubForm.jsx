import { useState } from "react";
import { T, inputStyle } from "../../theme/tokens.js";
import { uid, fmt } from "../../utils/format.js";
import { sanitizeAsset } from "../../../domain/portfolio/assetCalculations.js";
import { normalizeYahooSymbol } from "../../../domain/pricing/yahooSymbol.js";
import Field from "../common/Field.jsx";

export default function StockSubForm({ initial, onSave, onClose, usdThbRate, hasTransactions }) {
  const blank = { name: "", invested: "", investedUSD: "", currentValue: "", currentValueUSD: "", notes: "", yahooSymbol: "", qty: "", currency: "THB" };
  const rate = usdThbRate;
  const [form, setForm] = useState(() => {
    if (!initial) return blank;
    const isUSD = (initial.currency ?? "THB") === "USD";
    return {
      ...initial,
      invested: initial.invested ?? "",
      investedUSD: initial.investedUSD ?? "",
      currentValue: initial.currentValue ?? "",
      // Back-calculate USD display from stored THB value
      currentValueUSD: isUSD && initial.currentValue ? +((initial.currentValue / rate)).toFixed(2) : "",
      yahooSymbol: initial.yahooSymbol ?? "",
      qty: initial.qty ?? "",
      currency: initial.currency ?? "THB",
    };
  });
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const isUSD = form.currency === "USD";

  // Always work in THB internally for P&L
  const investedThb = isUSD ? (parseFloat(form.investedUSD || 0) * rate) : parseFloat(form.invested || 0);
  const currentThb = isUSD ? (parseFloat(form.currentValueUSD || 0) * rate) : parseFloat(form.currentValue || 0);
  const pl = currentThb - investedThb;
  const plPct = investedThb > 0 ? (pl / investedThb) * 100 : 0;

  const handleSave = () => {
    if (!form.name.trim()) return alert("Please enter a stock name.");
    let investedFinal = parseFloat(form.invested) || 0;
    let investedUSD = null;
    let qtyFinal = parseFloat(form.qty) || 0;

    if (isUSD) {
      investedFinal = +(parseFloat(form.investedUSD || 0) * rate).toFixed(2);
      investedUSD = parseFloat(form.investedUSD) || 0;
    }

    if (hasTransactions) {
      investedFinal = initial.invested;
      investedUSD = initial.investedUSD;
      qtyFinal = initial.qty;
    }

    const currentValueFinal = isUSD ? +(parseFloat(form.currentValueUSD || 0) * rate).toFixed(2) : parseFloat(form.currentValue) || 0;

    const payload = sanitizeAsset({
      ...form,
      id: form.id || uid(),
      invested: investedFinal,
      currentValue: currentValueFinal,
      qty: qtyFinal,
      yahooSymbol: normalizeYahooSymbol(form.yahooSymbol)
    }, rate);

    onSave(payload);
  };
  return (
    <>
      <Field label="Stock Name / Ticker">
        <input style={inputStyle} value={form.name} onChange={e => set("name", e.target.value)} placeholder="e.g. PTT, MSFT" autoFocus />
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {hasTransactions ? (
          <Field label={`Invested (${isUSD ? '$' : '฿'})`} hint="Calculated from transactions">
            <input style={{ ...inputStyle, background: 'transparent', color: T.muted }} value={isUSD ? (initial?.investedUSD || 0) : (initial?.invested || 0)} disabled />
          </Field>
        ) : isUSD ? (
          <Field label="Invested ($)" hint="Total cost in USD">
            <input style={inputStyle} type="number" value={form.investedUSD} onChange={e => set("investedUSD", e.target.value)} placeholder="0" />
          </Field>
        ) : (
          <Field label="Invested (฿)" hint="Total cost basis">
            <input style={inputStyle} type="number" value={form.invested} onChange={e => set("invested", e.target.value)} placeholder="0" />
          </Field>
        )}
        {isUSD ? (
          <Field label="Current Value ($)">
            <input style={inputStyle} type="number" value={form.currentValueUSD} onChange={e => set("currentValueUSD", e.target.value)} placeholder="0" />
          </Field>
        ) : (
          <Field label="Current Value (฿)">
            <input style={inputStyle} type="number" value={form.currentValue} onChange={e => set("currentValue", e.target.value)} placeholder="0" />
          </Field>
        )}
      </div>
      {isUSD && (parseFloat(form.investedUSD) > 0 || parseFloat(form.currentValueUSD) > 0) && (
        <p style={{ margin: "-8px 0 12px", fontSize: 11, color: T.dim }}>
          {parseFloat(form.investedUSD) > 0 && <>Cost ฿{fmt(parseFloat(form.investedUSD) * rate, 2)}</>}
          {parseFloat(form.investedUSD) > 0 && parseFloat(form.currentValueUSD) > 0 && <span style={{ color: T.border }}> · </span>}
          {parseFloat(form.currentValueUSD) > 0 && <>Value ฿{fmt(parseFloat(form.currentValueUSD) * rate, 2)}</>}
          <span style={{ color: T.dim }}> &nbsp;·&nbsp; rate ฿{fmt(rate, 2)}/$</span>
        </p>
      )}
      {investedThb > 0 && (
        <div style={{ background: T.surface, borderRadius: 8, padding: "10px 14px", marginBottom: 14 }}>
          <p style={{ margin: 0, fontSize: 12, color: pl >= 0 ? T.green : T.red, fontWeight: 700 }}>
            Preview: {pl >= 0 ? "+" : ""}{plPct.toFixed(2)}% &nbsp;
            <span style={{ fontWeight: 400, color: T.muted }}>(฿{fmt(Math.abs(pl), 0)})</span>
          </p>
        </div>
      )}
      <Field label="Notes">
        <input style={inputStyle} value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="e.g. 8 shares @ ฿35.81" />
      </Field>

      {/* ── Auto price section ── */}
      <div style={{ background: "#0a1628", border: `1px solid #1e3a5f`, borderRadius: 10, padding: "12px 14px 10px", marginBottom: 16 }}>
        <p style={{ margin: "0 0 8px", fontSize: 11, color: T.accent, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>📈 Auto Price Update (Optional)</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 90px", gap: 10 }}>
          {hasTransactions ? (
            <Field label="Qty / Shares" hint="Calculated from transactions">
              <input style={{ ...inputStyle, background: 'transparent', color: T.muted }} value={initial?.qty || 0} disabled />
            </Field>
          ) : (
            <Field label="Qty / Shares" hint="Number of shares held">
              <input style={inputStyle} type="number" value={form.qty} onChange={e => set("qty", e.target.value)} placeholder="0" />
            </Field>
          )}
          <Field label="Stock Symbol" hint="e.g. PTT.BK or LRCX">
            <input style={inputStyle} value={form.yahooSymbol} onChange={e => set("yahooSymbol", e.target.value)} placeholder="e.g. PTT.BK" />
          </Field>
          <Field label="Currency">
            <select style={{ ...inputStyle, cursor: "pointer" }} value={form.currency} onChange={e => set("currency", e.target.value)}>
              <option value="THB">THB ฿</option>
              <option value="USD">USD $</option>
            </select>
          </Field>
        </div>
        <p style={{ margin: "4px 0 0", fontSize: 11, color: T.dim }}>If set, <strong style={{ color: T.muted }}>Current Value</strong> will be automatically updated to reflect the real market price every 6 hours.</p>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
        <button onClick={onClose} style={{ flex: 1, padding: "11px 0", borderRadius: 10, border: `1px solid ${T.border}`, background: "transparent", color: T.muted, cursor: "pointer", fontFamily: "inherit", fontSize: 14 }}>Cancel</button>
        <button onClick={handleSave} style={{ flex: 2, padding: "11px 0", borderRadius: 10, border: "none", background: T.accent, color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 700, fontFamily: "inherit" }}>Save Stock</button>
      </div>
    </>
  );
}
