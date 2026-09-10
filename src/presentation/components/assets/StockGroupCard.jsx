import { useState } from "react";
import { T } from "../../theme/tokens.js";
import { fmt, fmtTs } from "../../utils/format.js";
import { groupTotals } from "../../../domain/portfolio/assetCalculations.js";
import { CATEGORY_TYPES } from "../../../domain/portfolio/constants.js";

export default function StockGroupCard({ asset, total, onEdit, onDelete, onAddSub, onEditSub, onDeleteSub, onAddInvSub, onShowHistorySub, transactions, onDeleteTx, usdThbRate }) {
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
