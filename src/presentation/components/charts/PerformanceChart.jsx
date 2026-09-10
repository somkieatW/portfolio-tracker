import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { performanceSummary } from "../../../domain/portfolio/performance.js";
import { T } from "../../theme/tokens.js";

const fmt = (n) => Number(n).toLocaleString("en", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

function PerfTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: "10px 14px", fontSize: 11 }}>
      <p style={{ margin: "0 0 6px", fontWeight: 700, color: T.muted }}>{d.date}</p>
      <p style={{ margin: "2px 0", color: T.text }}>Portfolio: <strong>฿{fmt(d.value)}</strong></p>
      <p style={{ margin: "2px 0", color: T.muted }}>Contributed: ฿{fmt(d.contributed)}</p>
      <p style={{ margin: "2px 0", color: d.marketGain >= 0 ? T.green : "#ef4444" }}>
        Market gain: {d.marketGain >= 0 ? "+" : ""}฿{fmt(d.marketGain)}
      </p>
      {d.benchmark != null && (
        <p style={{ margin: "2px 0", color: T.cyan }}>SET (scaled): ฿{fmt(d.benchmark)}</p>
      )}
    </div>
  );
}

export default function PerformanceChart({ series }) {
  if (!series?.length) return null;
  const summary = performanceSummary(series);
  const gainColor = (summary?.marketGain ?? 0) >= 0 ? T.green : "#ef4444";

  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: "16px 8px", marginBottom: 14 }}>
      <p style={{ margin: "0 0 4px 8px", fontSize: 11, color: T.muted, textTransform: "uppercase", letterSpacing: 1 }}>
        Value vs Contributions
      </p>
      <p style={{ margin: "0 0 12px 8px", fontSize: 10, color: T.dim, lineHeight: 1.5 }}>
        Separates deposits/withdrawals from market movement. Market gain:{" "}
        <span style={{ color: gainColor, fontWeight: 700 }}>
          {summary.marketGain >= 0 ? "+" : ""}฿{fmt(summary.marketGain)} ({summary.marketReturnPct}%)
        </span>
      </p>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={series} margin={{ top: 4, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="valGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={T.accent} stopOpacity={0.35} />
              <stop offset="100%" stopColor={T.accent} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false} />
          <XAxis dataKey="date" stroke={T.muted} tick={{ fontSize: 9 }} tickFormatter={d => d.slice(5)} interval="preserveStartEnd" />
          <YAxis stroke={T.muted} tick={{ fontSize: 9 }} tickFormatter={v => `฿${(v / 1000).toFixed(0)}k`} width={48} />
          <Tooltip content={<PerfTooltip />} />
          <Legend wrapperStyle={{ fontSize: 10, paddingTop: 8 }} />
          <Area type="monotone" dataKey="contributed" name="Net contributed" stroke={T.muted} fill="transparent" strokeWidth={2} strokeDasharray="5 4" dot={false} />
          <Area type="monotone" dataKey="value" name="Portfolio value" stroke={T.accent} fill="url(#valGrad)" strokeWidth={2} dot={false} />
          <Area type="monotone" dataKey="benchmark" name="SET index (scaled)" stroke={T.cyan} fill="transparent" strokeWidth={1.5} strokeDasharray="3 3" dot={false} connectNulls />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
