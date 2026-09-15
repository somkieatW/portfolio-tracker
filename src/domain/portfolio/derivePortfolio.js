import {
  calcDerivedTotals,
  isManualIncomeAsset,
  sanitizeAsset,
} from "./assetCalculations.js";
import { manualIncomeState } from "./manualIncomeLedger.js";

export function derivePortfolioAssets(assets, transactions, usdThbRate) {
  return assets.map(asset => {
    let derived = { ...asset };
    const isUSD = asset.currency === "USD";

    // Top-level asset (e.g. fund, crypto, generic stock)
    const assetTxs = transactions.filter(t => t.asset_id === asset.id && !t.sub_asset_id && (t.type === 'buy' || t.type === 'sell'));
    let principal = Number(asset.invested) || 0;

    if (assetTxs.length > 0) {
      const { invThb, invUsd, totalUnits, totalQty } = calcDerivedTotals(assetTxs, isUSD);

      derived.invested = invThb;
      principal = invThb;
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

    if (isManualIncomeAsset(asset)) {
      const ledgerTxs = transactions.filter(t => t.asset_id === asset.id && !t.sub_asset_id);
      const { principal: ledgerPrincipal, value } = manualIncomeState(ledgerTxs);
      if (ledgerTxs.some(t => t.type === "buy" || t.type === "sell" || t.type === "interest" || t.type === "dividend")) {
        derived.invested = ledgerPrincipal;
        derived.currentValue = value;
      }
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
}
