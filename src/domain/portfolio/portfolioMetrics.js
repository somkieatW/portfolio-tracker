import { CATEGORY_TYPES, CHART_PALETTE } from "./constants.js";

export function computePortfolioMetrics(investments, speculative, settings, totalInvest) {
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
        const colorIdx = CATEGORY_TYPES.findIndex(c => c.value === type) % CHART_PALETTE.length;
        return {
          name: cat ? cat.label : type,
          value,
          color: CHART_PALETTE[colorIdx >= 0 ? colorIdx : 0],
          pct: ((value / totalInvest) * 100).toFixed(2)
        };
      })
      .sort((a, b) => b.value - a.value); // sort largest to smallest
  })();

  return {
    totalInvested,
    totalSpec,
    netWorth,
    grandTotal,
    totalPL,
    totalPLpct,
    specPct,
    specCap,
    specOver,
    projection,
    pieData,
  };
}
