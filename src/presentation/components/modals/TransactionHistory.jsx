import { T } from "../../theme/tokens.js";
import { fmt } from "../../utils/format.js";
import { buildAssetSnapshotRows, buildPnlData } from "../../../domain/portfolio/snapshotSeries.js";
import Modal from "../common/Modal.jsx";
import SnapshotRangeSelector from "../charts/SnapshotRangeSelector.jsx";
import SnapshotChartPanel from "../charts/SnapshotChartPanel.jsx";

export default function TransactionHistory({ asset, subAsset, transactions, onDelete, onEdit, onClose, isUSD, snapshots, liveValue, snapshotRange, setSnapshotRange, snapshotLoading }) {
  const name = subAsset ? subAsset.name : asset.name;
  const targetId = subAsset ? subAsset.id : asset.id;
  const assetRows = buildAssetSnapshotRows(snapshots, targetId);
  const pnlData = buildPnlData(assetRows, liveValue);
  const lastVal = liveValue ?? pnlData[pnlData.length - 1]?.close ?? 0;

  return (
    <Modal title={`History — ${name}`} onClose={onClose}>
      <SnapshotRangeSelector snapshotRange={snapshotRange} setSnapshotRange={setSnapshotRange} />

      {snapshotLoading ? (
        <div style={{ textAlign: "center", padding: 30, color: T.muted, fontSize: 13, marginBottom: 16 }}>Loading history…</div>
      ) : pnlData.length === 0 ? (
        <div style={{ padding: "30px 16px", background: "rgba(0,0,0,0.2)", borderRadius: 8, fontSize: 13, color: T.muted, textAlign: "center", marginBottom: 16 }}>
          No snapshot history available for this asset yet.
        </div>
      ) : (
        <SnapshotChartPanel
          pnlData={pnlData}
          lastVal={lastVal}
          snapshotRange={snapshotRange}
          candleTitle="Asset Value History (1D)"
        />
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
