import { useState } from "react";
import { T, PALETTE, inputStyle, selectStyle } from "../../theme/tokens.js";
import { uid, fmt } from "../../utils/format.js";
import { CATEGORY_TYPES, STOCK_GROUP_TYPES } from "../../../domain/portfolio/constants.js";
import { sanitizeAsset } from "../../../domain/portfolio/assetCalculations.js";
import { normalizeYahooSymbol } from "../../../domain/pricing/yahooSymbol.js";
import Field from "../common/Field.jsx";

export default function AssetForm({ initial, onSave, onClose, usdThbRate, hasTransactions }) {
  const rate = usdThbRate;
  const blank = { name: "", type: "equity", invested: "", investedUSD: "", currentValue: "", currentValueUSD: "", currency: "THB", color: PALETTE[Math.floor(Math.random() * PALETTE.length)], notes: "", isSpeculative: false, finnomenaCode: "", units: "", yahooSymbol: "", qty: "" };
  const [form, setForm] = useState(() => {
    if (!initial) return blank;
    const isUSD = (initial.currency || "THB") === "USD";
    return {
      ...initial, invested: initial.invested ?? "", investedUSD: initial.investedUSD ?? "",
      currentValue: initial.currentValue ?? "",
      currentValueUSD: isUSD && initial.currentValue ? +((initial.currentValue / rate)).toFixed(2) : "",
      finnomenaCode: initial.finnomenaCode ?? "", units: initial.units ?? "",
      yahooSymbol: initial.yahooSymbol ?? "", qty: initial.qty ?? ""
    };
  });
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const isStockGroup = STOCK_GROUP_TYPES.has(form.type);
  const isUSD = form.currency === "USD";

  const handleSave = () => {
    if (!form.name.trim()) return alert("Please enter an asset name");

    // If hasTransactions, we preserve the original invested/units so we don't accidentally overwrite them with blanks
    let investedFinal = parseFloat(form.invested) || 0;
    let investedUSD = null;
    let unitsFinal = parseFloat(form.units) || 0;
    let qtyFinal = parseFloat(form.qty) || 0;

    if (isUSD) {
      investedFinal = +(parseFloat(form.investedUSD || 0) * rate).toFixed(2);
      investedUSD = parseFloat(form.investedUSD) || 0;
    }

    if (hasTransactions) {
      investedFinal = initial.invested;
      investedUSD = initial.investedUSD;
      unitsFinal = initial.units;
      qtyFinal = initial.qty;
    }

    const currentValueFinal = isUSD ? +(parseFloat(form.currentValueUSD || 0) * rate).toFixed(2) : parseFloat(form.currentValue) || 0;

    const payload = sanitizeAsset({
      ...form,
      id: form.id || uid(),
      invested: investedFinal,
      currentValue: currentValueFinal,
      units: unitsFinal,
      finnomenaCode: form.finnomenaCode.trim(),
      qty: qtyFinal,
      yahooSymbol: normalizeYahooSymbol(form.yahooSymbol)
    }, rate);

    onSave(payload);
  };

  return (
    <>
      <Field label="Asset Name">
        <input style={inputStyle} value={form.name} onChange={e => set("name", e.target.value)} placeholder="e.g. K-US500X-A" />
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "end" }}>
        <Field label="Category Type">
          <select style={selectStyle} value={form.type} onChange={e => set("type", e.target.value)}>
            {CATEGORY_TYPES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </Field>
        <Field label="Currency">
          <select style={{ ...selectStyle, width: 90 }} value={form.currency} onChange={e => set("currency", e.target.value)}>
            <option value="THB">฿ THB</option>
            <option value="USD">$ USD</option>
          </select>
        </Field>
      </div>
      {/* Hide cost/value fields for stock groups — computed from sub-assets */}
      {!isStockGroup && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {hasTransactions ? (
              <Field label={`Invested (${isUSD ? '$' : '฿'})`} hint="Calculated from transactions">
                <input style={{ ...inputStyle, background: 'transparent', color: T.muted }} value={isUSD ? (initial?.investedUSD || 0) : (initial?.invested || 0)} disabled />
              </Field>
            ) : isUSD ? (
              <Field label="Initial Invested ($)">
                <input style={inputStyle} type="number" value={form.investedUSD} onChange={e => set("investedUSD", e.target.value)} placeholder="0" />
              </Field>
            ) : (
              <Field label="Initial Invested (฿)">
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
        </>
      )}
      <Field label="Color">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {PALETTE.map(c => (
            <div key={c} onClick={() => set("color", c)} style={{ width: 28, height: 28, borderRadius: 6, background: c, cursor: "pointer", border: form.color === c ? `3px solid ${T.text}` : "2px solid transparent", boxSizing: "border-box" }} />
          ))}
        </div>
      </Field>
      {/* Auto price section — for all non-stock-group assets */}
      {!isStockGroup && (
        <div style={{ background: "#0a1628", border: `1px solid #1e3a5f`, borderRadius: 10, padding: "14px 14px 10px", marginBottom: 16 }}>
          <p style={{ margin: "0 0 10px", fontSize: 11, color: T.accent, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>📈 Auto Price Update (Optional)</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 8 }}>
            <Field label="Finnomena Fund Code" hint="Thai Mutual Funds">
              <input style={inputStyle} value={form.finnomenaCode} onChange={e => set("finnomenaCode", e.target.value)} placeholder="e.g. K-US500X-A" />
            </Field>
            {hasTransactions ? (
              <Field label="Units Held" hint="Calculated from txs">
                <input style={{ ...inputStyle, background: 'transparent', color: T.muted }} value={initial?.units || 0} disabled />
              </Field>
            ) : (
              <Field label="Units Held" hint="Total fund units">
                <input style={inputStyle} type="number" value={form.units} onChange={e => set("units", e.target.value)} placeholder="0" />
              </Field>
            )}
            <Field label="Yahoo Finance Symbol" hint="Stocks, Gold, Crypto">
              <input style={inputStyle} value={form.yahooSymbol} onChange={e => set("yahooSymbol", e.target.value)} placeholder="e.g. GC=F or AAPL" />
            </Field>
            {hasTransactions ? (
              <Field label="Qty / Shares" hint="Calculated from txs">
                <input style={{ ...inputStyle, background: 'transparent', color: T.muted }} value={initial?.qty || 0} disabled />
              </Field>
            ) : (
              <Field label="Qty / Shares" hint="Total asset qty">
                <input style={inputStyle} type="number" value={form.qty} onChange={e => set("qty", e.target.value)} placeholder="0" />
              </Field>
            )}
          </div>
          <p style={{ margin: "4px 0 0", fontSize: 11, color: T.dim }}>If set, <strong style={{ color: T.muted }}>Current Value</strong> will be automatically updated to reflect the real market price every 6 hours.</p>
        </div>
      )}
      <Field label="Notes / Reminders">
        <textarea style={{ ...inputStyle, minHeight: 60, resize: "vertical" }} value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="e.g. Matures Sep 2026, DCA monthly..." />
      </Field>
      <Field label="Asset Type">
        <div style={{ display: "flex", gap: 10 }}>
          {[{ v: false, label: "💼 Investment" }, { v: true, label: "⚡ Speculative" }].map(opt => (
            <div key={String(opt.v)} onClick={() => set("isSpeculative", opt.v)} style={{ flex: 1, padding: "10px 0", borderRadius: 8, textAlign: "center", cursor: "pointer", border: `1px solid ${form.isSpeculative === opt.v ? T.accent : T.border}`, background: form.isSpeculative === opt.v ? T.accentGlow : "transparent", color: form.isSpeculative === opt.v ? T.accent : T.muted, fontSize: 13, fontWeight: 600 }}>{opt.label}</div>
          ))}
        </div>
      </Field>
      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        <button onClick={onClose} style={{ flex: 1, padding: "11px 0", borderRadius: 10, border: `1px solid ${T.border}`, background: "transparent", color: T.muted, cursor: "pointer", fontSize: 14, fontFamily: "inherit" }}>Cancel</button>
        <button onClick={handleSave} style={{ flex: 2, padding: "11px 0", borderRadius: 10, border: "none", background: T.accent, color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 700, fontFamily: "inherit" }}>Save Asset</button>
      </div>
    </>
  );
}
