import { useState, useEffect, useCallback } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid } from "recharts";
import { loadPortfolio, savePortfolio, getDeviceId, supabase } from "./supabase.js";
import Auth from "./Auth.jsx";

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
  { value: "forex", label: "Forex / Speculation" },
  { value: "crypto", label: "Crypto" },
  { value: "cash", label: "Cash / Savings" },
  { value: "property", label: "Property / REIT" },
  { value: "other", label: "Other" },
];

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
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 24px 0" }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: T.text }}>{title}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: T.muted, cursor: "pointer", fontSize: 22, lineHeight: 1, padding: 4 }}>×</button>
        </div>
        <div style={{ padding: 24 }}>{children}</div>
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

const inputStyle = { width: "100%", boxSizing: "border-box", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, fontSize: 14, padding: "10px 12px", fontFamily: "inherit", outline: "none" };
const selectStyle = { ...inputStyle, cursor: "pointer" };

// ─── ASSET FORM ───────────────────────────────────────────────────────────────
function AssetForm({ initial, onSave, onClose }) {
  const blank = { name: "", type: "equity", invested: "", currentValue: "", currency: "THB", color: PALETTE[Math.floor(Math.random() * PALETTE.length)], notes: "", isSpeculative: false };
  const [form, setForm] = useState(initial ? { ...initial, invested: initial.invested ?? "", currentValue: initial.currentValue ?? "" } : blank);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSave = () => {
    if (!form.name.trim()) return alert("Please enter an asset name");
    onSave({ ...form, id: form.id || uid(), invested: parseFloat(form.invested) || 0, currentValue: parseFloat(form.currentValue) || 0 });
  };

  return (
    <>
      <Field label="Asset Name">
        <input style={inputStyle} value={form.name} onChange={e => set("name", e.target.value)} placeholder="e.g. K-US500X-A" />
      </Field>
      <Field label="Category Type">
        <select style={selectStyle} value={form.type} onChange={e => set("type", e.target.value)}>
          {CATEGORY_TYPES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Initial Invested (฿)">
          <input style={inputStyle} type="number" value={form.invested} onChange={e => set("invested", e.target.value)} placeholder="0" />
        </Field>
        <Field label="Current Value (฿)">
          <input style={inputStyle} type="number" value={form.currentValue} onChange={e => set("currentValue", e.target.value)} placeholder="0" />
        </Field>
      </div>
      <Field label="Color">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {PALETTE.map(c => (
            <div key={c} onClick={() => set("color", c)} style={{ width: 28, height: 28, borderRadius: 6, background: c, cursor: "pointer", border: form.color === c ? `3px solid ${T.text}` : "2px solid transparent", boxSizing: "border-box" }} />
          ))}
        </div>
      </Field>
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

// ─── UPDATE VALUE MODAL ───────────────────────────────────────────────────────
function UpdateValueModal({ asset, onSave, onClose }) {
  const [val, setVal] = useState(asset.currentValue);
  const pl = parseFloat(val) - asset.invested;
  const plPct = asset.invested > 0 ? (pl / asset.invested) * 100 : 0;
  return (
    <Modal title={`Update — ${asset.name}`} onClose={onClose}>
      <Field label="Current Market Value (฿)" hint="Enter today's latest value">
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
        <button onClick={() => onSave(parseFloat(val) || 0)} style={{ flex: 2, padding: "11px 0", borderRadius: 10, border: "none", background: T.green, color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 700, fontFamily: "inherit" }}>Update Value</button>
      </div>
    </Modal>
  );
}

// ─── ASSET CARD ───────────────────────────────────────────────────────────────
function AssetCard({ asset, total, onEdit, onUpdateValue, onDelete }) {
  const [hovered, setHovered] = useState(false);
  const { pl, plPct } = calcPL(asset);
  const pct = ((asset.currentValue / total) * 100).toFixed(1);
  const isUp = pl >= 0;
  return (
    <div onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ background: hovered ? T.cardHover : T.card, border: `1px solid ${hovered ? T.borderLight : T.border}`, borderLeft: `3px solid ${asset.color}`, borderRadius: 12, padding: "16px 18px", marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{asset.name}</p>
            {asset.isSpeculative && <span style={{ background: "#f9731620", color: T.orange, border: `1px solid ${T.orange}44`, borderRadius: 4, padding: "1px 6px", fontSize: 10, fontWeight: 700 }}>SPEC</span>}
          </div>
          <p style={{ margin: "0 0 2px", fontSize: 11, color: T.muted }}>{CATEGORY_TYPES.find(c => c.value === asset.type)?.label} · {pct}% of portfolio</p>
          {asset.notes && <p style={{ margin: "4px 0 0", fontSize: 11, color: T.dim, lineHeight: 1.5 }}>{asset.notes}</p>}
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <p style={{ margin: "0 0 3px", fontWeight: 800, fontSize: 16, color: T.text }}>฿{fmt(asset.currentValue)}</p>
          {asset.invested > 0 && (
            <p style={{ margin: "0 0 3px", fontSize: 12, color: isUp ? T.green : T.red, fontWeight: 600 }}>
              {isUp ? "▲" : "▼"} ฿{fmt(Math.abs(pl))} ({isUp ? "+" : "-"}{Math.abs(plPct).toFixed(1)}%)
            </p>
          )}
          <p style={{ margin: 0, fontSize: 11, color: T.muted }}>Cost: ฿{fmt(asset.invested)}</p>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.border}`, opacity: hovered ? 1 : 0.35 }}>
        {[
          { label: "📈 Update Value", onClick: onUpdateValue, color: T.green },
          { label: "✏️ Edit", onClick: onEdit, color: T.accent },
          { label: "🗑 Delete", onClick: onDelete, color: T.red },
        ].map(btn => (
          <button key={btn.label} onClick={btn.onClick} style={{ flex: 1, padding: "7px 0", borderRadius: 8, border: `1px solid ${btn.color}44`, background: `${btn.color}11`, color: btn.color, cursor: "pointer", fontSize: 12, fontFamily: "inherit", fontWeight: 600 }}>{btn.label}</button>
        ))}
      </div>
    </div>
  );
}

// ─── CUSTOM TOOLTIP ───────────────────────────────────────────────────────────
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

// ─── APP ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [session, setSession] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [assets, setAssets] = useState(DEFAULT_ASSETS);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [tab, setTab] = useState("dashboard");
  const [modal, setModal] = useState(null);
  const [editingAsset, setEditingAsset] = useState(null);
  const [saveStatus, setSaveStatus] = useState(null);
  const [loadStatus, setLoadStatus] = useState("loading"); // loading | ready | error

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
        const data = await loadPortfolio(userId);
        if (data?.assets) setAssets(data.assets);
        if (data?.settings) setSettings(data.settings);
        setLoadStatus("ready");
      } catch {
        setLoadStatus("error");
      }
    }
    load();
  }, [userId]);

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
  const investments = assets.filter(a => !a.isSpeculative);
  const speculative = assets.filter(a => a.isSpeculative);
  const totalInvest = investments.reduce((s, a) => s + a.currentValue, 0);
  const totalInvested = investments.reduce((s, a) => s + a.invested, 0);
  const totalSpec = speculative.reduce((s, a) => s + a.currentValue, 0);
  const netWorth = totalInvest + totalSpec;
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

  const pieData = investments.map(a => ({ name: a.name, value: a.currentValue, color: a.color, pct: ((a.currentValue / totalInvest) * 100).toFixed(1) }));

  const saveAsset = (asset) => {
    setAssets(prev => prev.find(a => a.id === asset.id) ? prev.map(a => a.id === asset.id ? asset : a) : [...prev, asset]);
    setModal(null); setEditingAsset(null);
  };

  const deleteAsset = (id) => {
    if (window.confirm("Delete this asset?")) setAssets(prev => prev.filter(a => a.id !== id));
  };

  const updateValue = (id, val) => {
    setAssets(prev => prev.map(a => a.id === id ? { ...a, currentValue: val } : a));
    setModal(null); setEditingAsset(null);
  };

  const updateSettings = (key, val) => setSettings(prev => ({ ...prev, [key]: val }));

  const TABS = [
    { id: "dashboard", label: "Dashboard" },
    { id: "assets", label: "Assets" },
    { id: "speculative", label: "⚡ Speculation" },
    { id: "projection", label: "Projection" },
    { id: "settings", label: "⚙ Settings" },
  ];

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
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 0 }}>
            {[
              { label: "Net Worth", value: `฿${fmt(netWorth)}`, color: T.text, sub: "All assets combined" },
              { label: "Investments", value: `฿${fmt(totalInvest)}`, color: T.muted, sub: "Long-term core" },
              { label: "Speculation", value: `฿${fmt(totalSpec)}`, color: specOver > 0 ? T.orange : T.purple, sub: specOver > 0 ? `⚠ over ${settings.specCap}% size` : `✓ ${specPct.toFixed(1)}% of core` },
              { label: "Investment P&L", value: `${totalPL >= 0 ? "+" : ""}฿${fmt(Math.abs(totalPL))}`, color: totalPL >= 0 ? T.green : T.red, sub: `${totalPLpct >= 0 ? "+" : ""}${totalPLpct.toFixed(2)}%` },
            ].map(s => (
              <div key={s.label} style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${T.border}`, borderRadius: 10, padding: "12px 14px" }}>
                <p style={{ margin: "0 0 4px", fontSize: 9, color: T.muted, textTransform: "uppercase", letterSpacing: 1 }}>{s.label}</p>
                <p style={{ margin: "0 0 2px", fontSize: 15, fontWeight: 800, color: s.color }}>{s.value}</p>
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
                  <div key={a.id} style={{ width: `${(a.currentValue / grandTotal) * 100}%`, background: a.color }} title={a.name} />
                ))}
                {speculative.map(a => (
                  <div key={a.id} style={{ width: `${(a.currentValue / grandTotal) * 100}%`, background: a.color, opacity: 0.55 }} title={a.name + " (spec)"} />
                ))}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px" }}>
                {assets.map(a => (
                  <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: a.color, opacity: a.isSpeculative ? 0.6 : 1 }} />
                    <span style={{ fontSize: 10, color: T.muted }}>{a.name.split(" (")[0].split(" ").slice(0, 2).join(" ")} {((a.currentValue / grandTotal) * 100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Pie + top performers */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
              <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: 16 }}>
                <p style={{ margin: "0 0 8px", fontSize: 11, color: T.muted, textTransform: "uppercase", letterSpacing: 1 }}>Investments</p>
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
                      <span style={{ fontSize: 12, fontWeight: 700, color: plPct >= 0 ? T.green : T.red }}>{plPct >= 0 ? "+" : ""}{plPct.toFixed(1)}%</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Quick update */}
            <p style={{ fontSize: 11, color: T.muted, textTransform: "uppercase", letterSpacing: 1.5, margin: "0 0 12px" }}>Quick Update Values</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {assets.map(a => (
                <div key={a.id} onClick={() => { setEditingAsset(a); setModal("update"); }}
                  style={{ background: T.card, border: `1px solid ${T.border}`, borderLeft: `3px solid ${a.color}`, borderRadius: 10, padding: "12px 14px", cursor: "pointer" }}>
                  <p style={{ margin: "0 0 2px", fontSize: 12, fontWeight: 700, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.name.split(" (")[0]}</p>
                  <p style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 800, color: a.color }}>฿{fmt(a.currentValue)}</p>
                  <p style={{ margin: 0, fontSize: 10, color: T.dim }}>Tap to update →</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ASSETS */}
        {tab === "assets" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <p style={{ margin: 0, fontSize: 11, color: T.muted, textTransform: "uppercase", letterSpacing: 1 }}>{investments.length} Investment Assets · ฿{fmt(totalInvest)}</p>
              <button onClick={() => { setEditingAsset(null); setModal("add"); }} style={{ background: T.accentGlow, border: `1px solid ${T.accent}44`, borderRadius: 8, color: T.accent, padding: "7px 14px", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "inherit" }}>+ Add</button>
            </div>
            {investments.length === 0 && (
              <div style={{ textAlign: "center", padding: "60px 20px", color: T.muted }}>
                <p style={{ fontSize: 40, marginBottom: 12 }}>📊</p>
                <p>No investment assets yet. Add your first one!</p>
              </div>
            )}
            {investments.map(a => (
              <AssetCard key={a.id} asset={a} total={totalInvest}
                onEdit={() => { setEditingAsset(a); setModal("edit"); }}
                onUpdateValue={() => { setEditingAsset(a); setModal("update"); }}
                onDelete={() => deleteAsset(a.id)} />
            ))}
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
                    {specOver > 0 ? `⚠️ ${specPct.toFixed(1)}% — Over Target Limit (${settings.specCap}%)` : `✓ ${specPct.toFixed(1)}% — Within Limit (${settings.specCap}%)`}
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
              <AssetCard key={a.id} asset={a} total={totalSpec || 1}
                onEdit={() => { setEditingAsset(a); setModal("edit"); }}
                onUpdateValue={() => { setEditingAsset(a); setModal("update"); }}
                onDelete={() => deleteAsset(a.id)} />
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
          <AssetForm initial={editingAsset} onSave={saveAsset} onClose={() => { setModal(null); setEditingAsset(null); }} />
        </Modal>
      )}
      {modal === "edit" && editingAsset && (
        <Modal title="Edit Asset" onClose={() => { setModal(null); setEditingAsset(null); }}>
          <AssetForm initial={editingAsset} onSave={saveAsset} onClose={() => { setModal(null); setEditingAsset(null); }} />
        </Modal>
      )}
      {modal === "update" && editingAsset && (
        <UpdateValueModal asset={editingAsset} onSave={(v) => updateValue(editingAsset.id, v)} onClose={() => { setModal(null); setEditingAsset(null); }} />
      )}
    </div>
  );
}
