import { useState, useEffect } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import Auth from "../Auth.jsx";
import { usePortfolioApp } from "../application/hooks/usePortfolioApp.js";
import { TABS, STOCK_GROUP_TYPES } from "../domain/portfolio/constants.js";
import { calcPL } from "../domain/portfolio/assetCalculations.js";
import { buildPnlData } from "../domain/portfolio/snapshotSeries.js";
import { buildPerformanceSeries, formatPriceAge } from "../domain/portfolio/performance.js";
import { buildBenchmarkSeries, mergeBenchmarkIntoSeries } from "../domain/portfolio/benchmark.js";
import { fetchHistoricalDailyCloses } from "../infrastructure/external/yahooFinanceService.js";
import { T } from "./theme/tokens.js";
import { fmt, fmtTs } from "./utils/format.js";
import SaveBadge from "./components/common/SaveBadge.jsx";
import Field from "./components/common/Field.jsx";
import Modal from "./components/common/Modal.jsx";
import AssetForm from "./components/assets/AssetForm.jsx";
import AssetCard from "./components/assets/AssetCard.jsx";
import StockGroupCard from "./components/assets/StockGroupCard.jsx";
import StockSubForm from "./components/assets/StockSubForm.jsx";
import AddInvestmentModal from "./components/modals/AddInvestmentModal.jsx";
import UpdateValueModal from "./components/modals/UpdateValueModal.jsx";
import TransactionHistory from "./components/modals/TransactionHistory.jsx";
import PerformanceChart from "./components/charts/PerformanceChart.jsx";
import SnapshotChartPanel from "./components/charts/SnapshotChartPanel.jsx";
import SnapshotRangeSelector from "./components/charts/SnapshotRangeSelector.jsx";
import { CustomTip } from "./components/charts/ChartTooltips.jsx";
import PriceSyncBanner from "./components/sync/PriceSyncBanner.jsx";

