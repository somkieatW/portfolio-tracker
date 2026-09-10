import { useState } from "react";
import { T } from "../../theme/tokens.js";
import { fmt, fmtTs } from "../../utils/format.js";
import { calcPL } from "../../../domain/portfolio/assetCalculations.js";
import { CATEGORY_TYPES } from "../../../domain/portfolio/constants.js";
import { formatPriceAge } from "../../../domain/portfolio/performance.js";

export default function AssetCard({ asset, total, onEdit, onUpdateValue, onDelete, onAddInvestment, onShowHistory, transactions, onDeleteTx, usdThbRate }) {
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
            {(hasFinnomenaCode || hasYahooSymbol) && priceTs && (() => {
              const { label, stale } = formatPriceAge(priceTs);
              return (
                <span title={`Price updated ${label}`} style={{ background: stale ? "#f9731620" : "#3b82f615", color: stale ? T.orange : T.accent, border: `1px solid ${stale ? T.orange : T.accent}44`, borderRadius: 4, padding: "1px 6px", fontSize: 10, fontWeight: 600 }}>
                  {stale ? "⚠" : "🕐"} {label}
                </span>
              );
            })()}
            {(missingUnits || missingQty) && <span title="Add units/qty to enable auto-fetch" style={{ background: "#f9731620", color: T.orange, border: `1px solid ${T.orange}44`, borderRadius: 4, padding: "1px 6px", fontSize: 10, fontWeight: 700 }}>⚠ Set amount</span>}
          </div>
          <p style={{ margin: "0 0 2px", fontSize: 11, color: T.muted }}>{CATEGORY_TYPES.find(c => c.value === asset.type)?.label} · {pct}% of portfolio</p>
          {(hasFinnomenaCode || hasYahooSymbol) && (
            <p style={{ margin: "2px 0 0", fontSize: 10, color: T.dim }}>
              {asset.finnomenaCode || asset.yahooSymbol}{(asset.units > 0 || asset.qty > 0) ? ` · ${fmt(asset.units || asset.qty, 4)} units` : ""}
              {avgCost ? ` · avg ฿${fmt(avgCost, 4)}/unit` : ""}
            </p>
          )}
          {priceTs && !hasFinnomenaCode && !hasYahooSymbol && <p style={{ margin: "2px 0 0", fontSize: 10, color: T.dim }}>🕐 {priceTs}</p>}
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
