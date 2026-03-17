import { useState, useEffect, useCallback, useRef } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, BarChart, Bar, ComposedChart, Line } from "recharts";
import { loadPortfolio, savePortfolio, getDeviceId, supabase, getPriceCache, isCacheStale, getTransactions, addTransaction, updateTransaction, deleteTransaction, getPortfolioSnapshots } from "./supabase.js";
import Auth from "./Auth.jsx";
import AIChat from "./AIChat.jsx";
import { fetchCurrentNAV } from "./finnomenaService.js";
import { fetchStockPrice, fetchUSDTHBRate } from "./yahooFinanceService.js";

// ─── THEME ────────────────────────────────────────────────────────────────────
const T = {
  bg: "#080c14", surface: "#0e1420", card: "#131b2e", cardHover: "#1a2440",
  border: "#1e2d4a", borderLight: "#243558", text: "#e8edf5", muted: "#5a7090",
  dim: "#3a5070", accent: "#3b82f6", accentGlow: "#3b82f620",
  green: "#22c55e", red: "#ef4444", yellow: "#eab308",
  orange: "#f97316", purple: "#a855f7", cyan: "#06b6d4", pink: "#ec4899",
};

const PALETTE = [
  "#3b82f6", "#22c55e", "#eab308", "#f97316", "#a855f7",
  "#06b6d4", "#ec4899", "#14b8a6", "#f59e0b", "#8b5cf6",
  "#10b981", "#ef4444", "#6366f1", "#84cc16", "#fb923c",
];

const CATEGORY_TYPES = [
  { value: "equity", label: "Equity / Stock Fund" },
  { value: "index", label: "Index Fund" },
  { value: "bond", label: "Bond / Fixed Income" },
  { value: "gold", label: "Gold / Commodity" },
  { value: "stock", label: "Individual Stock" },
  { value: "thai_stocks", label: "Thai Individual Stocks" },
  { value: "us_stocks", label: "US Individual Stocks" },
  { value: "forex", label: "Forex / Speculation" },
  { value: "crypto", label: "Crypto" },
  { value: "cash", label: "Cash / Savings" },
  { value: "property", label: "Property / REIT" },
  { value: "other", label: "Other" },
];

// Stock group types — these act as containers for sub-assets
const STOCK_GROUP_TYPES = new Set(["thai_stocks", "us_stocks"]);

const DEFAULT_ASSETS = [];

const DEFAULT_SETTINGS = { dca: 1000, specCap: 10 };

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2, 9);
const fmt = (n, d = 2) => Number(n).toLocaleString("en", { minimumFractionDigits: d, maximumFractionDigits: d });
function calcPL(a) {
  if (a.isSpeculative || a.invested === 0) return { pl: a.currentValue - a.invested, plPct: 0 };
  const pl = a.currentValue - a.invested;
  const plPct = (pl / a.invested) * 100;
  return { pl, plPct };
}

// For stock groups, compute invested/currentValue from sub-assets
function groupTotals(asset) {
  const subs = asset.subAssets || [];
  return {
    invested: subs.reduce((s, x) => s + (x.invested || 0), 0),
    currentValue: subs.reduce((s, x) => s + (x.currentValue || 0), 0),
  };
}

// Format a cache timestamp as "YYYY-MM-DD HH:mm"
const fmtTs = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0') + ' ' +
    String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
};

// Returns a flat view of assets with group totals computed (for charts/sums)
function normalizeAssets(assets) {
  return assets.map(a => {
    if (!STOCK_GROUP_TYPES.has(a.type)) return a;
    const { invested, currentValue } = groupTotals(a);
    return { ...a, invested, currentValue };
  });
}

// Computes derived totals proportionally reducing invested capital based on units sold
function calcDerivedTotals(txs, isUSD) {
  const sorted = [...txs].sort((a, b) => {
    // 1. Primary order by explicitly configured Date
    const dateDiff = new Date(a.date) - new Date(b.date);
    if (dateDiff !== 0) return dateDiff;

    // 2. If on the same Date, [System Backfill] MUST be processed before anything else 
    const aIsBackfill = a.notes?.includes('[System Backfill]');
    const bIsBackfill = b.notes?.includes('[System Backfill]');
    if (aIsBackfill && !bIsBackfill) return -1;
    if (!aIsBackfill && bIsBackfill) return 1;

    // 3. If on the same date, Buys generally process before Sells 
    // to prevent math crashing into 0 baseline counts during sequential loops
    if (a.type === 'buy' && b.type === 'sell') return -1;
    if (a.type === 'sell' && b.type === 'buy') return 1;

    // 4. Fallback to native Creation timestamp
    return new Date(a.created_at) - new Date(b.created_at);
  });

  let invThb = 0;
  let invUsd = isUSD ? 0 : null;
  let totalUnits = 0;
  let totalQty = 0;

  for (const t of sorted) {
    if (t.type === 'buy') {
      invThb += Number(t.amount_thb || 0);
      if (isUSD) invUsd += Number(t.amount_usd || 0);
      totalUnits += Number(t.units || 0);
      totalQty += Number(t.qty || 0);
    } else if (t.type === 'sell') {
      const sellUnits = Math.abs(Number(t.units || 0));
      const sellQty = Math.abs(Number(t.qty || 0));

      if (totalUnits > 0 && sellUnits > 0) {
        const ratio = sellUnits / totalUnits;
        invThb -= invThb * ratio;
        totalUnits -= sellUnits;
      } else if (totalQty > 0 && sellQty > 0) {
        // Average cost for stocks/gold
        const ratio = sellQty / totalQty;
        invThb -= invThb * ratio;
        if (isUSD) invUsd -= invUsd * ratio;
        totalQty -= sellQty;
      } else {
        // Pure cash withdrawal
        invThb -= Math.abs(Number(t.amount_thb || 0));
        if (isUSD) invUsd -= Math.abs(Number(t.amount_usd || 0));
      }
    }
  }
  return { invThb, invUsd, totalUnits, totalQty };
}


// Helper to clean up asset data objects
function sanitizeAsset(a, rate) {
  const isUSD = a.currency === "USD";
  const isStockGroup = STOCK_GROUP_TYPES.has(a.type);
  const isFund = !!a.finnomenaCode?.trim() || a.units > 0;
  const isStock = !!a.yahooSymbol?.trim() || a.qty > 0;

  const clean = { ...a };

  // 1. Force numeric values
  if (clean.invested !== undefined) clean.invested = Number(Number(clean.invested).toFixed(2));
  if (clean.currentValue !== undefined) clean.currentValue = Number(Number(clean.currentValue).toFixed(2));

  if (isUSD) {
    if (clean.investedUSD !== undefined) clean.investedUSD = Number(Number(clean.investedUSD).toFixed(2));
    if (clean.currentValueUSD !== undefined) {
      clean.currentValueUSD = Number(Number(clean.currentValueUSD).toFixed(2));
    } else if (clean.currentValue) {
      clean.currentValueUSD = Number((clean.currentValue / rate).toFixed(2));
    }
  } else {
    // 2. Remove USD fields for THB assets
    delete clean.investedUSD;
    delete clean.currentValueUSD;
  }

  // 3. Remove irrelevant unit/qty fields
  if (isFund) {
    if (clean.units !== undefined) clean.units = Number(Number(clean.units).toFixed(8));
    delete clean.qty;
  } else if (isStock || isStockGroup) {
    if (clean.qty !== undefined) clean.qty = Number(Number(clean.qty).toFixed(8));
    delete clean.units;
  } else {
    delete clean.units;
    delete clean.qty;
  }

  // 4. Recurse for sub-stocks
  if (clean.subAssets?.length > 0) {
    clean.subAssets = clean.subAssets.map(sub => sanitizeAsset(sub, rate));
  }

  return clean;
}

// ─── SAVE INDICATOR ───────────────────────────────────────────────────────────
function SaveBadge({ status }) {
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

// ─── MODAL ────────────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }) {
  useEffect(() => {
    // Lock body scroll when modal is open to prevent background scrolling behind the keyboard
    const originalStyle = window.getComputedStyle(document.body).overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = originalStyle; };
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, width: "100%", maxWidth: 480, maxHeight: "calc(100svh - 32px)", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 24px 0", flexShrink: 0 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: T.text }}>{title}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: T.muted, cursor: "pointer", fontSize: 22, lineHeight: 1, padding: 4 }}>×</button>
        </div>
        <div style={{ padding: 24, overflowY: "auto", flex: 1, minHeight: 0 }}>{children}</div>
      </div>
    </div>
  );
}

// ─── FIELD ────────────────────────────────────────────────────────────────────
function Field({ label, hint, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", fontSize: 11, color: T.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>{label}</label>
      {children}
      {hint && <p style={{ margin: "4px 0 0", fontSize: 11, color: T.dim }}>{hint}</p>}
    </div>
  );
}

const inputStyle = { width: "100%", boxSizing: "border-box", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, fontSize: 16, padding: "10px 12px", fontFamily: "inherit", outline: "none" };
const selectStyle = { ...inputStyle, cursor: "pointer" };

