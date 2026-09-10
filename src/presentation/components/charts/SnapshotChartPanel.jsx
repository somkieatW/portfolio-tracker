import { ResponsiveContainer, ComposedChart, Line, Bar, BarChart, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from "recharts";
import { T } from "../../theme/tokens.js";
import { fmt } from "../../utils/format.js";
import { SNAPSHOT_RANGES } from "../../../domain/portfolio/snapshotSeries.js";
import Candle from "./Candle.jsx";
import { PnLTooltip, OhlcTooltip } from "./ChartTooltips.jsx";

export default function SnapshotChartPanel({ pnlData, lastVal, snapshotRange, candleTitle = "Value History (1D)" }) {
  const firstVal = pnlData[0]?.close ?? 0;
  const change = lastVal - firstVal;
  const changePct = firstVal > 0 ? ((change / firstVal) * 100).toFixed(2) : "0.00";
  const pnlColor = change >= 0 ? T.green : T.red;
  const rangeLabel = SNAPSHOT_RANGES.find(r => r.days === snapshotRange)?.label ?? "All";

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
        {[
          { label: "Current", value: `฿${fmt(lastVal)}`, color: T.text },
          { label: "Change", value: `${change >= 0 ? "+" : "-"}฿${fmt(Math.abs(change))}`, color: pnlColor },
          { label: `Return (${rangeLabel})`, value: `${change >= 0 ? "+" : ""}${changePct}%`, color: pnlColor },
        ].map(s => (
          <div key={s.label} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: "12px 14px" }}>
            <p style={{ margin: "0 0 4px", fontSize: 9, color: T.muted, textTransform: "uppercase", letterSpacing: 1 }}>{s.label}</p>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>

      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: "16px 8px", marginBottom: 14 }}>
        <p style={{ margin: "0 0 12px 8px", fontSize: 11, color: T.muted, textTransform: "uppercase", letterSpacing: 1 }}>{candleTitle}</p>
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={pnlData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false} />
            <XAxis dataKey="date" stroke={T.muted} tick={{ fontSize: 9 }} tickFormatter={d => d.slice(5)} interval="preserveStartEnd" minTickGap={10} />
            <YAxis
              stroke={T.muted}
              tick={{ fontSize: 9 }}
              tickFormatter={v => `฿${(v / 1000).toFixed(1)}k`}
              width={48}
              domain={[(dataMin) => dataMin - 600, (dataMax) => dataMax + 600]}
              allowDataOverflow={true}
            />
            <Tooltip content={<OhlcTooltip />} />
            <Line dataKey="high" stroke="none" dot={false} connectNulls />
            <Line dataKey="low" stroke="none" dot={false} connectNulls />
            <Bar
              dataKey={(d) => [d.open, d.close]}
              barSize={12}
              stroke={T.border}
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

      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: "16px 8px", marginBottom: 16 }}>
        <p style={{ margin: "0 0 12px 8px", fontSize: 11, color: T.muted, textTransform: "uppercase", letterSpacing: 1 }}>Daily P&amp;L</p>
        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={pnlData} margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false} />
            <XAxis dataKey="date" stroke={T.muted} tick={{ fontSize: 9 }} tickFormatter={d => d.slice(5)} interval="preserveStartEnd" minTickGap={10} />
            <YAxis stroke={T.muted} tick={{ fontSize: 9 }} tickFormatter={v => `${v > 0 ? "+" : ""}${(v / 1000).toFixed(1)}k`} width={48} />
            <Tooltip content={<PnLTooltip />} />
            <Bar dataKey="pnl" radius={[4, 4, 0, 0]} barSize={16}>
              {pnlData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.pnl >= 0 ? T.green : T.red} opacity={0.8} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}
