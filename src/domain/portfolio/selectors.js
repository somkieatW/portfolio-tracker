export function partitionAssets(normalizedAssets, transactions) {
  const hasHistory = (aid, sid = null) =>
    transactions.some(t => t.asset_id === aid && (sid ? t.sub_asset_id === sid : !t.sub_asset_id));

  const activeAssets = normalizedAssets.filter(
    a => a.currentValue > 0 || a.units > 0 || a.qty > 0 || !hasHistory(a.id),
  );
  const closedAssets = normalizedAssets.filter(
    a => a.currentValue <= 0 && (a.units || 0) <= 0 && (a.qty || 0) <= 0 && hasHistory(a.id),
  );
  const investments = activeAssets.filter(a => !a.isSpeculative);
  const speculative = activeAssets.filter(a => a.isSpeculative);
  const totalInvest = investments.reduce((s, a) => s + a.currentValue, 0);

  return {
    activeAssets,
    closedAssets,
    investments,
    speculative,
    totalInvest,
    coreAssetIds: investments.map(a => a.id),
  };
}