// ─── ASSET FORM ───────────────────────────────────────────────────────────────
function AssetForm({ initial, onSave, onClose, usdThbRate, hasTransactions }) {
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
      yahooSymbol: form.yahooSymbol.trim()
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

// ─── ADD INVESTMENT MODAL ──────────────────────────────────────────────────
// ─── ADD INVESTMENT MODAL ──────────────────────────────────────────────────
function AddInvestmentModal({ asset, subAsset, initialTx, onSave, onClose, usdThbRate }) {
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

// ─── TRANSACTION HISTORY MODAL ───────────────────────────────────────────────
// ─── TRANSACTION HISTORY MODAL ───────────────────────────────────────────────
function TransactionHistory({ asset, subAsset, transactions, onDelete, onEdit, onClose, isUSD, snapshots }) {
  const name = subAsset ? subAsset.name : asset.name;
  const targetId = subAsset ? subAsset.id : asset.id;

  // Extract snapshot data for this specific asset
  const chartData = (snapshots || []).map(snap => {
    // Find the specific asset in the snapshot's breakdown
    const assetData = (snap.asset_breakdown || []).find(a => a.id === targetId);
    return {
      date: snap.snapshot_date,
      value: assetData ? assetData.currentValue : 0,
      invested: assetData ? assetData.invested : 0,
    };
  }).filter(d => d.value > 0 || d.invested > 0); // Hide days before asset existed

  return (
    <Modal title={`History — ${name}`} onClose={onClose}>
      {chartData.length > 0 ? (
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: "16px 8px", marginBottom: 16 }}>
          <p style={{ margin: "0 0 12px 8px", fontSize: 11, color: T.muted, textTransform: "uppercase", letterSpacing: 1 }}>Value vs Invested</p>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="assetValGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={T.accent} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={T.accent} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
              <XAxis dataKey="date" stroke={T.muted} tick={{ fontSize: 9 }} tickFormatter={d => d.slice(5)} interval="preserveStartEnd" />
              <YAxis stroke={T.muted} tick={{ fontSize: 9 }} tickFormatter={v => `฿${(v / 1000).toFixed(0)}k`} width={48} />
              <Tooltip formatter={(v, n) => [`฿${fmt(v)}`, n === 'value' ? 'Current Value' : 'Invested']} contentStyle={{ background: T.card, border: `1px solid ${T.border}`, fontFamily: "inherit", borderRadius: 8, fontSize: 12 }} />
              <Area type="monotone" dataKey="value" stroke={T.accent} fill="url(#assetValGrad)" strokeWidth={2} dot={false} />
              <Area type="step" dataKey="invested" stroke={T.muted} fill="transparent" strokeWidth={2} strokeDasharray="4 4" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div style={{ padding: "30px 16px", background: "rgba(0,0,0,0.2)", borderRadius: 8, fontSize: 13, color: T.muted, textAlign: "center", marginBottom: 16 }}>
          No snapshot history available for this asset yet.
        </div>
      )}

      {!transactions?.length ? (
        <div style={{ padding: "12px 16px", background: "rgba(0,0,0,0.2)", borderRadius: 8, fontSize: 12, color: T.muted, textAlign: "center" }}>
          No transactions recorded yet.
        </div>
      ) : (
        <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 8, overflow: "hidden", border: `1px solid ${T.border}` }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1.5fr 3fr 3fr 70px", padding: "8px 12px", background: T.surface, fontSize: 10, fontWeight: 700, color: T.muted, letterSpacing: 0.5, borderBottom: `1px solid ${T.border}` }}>
            <div>DATE</div>
            <div>TYPE</div>
            <div style={{ textAlign: "right" }}>AMOUNT</div>
            <div style={{ textAlign: "right" }}>UNITS/QTY</div>
            <div></div>
          </div>
          <div style={{ maxHeight: 250, overflowY: "auto" }}>
            {transactions.map(tx => {
              const isSell = tx.type === 'sell';
              const amt = isUSD ? tx.amount_usd : tx.amount_thb;
              const color = isSell ? T.orange : (tx.type === 'dividend' ? T.green : T.text);
              return (
                <div key={tx.id} style={{ display: "grid", gridTemplateColumns: "1.5fr 1.5fr 3fr 3fr 70px", padding: "10px 12px", fontSize: 12, color: T.text, borderBottom: `1px solid ${T.border}55`, alignItems: "center" }}>
                  <div style={{ color: T.dim }}>{new Date(tx.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" })}</div>
                  <div style={{ textTransform: "capitalize", color }}>{tx.type}</div>
                  <div style={{ textAlign: "right", color }}>
                    {isUSD ? '$' : '฿'}{fmt(Math.abs(amt || 0), 2)}
                  </div>
                  <div style={{ textAlign: "right", color: T.muted }}>
                    {tx.units ? fmt(Math.abs(tx.units), 4) : tx.qty ? fmt(Math.abs(tx.qty), 4) : '-'}
                  </div>
                  <div style={{ textAlign: "right", display: "flex", gap: 6, justifyContent: "flex-end" }}>
                    <button onClick={() => onEdit(tx)} style={{ background: "transparent", border: "none", color: T.accent, cursor: "pointer", opacity: 0.7, padding: 0 }} title="Edit">✏️</button>
                    <button onClick={() => { if (window.confirm("Delete transaction?")) onDelete(tx.id); }} style={{ background: "transparent", border: "none", color: T.red, cursor: "pointer", opacity: 0.5, padding: 0 }} title="Delete">✕</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Modal>
  );
}

// ─── UPDATE VALUE MODAL ──────────────────────────────────────────────────
// UpdateValueModal: if asset.currency === 'USD', input in $ and convert to THB on save
function UpdateValueModal({ asset, onSave, onClose, usdThbRate }) {
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

// ─── ASSET CARD ───────────────────────────────────────────────────────────────
function AssetCard({ asset, total, onEdit, onUpdateValue, onDelete, onAddInvestment, onShowHistory, transactions, onDeleteTx, usdThbRate }) {
  const [hovered, setHovered] = useState(false);
  const { pl, plPct } = calcPL(asset);
  const pct = ((asset.currentValue / total) * 100).toFixed(2);
  const isUp = pl >= 0;
  const hasFinnomenaCode = !!asset.finnomenaCode?.trim();
  const hasYahooSymbol = !!asset.yahooSymbol?.trim();
  const missingUnits = hasFinnomenaCode && !(asset.units > 0);
  const missingQty = hasYahooSymbol && !(asset.qty > 0);
  const avgCost = asset.units > 0 && asset.invested > 0 ? asset.invested / asset.units : (asset.qty > 0 && asset.invested > 0 ? asset.invested / asset.qty : null);
  const priceTs = fmtTs(asset.priceUpdatedAt || asset.navUpdatedAt);
  const isUSD = asset.currency === "USD" && !!usdThbRate;
  const usdVal = isUSD ? fmt(asset.currentValue / usdThbRate, 2) : null;
  const usdCost = isUSD && asset.investedUSD ? fmt(asset.investedUSD, 2) : null;
  return (
    <div onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ background: hovered ? T.cardHover : T.card, borderTop: `1px solid ${hovered ? T.borderLight : T.border}`, borderRight: `1px solid ${hovered ? T.borderLight : T.border}`, borderBottom: `1px solid ${hovered ? T.borderLight : T.border}`, borderLeft: `3px solid ${asset.color}`, borderRadius: 12, padding: "16px 18px", marginBottom: 10 }}>
      {/* ── Drag Handle & Header ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div data-drag-handle title="Drag to reorder" style={{ cursor: "grab", color: T.dim, padding: "2px 4px 2px 0", marginTop: 2 }}>
          <svg width="12" height="18" viewBox="0 0 14 20" fill="currentColor">
            <circle cx="4" cy="6" r="1.5" /><circle cx="10" cy="6" r="1.5" />
            <circle cx="4" cy="10" r="1.5" /><circle cx="10" cy="10" r="1.5" />
            <circle cx="4" cy="14" r="1.5" /><circle cx="10" cy="14" r="1.5" />
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3, flexWrap: "wrap" }}>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{asset.name}</p>
            {asset.isSpeculative && <span style={{ background: "#f9731620", color: T.orange, border: `1px solid ${T.orange}44`, borderRadius: 4, padding: "1px 6px", fontSize: 10, fontWeight: 700 }}>SPEC</span>}
            {hasFinnomenaCode && !missingUnits && <span style={{ background: "#3b82f615", color: T.accent, border: `1px solid ${T.accent}44`, borderRadius: 4, padding: "1px 6px", fontSize: 10, fontWeight: 700 }}>FNOMNA</span>}
            {hasYahooSymbol && !missingQty && <span style={{ background: "#10b98115", color: T.green, border: `1px solid ${T.green}44`, borderRadius: 4, padding: "1px 6px", fontSize: 10, fontWeight: 700 }}>YAHOO</span>}
            {(missingUnits || missingQty) && <span title="Add units/qty to enable auto-fetch" style={{ background: "#f9731620", color: T.orange, border: `1px solid ${T.orange}44`, borderRadius: 4, padding: "1px 6px", fontSize: 10, fontWeight: 700 }}>⚠ Set amount</span>}
          </div>
          <p style={{ margin: "0 0 2px", fontSize: 11, color: T.muted }}>{CATEGORY_TYPES.find(c => c.value === asset.type)?.label} · {pct}% of portfolio</p>
          {(hasFinnomenaCode || hasYahooSymbol) && (
            <p style={{ margin: "2px 0 0", fontSize: 10, color: T.dim }}>
              {asset.finnomenaCode || asset.yahooSymbol}{(asset.units > 0 || asset.qty > 0) ? ` · ${fmt(asset.units || asset.qty, 4)} units` : ""}
              {avgCost ? ` · avg ฿${fmt(avgCost, 4)}/unit` : ""}
            </p>
          )}
          {priceTs && <p style={{ margin: "2px 0 0", fontSize: 10, color: T.dim }}>🕐 {priceTs}</p>}
          {asset.notes && <p style={{ margin: "4px 0 0", fontSize: 11, color: T.dim, lineHeight: 1.5 }}>{asset.notes}</p>}
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          {isUSD ? (
            <>
              <p style={{ margin: "0 0 1px", fontWeight: 800, fontSize: 16, color: T.text }}>${usdVal}</p>
              <p style={{ margin: "0 0 2px", fontSize: 11, color: T.muted }}>≈ ฿{fmt(asset.currentValue)}</p>
            </>
          ) : (
            <p style={{ margin: "0 0 3px", fontWeight: 800, fontSize: 16, color: T.text }}>฿{fmt(asset.currentValue)}</p>
          )}
          {asset.invested > 0 && (
            <p style={{ margin: "0 0 3px", fontSize: 12, color: isUp ? T.green : T.red, fontWeight: 600 }}>
              {isUp ? "▲" : "▼"} {isUSD ? `$${fmt(Math.abs(pl) / usdThbRate, 2)}` : `฿${fmt(Math.abs(pl))}`} ({isUp ? "+" : "-"}{Math.abs(plPct).toFixed(2)}%)
            </p>
          )}
          <p style={{ margin: 0, fontSize: 11, color: T.muted }}>
            {isUSD && usdCost ? `Cost: $${usdCost} (฿${fmt(asset.invested)})` : `Cost: ฿${fmt(asset.invested)}`}
          </p>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.border}` }}>
        {[
          { label: "💰 + Invst", onClick: onAddInvestment, color: T.green },
          { label: "✏️ Edit", onClick: onEdit, color: T.muted },
          { label: "📜 History", onClick: onShowHistory, color: T.text },
          { label: "🗑", onClick: onDelete, color: T.red },
        ].map(btn => (
          <button key={btn.label} onClick={btn.onClick} style={{ flex: btn.label === "🗑" ? 0 : 1, minWidth: btn.label === "🗑" ? 36 : 0, padding: "7px 0", borderRadius: 8, border: `1px solid ${btn.color}44`, background: `${btn.color}11`, color: btn.color, cursor: "pointer", fontSize: 12, fontFamily: "inherit", fontWeight: 600 }}>{btn.label}</button>
        ))}
      </div>
    </div>
  );
}

// ─── STOCK SUB-ASSET FORM ─────────────────────────────────────────────────────
function StockSubForm({ initial, onSave, onClose, usdThbRate, hasTransactions }) {
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
      yahooSymbol: form.yahooSymbol.trim()
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

// ─── STOCK GROUP CARD ─────────────────────────────────────────────────────────
function StockGroupCard({ asset, total, onEdit, onDelete, onAddSub, onEditSub, onDeleteSub, onAddInvSub, onShowHistorySub, transactions, onDeleteTx, usdThbRate }) {
  const [expanded, setExpanded] = useState(false);
  const { invested, currentValue } = groupTotals(asset);
  const pl = currentValue - invested;
  const plPct = invested > 0 ? (pl / invested) * 100 : 0;
  const pct = total > 0 ? ((currentValue / total) * 100).toFixed(2) : "0.00";
  const isUp = pl >= 0;
  const subs = asset.subAssets || [];
  const catLabel = CATEGORY_TYPES.find(c => c.value === asset.type)?.label ?? asset.type;

  return (
    <div style={{ background: T.card, borderTop: `1px solid ${T.borderLight}`, borderRight: `1px solid ${T.borderLight}`, borderBottom: `1px solid ${T.borderLight}`, borderLeft: `3px solid ${asset.color}`, borderRadius: 12, marginBottom: 10, overflow: "hidden" }}>
      {/* ── Group header (always visible) ── */}
      <div style={{ padding: "14px 18px", cursor: "pointer" }} onClick={(e) => { if (!e.target.closest('[data-drag-handle]')) setExpanded(exp => !exp); }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div data-drag-handle title="Drag to reorder" style={{ cursor: "grab", color: T.dim, padding: "2px 4px 2px 0", marginTop: 2 }}>
            <svg width="12" height="18" viewBox="0 0 14 20" fill="currentColor">
              <circle cx="4" cy="6" r="1.5" /><circle cx="10" cy="6" r="1.5" />
              <circle cx="4" cy="10" r="1.5" /><circle cx="10" cy="10" r="1.5" />
              <circle cx="4" cy="14" r="1.5" /><circle cx="10" cy="14" r="1.5" />
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
              <span style={{ fontSize: 12 }}>{expanded ? "▼" : "▶"}</span>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: T.text }}>{asset.name}</p>
              <span style={{ background: `${asset.color}20`, color: asset.color, border: `1px solid ${asset.color}44`, borderRadius: 4, padding: "1px 6px", fontSize: 10, fontWeight: 700 }}>
                {subs.length} stock{subs.length !== 1 ? "s" : ""}
              </span>
            </div>
            <p style={{ margin: 0, fontSize: 11, color: T.muted }}>{catLabel} · {pct}% of portfolio</p>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <p style={{ margin: "0 0 3px", fontWeight: 800, fontSize: 16, color: T.text }}>฿{fmt(currentValue)}</p>
            {invested > 0 && (
              <p style={{ margin: "0 0 3px", fontSize: 12, color: isUp ? T.green : T.red, fontWeight: 600 }}>
                {isUp ? "▲" : "▼"} ฿{fmt(Math.abs(pl))} ({isUp ? "+" : "-"}{Math.abs(plPct).toFixed(2)}%)
              </p>
            )}
            <p style={{ margin: 0, fontSize: 11, color: T.muted }}>Cost: ฿{fmt(invested)}</p>
          </div>
        </div>
      </div>

      {/* ── Expanded: individual stocks ── */}
      {expanded && (
        <div style={{ borderTop: `1px solid ${T.border}`, background: "#090e1a" }}>
          {subs.length === 0 && (
            <p style={{ padding: "20px 18px", margin: 0, fontSize: 13, color: T.dim, textAlign: "center" }}>No stocks yet. Click "+ Add Stock" to get started.</p>
          )}
          {subs.map(sub => {
            const spl = sub.currentValue - sub.invested;
            const splPct = sub.invested > 0 ? (spl / sub.invested) * 100 : 0;
            const sup = spl >= 0;
            return (
              <div key={sub.id}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 18px", borderBottom: `1px solid ${T.border}55` }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: T.text }}>{sub.name}</p>
                      {sub.notes && <span style={{ fontSize: 11, color: T.dim }}>· {sub.notes}</span>}
                    </div>
                    <p style={{ margin: "2px 0 0", fontSize: 11, color: T.muted }}>
                      {sub.currency === "USD" && sub.investedUSD > 0 ? `Cost: $${fmt(sub.investedUSD, 2)} (฿${fmt(sub.invested)})` : `Cost: ฿${fmt(sub.invested)}`}
                    </p>
                    {fmtTs(sub.priceUpdatedAt) && <p style={{ margin: "2px 0 0", fontSize: 10, color: T.dim }}>🕐 {fmtTs(sub.priceUpdatedAt)}</p>}
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    {sub.currency === "USD" && usdThbRate ? (
                      <>
                        <p style={{ margin: "0 0 1px", fontWeight: 700, fontSize: 14, color: T.text }}>${fmt(sub.currentValue / usdThbRate, 2)}</p>
                        <p style={{ margin: "0 0 2px", fontSize: 11, color: T.muted }}>≈ ฿{fmt(sub.currentValue)}</p>
                      </>
                    ) : (
                      <p style={{ margin: "0 0 2px", fontWeight: 700, fontSize: 14, color: T.text }}>฿{fmt(sub.currentValue)}</p>
                    )}
                    {sub.invested > 0 && (
                      <p style={{ margin: 0, fontSize: 11, color: sup ? T.green : T.red, fontWeight: 600 }}>
                        {sup ? "+" : ""}{splPct.toFixed(2)}%
                      </p>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 4, flexShrink: 0, flexWrap: "wrap", width: 80, justifyContent: "flex-end", alignContent: "flex-start" }}>
                    <button onClick={() => onAddInvSub(sub)} style={{ width: "100%", fontSize: 11, padding: "3px 8px", borderRadius: 6, border: `1px solid ${T.green}44`, background: `${T.green}11`, color: T.green, cursor: "pointer", fontFamily: "inherit" }}>+ Invst</button>
                    <button onClick={() => onShowHistorySub(sub)} style={{ width: "100%", fontSize: 11, padding: "3px 8px", borderRadius: 6, border: `1px solid ${T.muted}44`, background: `${T.muted}11`, color: T.text, cursor: "pointer", fontFamily: "inherit" }}>
                      📜 History
                    </button>
                    <button onClick={() => onEditSub(sub)} style={{ flex: 1, fontSize: 11, padding: "3px 0", borderRadius: 6, border: `1px solid ${T.muted}44`, background: `${T.muted}11`, color: T.text, cursor: "pointer", fontFamily: "inherit" }}>✏️</button>
                    <button onClick={() => onDeleteSub(sub.id)} style={{ flex: 1, fontSize: 11, padding: "3px 0", borderRadius: 6, border: `1px solid ${T.red}44`, background: `${T.red}11`, color: T.red, cursor: "pointer", fontFamily: "inherit" }}>🗑</button>
                  </div>
                </div>
              </div>
            );
          })}

          {/* ── Footer actions ── */}
          <div style={{ display: "flex", gap: 8, padding: "10px 18px" }}>
            <button onClick={onAddSub} style={{ flex: 2, padding: "8px 0", borderRadius: 8, border: `1px solid ${asset.color}55`, background: `${asset.color}15`, color: asset.color, cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "inherit" }}>
              + Add Stock
            </button>
            <button onClick={onEdit} style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: `1px solid ${T.muted}44`, background: `${T.muted}11`, color: T.text, cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>
              ✏️ Edit
            </button>
            <button onClick={onDelete} style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: `1px solid ${T.red}44`, background: `${T.red}11`, color: T.red, cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>
              🗑 Del
            </button>
          </div>
        </div>
      )
      }
    </div >
  );
}


function CustomTip({ active, payload }) {
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

function PnLTooltip({ active, payload }) {
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

// Custom Candle component for History chart
const Candle = (props) => {
  const { x, y, width, height, open, close, high, low, color } = props;
  const isUp = close >= open;
  const candleColor = color || (isUp ? T.green : T.red);

  const xc = x + width / 2;

  // Robust coordinate calculation for wicks
  // We use the Bar's y and height which already map to [open, close]
  const bodyMax = Math.max(open, close);
  const bodyMin = Math.min(open, close);
  const bodyRange = Math.max(0.01, Math.abs(bodyMax - bodyMin));
  const pxPerUnit = height / bodyRange;

  const highY = y - (high - bodyMax) * pxPerUnit;
  const lowY = y + height + (bodyMin - low) * pxPerUnit;

  return (
    <g>
      <line x1={xc} y1={lowY} x2={xc} y2={highY} stroke={candleColor} strokeWidth={1.5} />
      <rect x={x} y={y} width={width} height={Math.max(1, height)} fill={candleColor} />
    </g>
  );
};

// ─── APP ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [session, setSession] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [assets, setAssets] = useState(DEFAULT_ASSETS);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [tab, setTab] = useState("dashboard");
  const [showClosed, setShowClosed] = useState(false);
  const [modal, setModal] = useState(null);
  // History tab state
  const [snapshots, setSnapshots] = useState([]);
  const [snapshotRange, setSnapshotRange] = useState(30);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const snapshotCache = useRef({});
  const [editingAsset, setEditingAsset] = useState(null);
  const [saveStatus, setSaveStatus] = useState(null);
  const [loadStatus, setLoadStatus] = useState("loading"); // loading | ready | error
  const [cacheInfo, setCacheInfo] = useState(null); // removed — was for banner
  const [usdThbRate, setUsdThbRate] = useState(null); // USDTHB=X from price_cache
  const [dragOverId, setDragOverId] = useState(null);
  const dragSrcId = useRef(null);
  // Sub-asset modal state (for stock groups)
  const [subModal, setSubModal] = useState(null); // 'add' | 'edit' | 'update'
  const [activeGroupId, setActiveGroupId] = useState(null);
  const [editingSubAsset, setEditingSubAsset] = useState(null);

  // Transactions state
  const [transactions, setTransactions] = useState([]);
  const [txModal, setTxModal] = useState(null); // { type: 'asset' | 'sub', assetId, subId? }
  const [historyModal, setHistoryModal] = useState(null); // { asset, subAsset, isUSD }

  // ── Auth Listener ──
  useEffect(() => {
    if (!supabase) {
      setIsAuthLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setIsAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const userId = session?.user?.id || (!supabase ? getDeviceId() : null);

  // ── Load from Supabase on mount ──
  useEffect(() => {
    if (!userId) return; // Wait until authenticated
    async function load() {
      try {
        const [data, txs] = await Promise.all([
          loadPortfolio(userId),
          getTransactions(userId)
        ]);
        if (data?.assets) setAssets(data.assets);
        if (data?.settings) setSettings(data.settings);
        setTransactions(txs || []);
        setLoadStatus("ready");
      } catch {
        setLoadStatus("error");
      }
    }
    load();
  }, [userId]);

  // ── Apply prices from price_cache after portfolio loads ──
  useEffect(() => {
    if (loadStatus !== "ready") return;

    async function applyCache() {
      // Collect all symbols we care about
      const symbols = new Set();
      for (const a of assets) {
        if (a.finnomenaCode?.trim()) symbols.add(a.finnomenaCode.trim());
        if (a.yahooSymbol?.trim()) symbols.add(a.yahooSymbol.trim());
        for (const sub of a.subAssets || []) {
          if (sub.yahooSymbol?.trim()) symbols.add(sub.yahooSymbol.trim());
        }
      }
      // Always include USDTHB=X so we can display USD values
      symbols.add("USDTHB=X");
      if (symbols.size === 0) return;

      const cache = await getPriceCache([...symbols]);
      if (cache.size === 0) return;

      // Extract USDTHB rate
      if (cache.has("USDTHB=X")) setUsdThbRate(cache.get("USDTHB=X").price);


      // Track staleness
      let oldest = null;
      const staleSymbols = [];
      for (const [sym, row] of cache) {
        if (!oldest || new Date(row.updated_at) < new Date(oldest)) oldest = row.updated_at;
        if (isCacheStale(row.updated_at)) staleSymbols.push(sym);
      }
      setCacheInfo({ updatedAt: oldest, staleSymbols });

      // Apply cached prices to assets
      setAssets(prev => prev.map(a => {
        // Finnomena fund on a regular asset
        if (a.finnomenaCode?.trim() && cache.has(a.finnomenaCode.trim())) {
          const row = cache.get(a.finnomenaCode.trim());
          const newVal = a.units > 0 ? +(a.units * row.price).toFixed(2) : a.currentValue;
          return { ...a, currentValue: newVal, navUpdatedAt: row.updated_at };
        }
        // Yahoo finance on a regular asset
        if (a.yahooSymbol?.trim() && cache.has(a.yahooSymbol.trim())) {
          const row = cache.get(a.yahooSymbol.trim());
          const px = row.currency === "USD" && cache.has("USDTHB=X") ? row.price * cache.get("USDTHB=X").price : row.price;
          const newVal = a.qty > 0 ? +(a.qty * px).toFixed(2) : a.currentValue;
          return { ...a, currentValue: newVal, priceUpdatedAt: row.updated_at };
        }
        // Stock group — update sub-assets
        if ((a.subAssets || []).length > 0) {
          return {
            ...a,
            subAssets: a.subAssets.map(sub => {
              if (!sub.yahooSymbol?.trim() || !cache.has(sub.yahooSymbol.trim())) return sub;
              const row = cache.get(sub.yahooSymbol.trim());
              const px = row.currency === "USD" && cache.has("USDTHB=X") ? row.price * cache.get("USDTHB=X").price : row.price;
              const newVal = sub.qty > 0 ? +(sub.qty * px).toFixed(2) : sub.currentValue;
              return { ...sub, currentValue: newVal, priceDate: row.price_date, priceUpdatedAt: row.updated_at };
            }),
          };
        }
        return a;
      }));
    }
    applyCache();
    // Only run when portfolio first loads — not on every assets change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadStatus]);


  // ── One-time Data Migration (Sanitization) ──
  useEffect(() => {
    if (loadStatus !== "ready" || !usdThbRate) return;
    setAssets(prev => {
      const sanitized = prev.map(a => sanitizeAsset(a, usdThbRate));
      // Only update if something actually changed to avoid infinite save loops
      if (JSON.stringify(sanitized) === JSON.stringify(prev)) return prev;
      console.log("[Migration] Sanitizing legacy asset data structure...");
      return sanitized;
    });
  }, [loadStatus, usdThbRate]);

  // ── Debounced save to Supabase ──
  useEffect(() => {
    if (loadStatus !== "ready" || !userId) return;
    setSaveStatus("saving");
    const timer = setTimeout(async () => {
      const ok = await savePortfolio(userId, assets, settings);
      setSaveStatus(ok ? "saved" : "error");
      if (ok) setTimeout(() => setSaveStatus(null), 2000);
    }, 800);
    return () => clearTimeout(timer);
  }, [assets, settings, loadStatus, userId]);

  // ── Computed ──
  // 1. Derive invested/units from transactions (source of truth if they exist)
  const derivedAssets = assets.map(asset => {
    let derived = { ...asset };
    const isUSD = asset.currency === "USD";

    // Top-level asset (e.g. fund, crypto, generic stock)
    const assetTxs = transactions.filter(t => t.asset_id === asset.id && !t.sub_asset_id && (t.type === 'buy' || t.type === 'sell'));
    if (assetTxs.length > 0) {
      const { invThb, invUsd, totalUnits, totalQty } = calcDerivedTotals(assetTxs, isUSD);

      derived.invested = invThb;
      if (isUSD) derived.investedUSD = invUsd;

      // Dynamically adjust currentValue matching the new derived unit count
      if (asset.units > 0 && asset.currentValue !== undefined) {
        const unitPrice = asset.currentValue / asset.units;
        derived.currentValue = totalUnits * unitPrice;
      } else if (asset.qty > 0 && asset.currentValue !== undefined) {
        const unitPrice = asset.currentValue / asset.qty;
        derived.currentValue = totalQty * unitPrice;
      }

      if (derived.units !== undefined) derived.units = totalUnits;
      if (derived.qty !== undefined) derived.qty = totalQty;
    }

    // Sub-assets (e.g. inside US Stocks / Thai Stocks groups)
    if (derived.subAssets?.length > 0) {
      derived.subAssets = derived.subAssets.map(sub => {
        const subIsUSD = sub.currency === 'USD';
        const subTxs = transactions.filter(t => t.asset_id === asset.id && t.sub_asset_id === sub.id && (t.type === 'buy' || t.type === 'sell'));

        let subDerived = { ...sub };

        if (subTxs.length > 0) {
          const { invThb, invUsd, totalQty } = calcDerivedTotals(subTxs, subIsUSD);
          subDerived.invested = invThb;
          if (subIsUSD) subDerived.investedUSD = invUsd;

          if (sub.qty > 0 && sub.currentValue !== undefined) {
            const unitPrice = sub.currentValue / sub.qty;
            subDerived.currentValue = totalQty * unitPrice;
          }
          subDerived.qty = totalQty;
        }

        return subDerived;
      });
    }

    // Apply global sanitization rules
    return sanitizeAsset(derived, usdThbRate);
  });

  // 1.5. Separate Active vs Closed assets
  const normalizedAssets = normalizeAssets(derivedAssets);
  const hasHistory = (aid, sid = null) => transactions.some(t => t.asset_id === aid && (sid ? t.sub_asset_id === sid : !t.sub_asset_id));

  // A position is "Active" if it has value/units OR if it has NO history yet (newly added manual placeholder)
  const activeAssets = normalizedAssets.filter(a => a.currentValue > 0 || a.units > 0 || a.qty > 0 || !hasHistory(a.id));
  const closedAssets = normalizedAssets.filter(a => (a.currentValue <= 0 && (a.units || 0) <= 0 && (a.qty || 0) <= 0) && hasHistory(a.id));

  // 2. Compute group totals from subAssets
  const investments = activeAssets.filter(a => !a.isSpeculative);
  const speculative = activeAssets.filter(a => a.isSpeculative);
  const totalInvest = investments.reduce((s, a) => s + a.currentValue, 0);
  const totalInvested = investments.reduce((s, a) => s + a.invested, 0);
  const totalSpec = speculative.reduce((s, a) => s + a.currentValue, 0);
  const netWorth = totalInvest;
  const grandTotal = totalInvest; // Grand Total is now ONLY true investments
  const totalPL = totalInvest - totalInvested;
  const totalPLpct = totalInvested > 0 ? (totalPL / totalInvested) * 100 : 0;
  // Speculation is tracked relative to the main investment portfolio size
  const specPct = grandTotal > 0 ? (totalSpec / grandTotal) * 100 : 0;
  const specCap = grandTotal * (settings.specCap / 100);
  const specOver = totalSpec - specCap;


  const projection = (() => {
    let bal = totalInvest;
    return Array.from({ length: 13 }, (_, i) => {
      if (i > 0) bal = bal * 1.008 + settings.dca;
      return { month: i === 0 ? "Now" : `M${i}`, value: Math.round(bal) };
    });
  })();

  // Group investments by category for the pie chart
  const pieData = (() => {
    const groups = investments.reduce((acc, a) => {
      acc[a.type] = (acc[a.type] || 0) + a.currentValue;
      return acc;
    }, {});

    return Object.entries(groups)
      .map(([type, value]) => {
        const cat = CATEGORY_TYPES.find(c => c.value === type);
        // Use a consistent color based on the category index, or fallback
        const colorIdx = CATEGORY_TYPES.findIndex(c => c.value === type) % PALETTE.length;
        return {
          name: cat ? cat.label : type,
          value,
          color: PALETTE[colorIdx >= 0 ? colorIdx : 0],
          pct: ((value / totalInvest) * 100).toFixed(2)
        };
      })
      .sort((a, b) => b.value - a.value); // sort largest to smallest
  })();

  const saveAsset = async (asset) => {
    // Check if this is a brand new asset creation
    const isNew = !assets.find(a => a.id === asset.id);

    // Persist the asset immediately
    setAssets(prev => isNew ? [...prev, asset] : prev.map(a => a.id === asset.id ? asset : a));
    setModal(null); setEditingAsset(null);

    // Auto-generate initial buy transaction if new and has an investment baseline
    if (isNew && parseFloat(asset.invested || 0) > 0) {
      await saveTransaction({
        asset_id: asset.id,
        sub_asset_id: null,
        type: 'buy',
        currency: asset.currency || 'THB',
        date: new Date().toISOString().split('T')[0],
        amount_thb: asset.currency === 'USD' ? null : Number(parseFloat(asset.invested || 0).toFixed(2)),
        amount_usd: asset.currency === 'USD' ? Number(parseFloat(asset.investedUSD || 0).toFixed(2)) : null,
        units: asset.units ? Number(parseFloat(asset.units).toFixed(8)) : null,
        qty: asset.qty ? Number(parseFloat(asset.qty).toFixed(8)) : null,
        notes: '[System] Initial Setup Investment'
      });
    }

    // Smart cache-on-save: if finnomenaCode set and not yet cached, try to fetch + cache it
    if (asset.finnomenaCode?.trim() && supabase) {
      const code = asset.finnomenaCode.trim();
      const cached = await getPriceCache([code]);
      if (!cached.has(code) || isCacheStale(cached.get(code)?.updated_at)) {
        try {
          const navData = await fetchCurrentNAV(code);
          if (navData && asset.units > 0) {
            const newVal = +(asset.units * navData.nav).toFixed(2);
            const now = new Date().toISOString();
            // Write to cache via Supabase
            await supabase.from("price_cache").upsert({
              symbol: code, type: "fund", price: navData.nav, currency: "THB",
              price_date: navData.date, source: "finnomena", updated_at: now,
            }, { onConflict: "symbol" });
            // Apply to asset in state
            setAssets(prev => prev.map(a => a.id === asset.id
              ? { ...a, currentValue: newVal, navUpdatedAt: now } : a));
          }
        } catch (e) {
          console.warn("[Cache-on-save] Finnomena fetch failed:", e.message);
        }
      }
    }

    // Smart cache-on-save for Yahoo top-level assets
    if (asset.yahooSymbol?.trim() && asset.qty > 0 && supabase) {
      const sym = asset.yahooSymbol.trim();
      const cached = await getPriceCache([sym]);
      if (!cached.has(sym) || isCacheStale(cached.get(sym)?.updated_at)) {
        try {
          const priceData = await fetchStockPrice(sym);
          if (priceData) {
            const isUsd = asset.currency === "USD";
            const fx = isUsd ? await fetchUSDTHBRate() : null;
            const thbPrice = fx ? +(priceData.price * fx).toFixed(4) : priceData.price;
            const dbPrice = isUsd ? priceData.price : thbPrice;
            const now = new Date().toISOString();
            await supabase.from("price_cache").upsert({
              symbol: sym, type: isUsd ? "us_stock" : (asset.type === "gold" ? "commodity" : "other"),
              price: dbPrice, currency: isUsd ? "USD" : "THB",
              price_date: priceData.date, source: "yahoo", updated_at: now,
            }, { onConflict: "symbol" });
            const newVal = +(asset.qty * thbPrice).toFixed(2);
            setAssets(prev => prev.map(a => a.id === asset.id
              ? { ...a, currentValue: newVal, priceUpdatedAt: now } : a));
          }
        } catch (e) {
          console.warn("[Cache-on-save] Yahoo fetch failed:", e.message);
        }
      }
    }
  };


  const deleteAsset = (id) => {
    if (window.confirm("Delete this asset?")) setAssets(prev => prev.filter(a => a.id !== id));
  };

  const updateValue = (id, val) => {
    setAssets(prev => prev.map(a => a.id === id ? { ...a, currentValue: val } : a));
    setModal(null); setEditingAsset(null);
  };

  const updateSettings = (key, val) => setSettings(prev => ({ ...prev, [key]: val }));

  // ── Sub-asset handlers (for stock groups) ──
  const closeSub = () => { setSubModal(null); setActiveGroupId(null); setEditingSubAsset(null); };

  const saveSubAsset = async (sub) => {
    let isNew = false;

    setAssets(prev => prev.map(a => {
      if (a.id !== activeGroupId) return a;
      const existing = (a.subAssets || []).find(s => s.id === sub.id);
      if (!existing) isNew = true;

      const subAssets = existing
        ? (a.subAssets || []).map(s => s.id === sub.id ? sub : s)
        : [...(a.subAssets || []), sub];
      return { ...a, subAssets };
    }));
    closeSub();

    // Auto-generate initial buy transaction if new and has an investment baseline
    if (isNew && parseFloat(sub.invested || 0) > 0) {
      await saveTransaction({
        asset_id: activeGroupId,
        sub_asset_id: sub.id,
        type: 'buy',
        currency: sub.currency || 'THB',
        date: new Date().toISOString().split('T')[0],
        amount_thb: sub.currency === 'USD' ? null : Number(parseFloat(sub.invested || 0).toFixed(2)),
        amount_usd: sub.currency === 'USD' ? Number(parseFloat(sub.investedUSD || 0).toFixed(2)) : null,
        units: null, // Sub-assets are distinct units of stocks
        qty: Number(parseFloat(sub.qty || 0).toFixed(8)),
        notes: '[System] Initial Setup Investment'
      });
    }

    // Smart cache-on-save for Yahoo stocks
    if (sub.yahooSymbol?.trim() && sub.qty > 0 && supabase) {
      const sym = sub.yahooSymbol.trim();
      const cached = await getPriceCache([sym]);
      if (!cached.has(sym) || isCacheStale(cached.get(sym)?.updated_at)) {
        try {
          const priceData = await fetchStockPrice(sym);
          if (priceData) {
            const isUsd = sub.currency === "USD";
            const fx = isUsd ? await fetchUSDTHBRate() : null;
            const thbPrice = fx ? +(priceData.price * fx).toFixed(4) : priceData.price;
            const dbPrice = isUsd ? priceData.price : thbPrice;
            const now = new Date().toISOString();
            await supabase.from("price_cache").upsert({
              symbol: sym, type: isUsd ? "us_stock" : "thai_stock",
              price: dbPrice, currency: isUsd ? "USD" : "THB",
              price_date: priceData.date, source: "yahoo", updated_at: now,
            }, { onConflict: "symbol" });
            const newVal = +(sub.qty * thbPrice).toFixed(2);
            setAssets(prev => prev.map(a => a.id !== activeGroupId ? a : {
              ...a,
              subAssets: (a.subAssets || []).map(s => s.id === sub.id
                ? { ...s, currentValue: newVal, priceDate: priceData.date, priceUpdatedAt: now } : s),
            }));
          }
        } catch (e) {
          console.warn("[Cache-on-save] Yahoo fetch failed:", e.message);
        }
      }
    }
  };


  const deleteSubAsset = (groupId, subId) => {
    if (!window.confirm("Delete this stock?")) return;
    setAssets(prev => prev.map(a => a.id !== groupId ? a : { ...a, subAssets: (a.subAssets || []).filter(s => s.id !== subId) }));
  };

  const updateSubValue = (groupId, subId, val) => {
    setAssets(prev => prev.map(a => a.id !== groupId ? a : {
      ...a, subAssets: (a.subAssets || []).map(s => s.id === subId ? { ...s, currentValue: val } : s)
    }));
    closeSub();
  };

  const saveTransaction = async (tx) => {
    try {
      setSaveStatus("saving");
      let savedTx = tx;

      if (tx.id) {
        // Update existing
        if (supabase) {
          savedTx = await updateTransaction(tx.id, { ...tx, user_id: userId });
        } else {
          savedTx = { ...tx, user_id: userId };
        }

        if (savedTx) {
          setTransactions(prev => prev.map(t => t.id === savedTx.id ? savedTx : t).sort((a, b) => new Date(b.date) - new Date(a.date)));
        }
      } else {
        // Add new
        if (supabase) {
          savedTx = await addTransaction({ ...tx, user_id: userId });
        } else {
          savedTx = { ...tx, user_id: userId, id: uid() };
        }

        if (savedTx) {
          setTransactions(prev => [savedTx, ...prev].sort((a, b) => new Date(b.date) - new Date(a.date)));
        }
      }

      // Auto-migration for legacy assets:
      // By adding a transaction, the derived logic will now take over.
      // We don't need to actually zero out the asset's stored `invested` or `units` because the derived logic just ignores them if transactions > 0.
      setTxModal(null);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus(null), 2000);
    } catch (err) {
      console.error("Failed to save transaction:", err);
      setSaveStatus("error");
      setTimeout(() => setSaveStatus(null), 3000);
      alert("Failed to save transaction");
    }
  };

  const deleteTx = async (id) => {
    try {
      setSaveStatus("saving");
      if (supabase) await deleteTransaction(id);
      setTransactions(prev => prev.filter(t => t.id !== id));
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus(null), 2000);
    } catch (err) {
      console.error("Failed to delete transaction:", err);
      setSaveStatus("error");
      setTimeout(() => setSaveStatus(null), 3000);
      alert("Failed to delete transaction");
    }
  };

  const TABS = [
    { id: "dashboard", label: "\ud83c\udfe0 Dashboard" },
    { id: "assets", label: "\ud83d\udcbc Assets" },
    { id: "speculative", label: "\u26a1 Speculation" },
    { id: "history", label: "\ud83d\udcc8 History" },
    { id: "projection", label: "\ud83d\udd2e Projection" },
    { id: "ai", label: "\u2728 AI Assistant" },
    { id: "settings", label: "\u2699 Settings" },
  ];

  // Load snapshots when History tab or modal is opened, or range changes
  useEffect(() => {
    if ((tab !== "history" && !historyModal) || !userId) return;

    // Check in-memory cache first so tab switches are instant
    if (snapshotCache.current[snapshotRange]) {
      setSnapshots(snapshotCache.current[snapshotRange]);
      return;
    }

    setSnapshotLoading(true);
    getPortfolioSnapshots(userId, snapshotRange === 0 ? null : snapshotRange)
      .then(rows => {
        snapshotCache.current[snapshotRange] = rows;
        setSnapshots(rows);
        setSnapshotLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load snapshots:", err);
        setSnapshotLoading(false);
      });
  }, [tab, userId, snapshotRange]);

  // ── Loading screen ──
  if (isAuthLoading || (userId && loadStatus === "loading")) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", flexDirection: "column", gap: 16, background: T.bg }}>
        <div style={{ width: 40, height: 40, border: `3px solid ${T.border}`, borderTop: `3px solid ${T.accent}`, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <p style={{ color: T.muted, fontSize: 14 }}>{isAuthLoading ? "Checking session…" : "Loading your portfolio…"}</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // ── Auth Screen ──
  if (!userId) {
    return <Auth />;
  }

  return (
    <div style={{ background: T.bg, minHeight: "100vh", color: T.text, fontFamily: "'Inter', sans-serif" }}>

      {/* ── HEADER ── */}
      <div style={{ background: "linear-gradient(160deg,#0a0f1e 0%,#0d1829 50%,#0a1428 100%)", borderBottom: `1px solid ${T.border}`, padding: "28px 20px 0" }}>
        <div style={{ maxWidth: 700, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
            <div>
              <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 600, color: T.accent, letterSpacing: 1.5, textTransform: "uppercase" }}>Wealth Tracker Pro</p>
              <h1 style={{ margin: "0 0 4px", fontSize: 26, fontWeight: 700, letterSpacing: -0.5 }}>My Portfolio</h1>
              <p style={{ margin: 0, fontSize: 11, color: T.dim }}>
                {session?.user?.email ? `Logged in as ${session.user.email}` : "Offline Mode (Local Storage)"}
              </p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
              <div style={{ display: "flex", gap: 8 }}>
                {supabase && <button onClick={() => supabase.auth.signOut()} style={{ background: "transparent", border: `1px solid ${T.border}`, borderRadius: 10, color: T.muted, padding: "10px 14px", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit", transition: "all 0.2s" }} onMouseOver={e => e.target.style.background = "rgba(255,255,255,0.05)"} onMouseOut={e => e.target.style.background = "transparent"}>Log Out</button>}
                <button onClick={() => { setEditingAsset(null); setModal("add"); }} style={{ background: T.accent, border: "none", borderRadius: 10, color: "#fff", padding: "10px 16px", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit" }}>+ Add Asset</button>
              </div>
              <SaveBadge status={saveStatus} />
            </div>
          </div>

          {/* Stats */}
          <div style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${T.border}`, borderRadius: 12, padding: "16px 20px", marginBottom: 12 }}>
            <p style={{ margin: "0 0 4px", fontSize: 10, color: T.muted, textTransform: "uppercase", letterSpacing: 1 }}>Net Worth</p>
            <p style={{ margin: "0 0 4px", fontSize: 28, fontWeight: 800, color: T.text, letterSpacing: -0.5 }}>฿{fmt(netWorth)}</p>
            <p style={{ margin: 0, fontSize: 11, color: T.dim }}>All assets combined</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: 0 }}>
            {[
              { label: "Initial Investment", value: `฿${fmt(totalInvested)}`, color: T.text, sub: "Cost basis" },
              { label: "Core Portfolio", value: `฿${fmt(totalInvest)}`, color: T.accent, sub: "Long-term safe assets" },
              { label: "Investment P&L", value: `${totalPL >= 0 ? "+" : ""}฿${fmt(Math.abs(totalPL))}`, color: totalPL >= 0 ? T.green : T.red, sub: `${totalPLpct >= 0 ? "+" : ""}${totalPLpct.toFixed(2)}%` },
            ].map(s => (
              <div key={s.label} style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${T.border}`, borderRadius: 10, padding: "12px 14px" }}>
                <p style={{ margin: "0 0 4px", fontSize: 9, color: T.muted, textTransform: "uppercase", letterSpacing: 1 }}>{s.label}</p>
                <p style={{ margin: "0 0 2px", fontSize: 14, fontWeight: 800, color: s.color }}>{s.value}</p>
                <p style={{ margin: 0, fontSize: 10, color: T.dim }}>{s.sub}</p>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", marginTop: 20, overflowX: "auto" }}>
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{ background: "none", border: "none", padding: "12px 14px", color: tab === t.id ? T.accent : T.muted, borderBottom: tab === t.id ? `2px solid ${T.accent}` : "2px solid transparent", cursor: "pointer", fontSize: 12, fontWeight: tab === t.id ? 700 : 400, fontFamily: "inherit", whiteSpace: "nowrap" }}>{t.label}</button>
            ))}
          </div>
        </div>
      </div>

      {/* ── CONTENT ── */}
      <div style={{ maxWidth: 700, margin: "0 auto", padding: "24px 16px" }}>

        {/* DASHBOARD */}
        {tab === "dashboard" && (
          <div>
            {/* Allocation bar */}
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: 18, marginBottom: 16 }}>
              <p style={{ margin: "0 0 10px", fontSize: 11, color: T.muted, textTransform: "uppercase", letterSpacing: 1 }}>Portfolio Breakdown</p>
              <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", height: 12, marginBottom: 10 }}>
                {investments.map(a => (
                  <div key={a.id} style={{ width: `${(a.currentValue / totalInvest) * 100}%`, background: a.color }} title={a.name} />
                ))}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px" }}>
                {[...investments].sort((a, b) => b.currentValue - a.currentValue).map(a => (
                  <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: a.color }} />
                    <span style={{ fontSize: 10, color: T.muted }}>{a.name.split(" (")[0].split(" ").slice(0, 2).join(" ")} {((a.currentValue / totalInvest) * 100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Pie + top performers */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14, marginBottom: 16 }}>
              <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: 16 }}>
                <p style={{ margin: "0 0 8px", fontSize: 11, color: T.muted, textTransform: "uppercase", letterSpacing: 1 }}>Sectors / Diversification</p>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={2} dataKey="value">
                      {pieData.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Pie>
                    <Tooltip content={<CustomTip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: 16 }}>
                <p style={{ margin: "0 0 12px", fontSize: 11, color: T.muted, textTransform: "uppercase", letterSpacing: 1 }}>Top Performers</p>
                {[...assets].filter(a => a.invested > 0).sort((a, b) => calcPL(b).plPct - calcPL(a).plPct).slice(0, 5).map(a => {
                  const { plPct } = calcPL(a);
                  return (
                    <div key={a.id} style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 6, height: 6, borderRadius: "50%", background: a.color, flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: T.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 100 }}>{a.name.split(" (")[0]}</span>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: plPct >= 0 ? T.green : T.red }}>{plPct >= 0 ? "+" : ""}{plPct.toFixed(2)}%</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Asset Values Overview */}
            <p style={{ fontSize: 11, color: T.muted, textTransform: "uppercase", letterSpacing: 1.5, margin: "0 0 12px" }}>Asset Values Overview</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
              {[...investments].sort((a, b) => b.currentValue - a.currentValue).map(a => (
                <div key={a.id} style={{ background: T.card, border: `1px solid ${T.border}`, borderLeft: `3px solid ${a.color}`, borderRadius: 10, padding: "12px 14px" }}>
                  <p style={{ margin: "0 0 2px", fontSize: 12, fontWeight: 700, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.name.split(" (")[0]}</p>
                  <p style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 800, color: a.color }}>฿{fmt(a.currentValue)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ASSETS */}
        {tab === "assets" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
              <p style={{ margin: 0, fontSize: 11, color: T.muted, textTransform: "uppercase", letterSpacing: 1 }}>{investments.length} Investment Assets</p>
              <button onClick={() => { setEditingAsset(null); setModal("add"); }} style={{ background: T.accentGlow, border: `1px solid ${T.accent}44`, borderRadius: 8, color: T.accent, padding: "7px 14px", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "inherit" }}>+ Add</button>
            </div>
            {investments.length === 0 && (
              <div style={{ textAlign: "center", padding: "60px 20px", color: T.muted }}>
                <p style={{ fontSize: 40, marginBottom: 12 }}>📊</p>
                <p>No investment assets yet. Add your first one!</p>
              </div>
            )}
            {investments.map(a => {
              const isDragOver = dragOverId === a.id;
              const wrapStyle = {
                opacity: dragSrcId.current === a.id ? 0.4 : 1,
                borderTop: isDragOver ? `2px solid ${T.accent}` : "2px solid transparent",
                transition: "border-color 0.15s, opacity 0.15s",
              };
              const dragHandlers = {
                draggable: true,
                onDragStart: (e) => {
                  const el = document.elementFromPoint(e.clientX, e.clientY);
                  if (!el || !el.closest('[data-drag-handle]')) {
                    e.preventDefault();
                    return;
                  }
                  dragSrcId.current = a.id;
                },
                onDragEnd: () => { dragSrcId.current = null; setDragOverId(null); },
                onDragOver: (e) => { e.preventDefault(); setDragOverId(a.id); },
                onDrop: () => {
                  if (!dragSrcId.current || dragSrcId.current === a.id) return;
                  const srcId = dragSrcId.current;
                  setAssets(prev => {
                    const list = [...prev];
                    const srcIdx = list.findIndex(x => x.id === srcId);
                    const dstIdx = list.findIndex(x => x.id === a.id);
                    const [moved] = list.splice(srcIdx, 1);
                    list.splice(dstIdx, 0, moved);
                    return list;
                  });
                  setDragOverId(null);
                },
              };
              return STOCK_GROUP_TYPES.has(a.type) ? (
                <div key={a.id} style={wrapStyle} {...dragHandlers}>
                  <StockGroupCard
                    asset={a}
                    total={totalInvest}
                    usdThbRate={usdThbRate}
                    onEdit={() => { setEditingAsset(a); setModal("edit"); }}
                    onDelete={() => deleteAsset(a.id)}
                    onAddSub={() => { setActiveGroupId(a.id); setEditingSubAsset(null); setSubModal("add"); }}
                    onEditSub={(sub) => { setActiveGroupId(a.id); setEditingSubAsset(sub); setSubModal("edit"); }}
                    onDeleteSub={(subId) => deleteSubAsset(a.id, subId)}
                    onUpdateSubValue={(sub) => { setActiveGroupId(a.id); setEditingSubAsset(sub); setSubModal("update"); }}
                    onAddInvSub={(sub) => setTxModal({ asset: a, subAsset: sub })}
                    onShowHistorySub={(sub) => setHistoryModal({ asset: a, subAsset: sub, isUSD: sub.currency === 'USD' })}
                    transactions={transactions.filter(t => t.asset_id === a.id)}
                    onDeleteTx={deleteTx}
                  />
                </div>
              ) : (
                <div key={a.id} style={wrapStyle} {...dragHandlers}>
                  <AssetCard asset={a} total={totalInvest} usdThbRate={usdThbRate}
                    onEdit={() => { setEditingAsset(a); setModal("edit"); }}
                    onUpdateValue={() => { setEditingAsset(a); setModal("update"); }}
                    onDelete={() => deleteAsset(a.id)}
                    onAddInvestment={() => setTxModal({ asset: a })}
                    onShowHistory={() => setHistoryModal({ asset: a, isUSD: a.currency === 'USD' })}
                    transactions={transactions.filter(t => t.asset_id === a.id)}
                    onDeleteTx={deleteTx} />
                </div>
              );
            })}

          </div>
        )}

        {/* SPECULATIVE */}
        {tab === "speculative" && (
          <div>
            <div style={{ background: specOver > 0 ? "#1f0e00" : "#10061e", border: `1px solid ${specOver > 0 ? T.orange + "55" : T.purple + "44"}`, borderRadius: 14, padding: "18px 20px", marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <div>
                  <p style={{ margin: "0 0 4px", fontSize: 10, color: T.muted, textTransform: "uppercase", letterSpacing: 1 }}>Speculation Size vs Investments</p>
                  <p style={{ margin: 0, fontSize: 20, fontWeight: 800, color: specOver > 0 ? T.orange : T.purple }}>
                    {specOver > 0 ? `⚠️ ${specPct.toFixed(2)}% — Over Target Limit (${settings.specCap}%)` : `✓ ${specPct.toFixed(2)}% — Within Limit (${settings.specCap}%)`}
                  </p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <p style={{ margin: "0 0 2px", fontSize: 10, color: T.muted }}>Target Limit</p>
                  <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: T.text }}>฿{fmt(specCap)}</p>
                </div>
              </div>
              <div style={{ background: "rgba(0,0,0,0.4)", borderRadius: 6, height: 8, overflow: "hidden" }}>
                <div style={{ width: `${Math.min((totalSpec / specCap) * 100, 100)}%`, background: specOver > 0 ? T.orange : T.purple, height: "100%", borderRadius: 6 }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                <span style={{ fontSize: 11, color: T.muted }}>Current Size: ฿{fmt(totalSpec)}</span>
                <span style={{ fontSize: 11, color: specOver > 0 ? T.orange : T.purple }}>{specOver > 0 ? `Over by ฿${fmt(specOver)}` : `Under by ฿${fmt(Math.abs(specOver))}`}</span>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <p style={{ margin: 0, fontSize: 11, color: T.muted, textTransform: "uppercase", letterSpacing: 1 }}>{speculative.length} Speculative Assets</p>
              <button onClick={() => { setEditingAsset({ isSpeculative: true }); setModal("add"); }} style={{ background: "#f9731620", border: `1px solid ${T.orange}44`, borderRadius: 8, color: T.orange, padding: "7px 14px", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "inherit" }}>+ Add Spec</button>
            </div>

            {speculative.length === 0 && (
              <div style={{ textAlign: "center", padding: "40px 20px", color: T.muted }}>
                <p style={{ fontSize: 40, marginBottom: 12 }}>⚡</p>
                <p>No speculative assets. Add Forex, Crypto etc here.</p>
              </div>
            )}
            {speculative.map(a => (
              <AssetCard key={a.id} asset={a} total={totalSpec || 1} usdThbRate={usdThbRate}
                onEdit={() => { setEditingAsset(a); setModal("edit"); }}
                onUpdateValue={() => { setEditingAsset(a); setModal("update"); }}
                onDelete={() => deleteAsset(a.id)}
                onAddInvestment={() => setTxModal({ asset: a })}
                onShowHistory={() => setHistoryModal({ asset: a, isUSD: a.currency === 'USD' })}
                transactions={transactions.filter(t => t.asset_id === a.id)}
                onDeleteTx={deleteTx} />
            ))}

            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: 16, marginTop: 8 }}>
              <p style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 700, color: T.orange }}>⚡ Speculation Rules</p>
              {[`Max ${settings.specCap}% of grand total in speculative assets`, "Never top up speculation using investment money", "Profits are a bonus — not part of retirement plan", "If speculation wipes out, investments stay untouched"].map((rule, i) => (
                <p key={i} style={{ margin: "0 0 6px", fontSize: 12, color: T.muted, paddingLeft: 14, position: "relative" }}>
                  <span style={{ position: "absolute", left: 0, color: T.orange }}>·</span>{rule}
                </p>
              ))}
            </div>
          </div>
        )}

        {/* PROJECTION */}
        {tab === "projection" && (
          <div>
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: 16, marginBottom: 14 }}>
              <p style={{ margin: "0 0 10px", fontSize: 11, color: T.muted, textTransform: "uppercase", letterSpacing: 1 }}>Monthly DCA Amount</p>
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                {[500, 1000, 2000, 5000].map(v => (
                  <button key={v} onClick={() => updateSettings("dca", v)} style={{ flex: 1, padding: "9px 0", borderRadius: 8, border: `1px solid ${settings.dca === v ? T.accent : T.border}`, background: settings.dca === v ? T.accentGlow : "transparent", color: settings.dca === v ? T.accent : T.muted, cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: settings.dca === v ? 700 : 400 }}>฿{fmt(v)}</button>
                ))}
              </div>
              <input type="range" min="100" max="10000" step="100" value={settings.dca} onChange={e => updateSettings("dca", Number(e.target.value))} style={{ width: "100%", accentColor: T.accent }} />
              <p style={{ margin: "6px 0 0", textAlign: "center", fontSize: 13, color: T.accent, fontWeight: 700 }}>฿{fmt(settings.dca)}/month</p>
            </div>

            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: "16px 8px", marginBottom: 14 }}>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={projection}>
                  <defs>
                    <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={T.accent} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={T.accent} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
                  <XAxis dataKey="month" stroke={T.muted} tick={{ fontSize: 10 }} />
                  <YAxis stroke={T.muted} tick={{ fontSize: 10 }} tickFormatter={v => `฿${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={v => [`฿${fmt(v)}`, "Portfolio Value"]} contentStyle={{ background: T.card, border: `1px solid ${T.border}`, fontFamily: "inherit", borderRadius: 8 }} />
                  <Area type="monotone" dataKey="value" stroke={T.accent} fill="url(#grad)" strokeWidth={2.5} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              {[
                { label: "Current Value", value: `฿${fmt(totalInvest)}`, color: T.text },
                { label: "In 12 Months", value: `฿${fmt(projection[12].value)}`, color: T.green },
                { label: "DCA Added", value: `฿${fmt(settings.dca * 12)}`, color: T.accent },
              ].map(s => (
                <div key={s.label} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: "12px 14px" }}>
                  <p style={{ margin: "0 0 4px", fontSize: 9, color: T.muted, textTransform: "uppercase", letterSpacing: 1 }}>{s.label}</p>
                  <p style={{ margin: 0, fontSize: 16, fontWeight: 800, color: s.color }}>{s.value}</p>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 11, color: T.dim, marginTop: 14, lineHeight: 1.7, textAlign: "center" }}>Assumes ~10% annual return. Past performance ≠ future results. Not financial advice.</p>
          </div>
        )}

        {/* HISTORY */}
        {tab === "history" && (() => {
          const RANGES = [
            { label: "7D", days: 7 },
            { label: "30D", days: 30 },
            { label: "90D", days: 90 },
            { label: "1Y", days: 365 },
            { label: "All", days: 0 },
          ];
          const firstVal = snapshots[0]?.total_invest_thb ?? 0;
          const lastVal = totalInvest; // Use live value instead of stale snapshot
          const change = lastVal - firstVal;
          const changePct = firstVal > 0 ? ((change / firstVal) * 100).toFixed(2) : "0.00";
          const pnlColor = change >= 0 ? T.green : T.red;

          const pnlData = snapshots.map((s, i) => {
            const o = s.o_invest_thb ?? s.total_invest_thb;
            const h = s.h_invest_thb ?? s.total_invest_thb;
            const l = s.l_invest_thb ?? s.total_invest_thb;
            const c = s.total_invest_thb;

            return {
              date: s.snapshot_date,
              open: o,
              high: h,
              low: l,
              close: c,
              // for tooltips and range calculation
              value: c,
              pnl: i === 0 ? 0 : +(c - snapshots[i - 1].total_invest_thb).toFixed(2),
            };
          });

          // Replace/Update live value for today
          if (pnlData.length > 0) {
            const lastIdx = pnlData.length - 1;
            const todayStr = new Date().toISOString().slice(0, 10);
            if (pnlData[lastIdx].date === todayStr) {
              const d = pnlData[lastIdx];
              d.close = lastVal;
              d.high = Math.max(d.high, lastVal);
              d.low = Math.min(d.low, lastVal);
              d.value = lastVal;
              if (lastIdx > 0) {
                d.pnl = +(lastVal - pnlData[lastIdx - 1].close).toFixed(2);
              }
            }
          }

          return (
            <div>
              {/* Range selector */}
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                {RANGES.map(r => (
                  <button key={r.label} onClick={() => setSnapshotRange(r.days)} style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: `1px solid ${snapshotRange === r.days ? T.accent : T.border}`, background: snapshotRange === r.days ? T.accentGlow : "transparent", color: snapshotRange === r.days ? T.accent : T.muted, cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: snapshotRange === r.days ? 700 : 400 }}>{r.label}</button>
                ))}
              </div>

              {snapshotLoading && (
                <div style={{ textAlign: "center", padding: 40, color: T.muted, fontSize: 13 }}>Loading history…</div>
              )}

              {!snapshotLoading && snapshots.length === 0 && (
                <div style={{ textAlign: "center", padding: 40, color: T.muted }}>
                  <p style={{ fontSize: 32, marginBottom: 12 }}>📊</p>
                  <p>No snapshot data yet. Snapshots are recorded automatically at midnight ICT each day.</p>
                  <p style={{ fontSize: 12, marginTop: 8, color: T.dim }}>You can also trigger the GitHub Action manually to create today's first snapshot.</p>
                </div>
              )}

              {!snapshotLoading && snapshots.length > 0 && (
                <>
                  {/* Stats */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
                    {[
                      { label: "Current", value: `฿${fmt(lastVal)}`, color: T.text },
                      { label: "Change", value: `${change >= 0 ? "+" : "-"}฿${fmt(Math.abs(change))}`, color: pnlColor },
                      { label: `Return (${RANGES.find(r => r.days === snapshotRange)?.label ?? "All"})`, value: `${change >= 0 ? "+" : ""}${changePct}%`, color: pnlColor },
                    ].map(s => (
                      <div key={s.label} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: "12px 14px" }}>
                        <p style={{ margin: "0 0 4px", fontSize: 9, color: T.muted, textTransform: "uppercase", letterSpacing: 1 }}>{s.label}</p>
                        <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: s.color }}>{s.value}</p>
                      </div>
                    ))}
                  </div>

                  <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: "16px 8px", marginBottom: 14 }}>
                    <p style={{ margin: "0 0 12px 8px", fontSize: 11, color: T.muted, textTransform: "uppercase", letterSpacing: 1 }}>Net Worth History (1D)</p>
                    <ResponsiveContainer width="100%" height={240}>
                      <ComposedChart data={pnlData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false} />
                        <XAxis dataKey="date" stroke={T.muted} tick={{ fontSize: 9 }} tickFormatter={d => d.slice(5)} interval="preserveStartEnd" />
                        <YAxis stroke={T.muted} tick={{ fontSize: 9 }} tickFormatter={v => `฿${(v / 1000).toFixed(0)}k`} width={48} domain={[(dataMin) => dataMin - 2000, (dataMax) => dataMax + 2000]} />
                        <Tooltip
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
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
                            return null;
                          }}
                        />
                        {/* Invisible area to force Y-axis to cover Highs and Lows */}
                        <Line dataKey="high" stroke="none" dot={false} connectNulls />
                        <Line dataKey="low" stroke="none" dot={false} connectNulls />

                        <Bar
                          dataKey={(d) => [d.open, d.close]}
                          shape={(props) => (
                            <Candle
                              {...props}
                              open={props.payload.open}
                              close={props.payload.close}
                              high={props.payload.high}
                              low={props.payload.low}
                            />
                          )}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Daily PnL Chart */}
                  <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: "16px 8px" }}>
                    <p style={{ margin: "0 0 12px 8px", fontSize: 11, color: T.muted, textTransform: "uppercase", letterSpacing: 1 }}>Daily P&amp;L</p>
                    <ResponsiveContainer width="100%" height={140}>
                      <BarChart data={pnlData}>
                        <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
                        <XAxis dataKey="date" stroke={T.muted} tick={{ fontSize: 9 }} tickFormatter={d => d.slice(5)} interval="preserveStartEnd" />
                        <YAxis stroke={T.muted} tick={{ fontSize: 9 }} tickFormatter={v => `${v > 0 ? "+" : ""}${(v / 1000).toFixed(1)}k`} width={48} />
                        <Tooltip content={<PnLTooltip />} />
                        <Bar dataKey="pnl" radius={[3, 3, 0, 0]}
                          fill={T.green}
                          label={false}
                          isAnimationActive={false}>
                          {pnlData.map((d, i) => (
                            <Cell key={i} fill={d.pnl >= 0 ? T.green : T.red} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </>
              )}
            </div>
          );
        })()}

        {/* AI ASSISTANT */}
        {tab === "ai" && (
          <AIChat assets={normalizedAssets} transactions={transactions} netWorth={netWorth} settings={settings} updateSettings={updateSettings} />
        )}

        {/* SETTINGS */}
        {tab === "settings" && (
          <div>
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: 20, marginBottom: 14 }}>
              <p style={{ margin: "0 0 16px", fontSize: 13, fontWeight: 700, color: T.text }}>Portfolio Settings</p>
              <Field label={`Speculation Limit — ${settings.specCap}%`} hint="Target limit for speculative assets compared to main investments">
                <input type="range" min="5" max="30" step="1" value={settings.specCap} onChange={e => updateSettings("specCap", Number(e.target.value))} style={{ width: "100%", marginBottom: 4, accentColor: T.orange }} />
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 11, color: T.muted }}>5%</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: T.orange }}>{settings.specCap}%</span>
                  <span style={{ fontSize: 11, color: T.muted }}>30%</span>
                </div>
              </Field>
              <Field label={`Default DCA — ฿${fmt(settings.dca)}/month`} hint="Used in projection calculations">
                <input type="range" min="100" max="10000" step="100" value={settings.dca} onChange={e => updateSettings("dca", Number(e.target.value))} style={{ width: "100%", marginBottom: 4, accentColor: T.accent }} />
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 11, color: T.muted }}>฿100</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: T.accent }}>฿{fmt(settings.dca)}</span>
                  <span style={{ fontSize: 11, color: T.muted }}>฿10,000</span>
                </div>
              </Field>
              <Field label="Gemini API Key" hint="Required for AI Assistant.">
                <input style={inputStyle} type="password" value={settings.geminiApiKey || ""} onChange={e => updateSettings("geminiApiKey", e.target.value)} placeholder="AIzaSy..." />
              </Field>
            </div>

            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: 20, marginBottom: 14 }}>
              <p style={{ margin: "0 0 16px", fontSize: 13, fontWeight: 700, color: T.text }}>All Assets ({assets.length})</p>
              {assets.map(a => (
                <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: `1px solid ${T.border}` }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: a.color, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 13, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</p>
                    <p style={{ margin: 0, fontSize: 11, color: T.muted }}>฿{fmt(a.currentValue)} {a.isSpeculative ? "· Speculative" : ""}</p>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => { setEditingAsset(a); setModal("edit"); }} style={{ background: T.accentGlow, border: `1px solid ${T.accent}33`, borderRadius: 6, color: T.accent, padding: "5px 10px", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>Edit</button>
                    <button onClick={() => deleteAsset(a.id)} style={{ background: "#ef444420", border: `1px solid ${T.red}33`, borderRadius: 6, color: T.red, padding: "5px 10px", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>Del</button>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ background: "#1a0a0a", border: `1px solid ${T.red}33`, borderRadius: 14, padding: 18 }}>
              <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 700, color: T.red }}>Danger Zone</p>
              <p style={{ margin: "0 0 14px", fontSize: 12, color: T.muted }}>Reset all data to the default sample portfolio. Cannot be undone.</p>
              <button onClick={() => { if (window.confirm("Reset to defaults?")) { setAssets(DEFAULT_ASSETS); setSettings(DEFAULT_SETTINGS); } }} style={{ background: "transparent", border: `1px solid ${T.red}`, borderRadius: 8, color: T.red, padding: "9px 18px", cursor: "pointer", fontSize: 13, fontFamily: "inherit", fontWeight: 600 }}>Reset to Defaults</button>
            </div>
          </div>
        )}
      </div>

      {/* ── MODALS ── */}
      {modal === "add" && (
        <Modal title="Add New Asset" onClose={() => { setModal(null); setEditingAsset(null); }}>
          <AssetForm initial={editingAsset} usdThbRate={usdThbRate} onSave={saveAsset} onClose={() => { setModal(null); setEditingAsset(null); }} hasTransactions={false} />
        </Modal>
      )}
      {modal === "edit" && editingAsset && (
        <Modal title="Edit Asset" onClose={() => { setModal(null); setEditingAsset(null); }}>
          <AssetForm initial={editingAsset} usdThbRate={usdThbRate} onSave={saveAsset} onClose={() => { setModal(null); setEditingAsset(null); }} hasTransactions={transactions.some(t => t.asset_id === editingAsset.id && !t.sub_asset_id)} />
        </Modal>
      )}
      {modal === "update" && editingAsset && (
        <UpdateValueModal asset={editingAsset} usdThbRate={usdThbRate} onSave={(v) => updateValue(editingAsset.id, v)} onClose={() => { setModal(null); setEditingAsset(null); }} />
      )}

      {/* ── SUB-ASSET MODALS (for stock groups) ── */}
      {subModal === "add" && (
        <Modal title="Add Stock to Group" onClose={closeSub}>
          <StockSubForm usdThbRate={usdThbRate} onSave={saveSubAsset} onClose={closeSub} hasTransactions={false} />
        </Modal>
      )}
      {subModal === "edit" && editingSubAsset && (
        <Modal title={`Edit — ${editingSubAsset.name}`} onClose={closeSub}>
          <StockSubForm usdThbRate={usdThbRate} initial={editingSubAsset} onSave={saveSubAsset} onClose={closeSub} hasTransactions={transactions.some(t => t.asset_id === activeGroupId && t.sub_asset_id === editingSubAsset.id)} />
        </Modal>
      )}
      {subModal === "update" && editingSubAsset && (
        <UpdateValueModal
          asset={editingSubAsset}
          usdThbRate={usdThbRate}
          onSave={val => updateSubValue(activeGroupId, editingSubAsset.id, val)}
          onClose={closeSub} />
      )}

      {txModal && (
        <AddInvestmentModal
          asset={txModal.asset}
          subAsset={txModal.subAsset}
          initialTx={txModal.initialTx}
          usdThbRate={usdThbRate}
          onSave={saveTransaction}
          onClose={() => setTxModal(null)}
        />
      )}

      {historyModal && (
        <TransactionHistory
          asset={historyModal.asset}
          subAsset={historyModal.subAsset}
          transactions={historyModal.subAsset
            ? transactions.filter(t => t.sub_asset_id === historyModal.subAsset.id)
            : transactions.filter(t => t.asset_id === historyModal.asset.id)}
          snapshots={snapshots}
          onDelete={deleteTx}
          onEdit={tx => {
            setTxModal({ asset: historyModal.asset, subAsset: historyModal.subAsset, initialTx: tx });
            setHistoryModal(null);
          }}
          isUSD={historyModal.isUSD}
          onClose={() => setHistoryModal(null)}
        />
      )}
    </div>
  );
}