export default function App() {
  const app = usePortfolioApp();

  const {
    session,
    isAuthLoading,
    userId,
    assets,
    settings,
    tab,
    setTab,
    modal,
    setModal,
    snapshots,
    snapshotRange,
    setSnapshotRange,
    snapshotLoading,
    editingAsset,
    setEditingAsset,
    saveStatus,
    loadStatus,
    cacheInfo,
    lastSnapshot,
    priceRefreshing,
    usdThbRate,
    dragOverId,
    setDragOverId,
    dragSrcId,
    subModal,
    setSubModal,
    activeGroupId,
    setActiveGroupId,
    editingSubAsset,
    setEditingSubAsset,
    transactions,
    txModal,
    setTxModal,
    historyModal,
    setHistoryModal,
    supabase,
    normalizedAssets,
    investments,
    speculative,
    coreAssetIds,
    totalInvest,
    totalInvested,
    totalSpec,
    netWorth,
    totalPL,
    totalPLpct,
    specPct,
    specCap,
    specOver,
    pieData,
    handleRefreshPrices,
    saveAsset,
    deleteAsset,
    updateValue,
    updateSettings,
    closeSub,
    saveSubAsset,
    deleteSubAsset,
    updateSubValue,
    saveTransaction,
    deleteTx,
    reorderAssets,
    resetToDefaults,
    showClosed,
    setShowClosed,
    closedAssets,
  } = app;

  const [perfWithBenchmark, setPerfWithBenchmark] = useState([]);

  useEffect(() => {
    if (tab !== "history" || !snapshots.length) {
      setPerfWithBenchmark([]);
      return;
    }
    const base = buildPerformanceSeries(snapshots, transactions, coreAssetIds, totalInvest);
    const from = snapshots[0].snapshot_date;
    const to = snapshots[snapshots.length - 1].snapshot_date;
    fetchHistoricalDailyCloses("^SET.BK", from, to)
      .then(closes => {
        const bench = buildBenchmarkSeries(snapshots, closes);
        setPerfWithBenchmark(mergeBenchmarkIntoSeries(base, bench));
      })
      .catch(() => setPerfWithBenchmark(base));
  }, [tab, snapshots, transactions, coreAssetIds, totalInvest]);

  if (isAuthLoading || (userId && loadStatus === "loading")) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", flexDirection: "column", gap: 16, background: T.bg }}>
        <div style={{ width: 40, height: 40, border: `3px solid ${T.border}`, borderTop: `3px solid ${T.accent}`, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <p style={{ color: T.muted, fontSize: 14 }}>{isAuthLoading ? "Checking session…" : "Loading your portfolio…"}</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!userId) {
    return <Auth />;
  }

  const pnlData = buildPnlData(snapshots, totalInvest);
  const perfSeries = perfWithBenchmark.length
    ? perfWithBenchmark
    : buildPerformanceSeries(snapshots, transactions, coreAssetIds, totalInvest);

  return (
    <div style={{ background: T.bg, minHeight: "100vh", color: T.text, fontFamily: "'Inter', sans-serif" }}>

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

          <div style={{ display: "flex", marginTop: 20, overflowX: "auto" }}>
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{ background: "none", border: "none", padding: "12px 14px", color: tab === t.id ? T.accent : T.muted, borderBottom: tab === t.id ? `2px solid ${T.accent}` : "2px solid transparent", cursor: "pointer", fontSize: 12, fontWeight: tab === t.id ? 700 : 400, fontFamily: "inherit", whiteSpace: "nowrap" }}>{t.label}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 700, margin: "0 auto", padding: "24px 16px" }}>

        {tab === "dashboard" && (
          <div>
            <PriceSyncBanner
              cacheInfo={cacheInfo}
              lastSnapshot={lastSnapshot}
              refreshing={priceRefreshing}
              onRefresh={handleRefreshPrices}
            />
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
                  if (!el || !el.closest("[data-drag-handle]")) {
                    e.preventDefault();
                    return;
                  }
                  dragSrcId.current = a.id;
                },
                onDragEnd: () => { dragSrcId.current = null; setDragOverId(null); },
                onDragOver: (e) => { e.preventDefault(); setDragOverId(a.id); },
                onDrop: () => reorderAssets(dragSrcId.current, a.id),
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
                    onShowHistorySub={(sub) => setHistoryModal({ asset: a, subAsset: sub, isUSD: sub.currency === "USD" })}
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
                    onShowHistory={() => setHistoryModal({ asset: a, isUSD: a.currency === "USD" })}
                    transactions={transactions.filter(t => t.asset_id === a.id)}
                    onDeleteTx={deleteTx} />
                </div>
              );
            })}

            {closedAssets.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <button
                  onClick={() => setShowClosed(v => !v)}
                  style={{
                    width: "100%", padding: "10px 14px", borderRadius: 10,
                    border: `1px solid ${T.border}`, background: T.surface,
                    color: T.muted, cursor: "pointer", fontSize: 12, fontWeight: 600,
                    fontFamily: "inherit", textAlign: "left",
                  }}
                >
                  {showClosed ? "▾" : "▸"} Closed positions ({closedAssets.length})
                </button>
                {showClosed && closedAssets.map(a => (
                  <div key={a.id} style={{ opacity: 0.75, marginTop: 8 }}>
                    <AssetCard
                      asset={a}
                      total={totalInvest || 1}
                      usdThbRate={usdThbRate}
                      onEdit={() => { setEditingAsset(a); setModal("edit"); }}
                      onUpdateValue={() => { setEditingAsset(a); setModal("update"); }}
                      onDelete={() => deleteAsset(a.id)}
                      onAddInvestment={() => setTxModal({ asset: a })}
                      onShowHistory={() => setHistoryModal({ asset: a, isUSD: a.currency === "USD" })}
                      transactions={transactions.filter(t => t.asset_id === a.id)}
                      onDeleteTx={deleteTx}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

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
                onShowHistory={() => setHistoryModal({ asset: a, isUSD: a.currency === "USD" })}
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

        {tab === "history" && (
          <div>
            <SnapshotRangeSelector snapshotRange={snapshotRange} setSnapshotRange={setSnapshotRange} />

            {snapshotLoading && (
              <div style={{ textAlign: "center", padding: 40, color: T.muted, fontSize: 13 }}>Loading history…</div>
            )}

            {!snapshotLoading && snapshots.length === 0 && (
              <div style={{ textAlign: "center", padding: 40, color: T.muted }}>
                <p style={{ fontSize: 32, marginBottom: 12 }}>📊</p>
                <p>No snapshot data yet. Snapshots are recorded automatically at midnight ICT each day.</p>
                <p style={{ fontSize: 12, marginTop: 8, color: T.dim }}>Snapshots run every 3 hours via GitHub Actions. To fill historical gaps, run the <strong>Backfill portfolio snapshots</strong> workflow in GitHub Actions.</p>
              </div>
            )}

            {!snapshotLoading && snapshots.length > 0 && (
              <>
                <PerformanceChart series={perfSeries} />
                <SnapshotChartPanel
                  pnlData={pnlData}
                  lastVal={totalInvest}
                  snapshotRange={snapshotRange}
                  candleTitle="Net Worth History (1D)"
                />
              </>
            )}
          </div>
        )}

        {tab === "settings" && (
          <div>
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: 20, marginBottom: 14 }}>
              <p style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 700, color: T.text }}>Sync Health</p>
              <div style={{ display: "grid", gap: 8, marginBottom: 16, fontSize: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${T.border}` }}>
                  <span style={{ color: T.muted }}>Price cache</span>
                  <span style={{ color: cacheInfo?.updatedAt && !formatPriceAge(cacheInfo.updatedAt).stale ? T.green : T.orange }}>
                    {cacheInfo?.updatedAt ? formatPriceAge(cacheInfo.updatedAt).label : "Not loaded"}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${T.border}` }}>
                  <span style={{ color: T.muted }}>Latest snapshot</span>
                  <span style={{ color: lastSnapshot ? T.text : T.orange }}>
                    {lastSnapshot ? `${lastSnapshot.snapshot_date} (${fmtTs(lastSnapshot.snapshot_at)?.split(" ")[1] ?? ""})` : "None recorded"}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0" }}>
                  <span style={{ color: T.muted }}>Auto sync</span>
                  <span style={{ color: T.dim }}>GitHub Action every 3h</span>
                </div>
              </div>
              <button
                onClick={handleRefreshPrices}
                disabled={priceRefreshing}
                style={{ width: "100%", padding: "11px", borderRadius: 10, border: `1px solid ${T.accent}55`, background: T.accentGlow, color: T.accent, fontSize: 13, fontWeight: 700, cursor: priceRefreshing ? "wait" : "pointer", fontFamily: "inherit" }}
              >
                {priceRefreshing ? "Refreshing prices…" : "↻ Refresh prices now"}
              </button>
            </div>

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
              <button onClick={() => { if (window.confirm("Reset to defaults?")) resetToDefaults(); }} style={{ background: "transparent", border: `1px solid ${T.red}`, borderRadius: 8, color: T.red, padding: "9px 18px", cursor: "pointer", fontSize: 13, fontFamily: "inherit", fontWeight: 600 }}>Reset to Defaults</button>
            </div>
          </div>
        )}
      </div>

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
          liveValue={(() => {
            const parent = normalizedAssets.find(a => a.id === historyModal.asset.id);
            if (historyModal.subAsset) {
              return parent?.subAssets?.find(s => s.id === historyModal.subAsset.id)?.currentValue
                ?? historyModal.subAsset.currentValue;
            }
            return parent?.currentValue ?? historyModal.asset.currentValue;
          })()}
          snapshotRange={snapshotRange}
          setSnapshotRange={setSnapshotRange}
          snapshotLoading={snapshotLoading}
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
