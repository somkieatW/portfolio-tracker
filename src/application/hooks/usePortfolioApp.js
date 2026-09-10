import { useState, useEffect, useRef } from "react";
import { DEFAULT_ASSETS, DEFAULT_SETTINGS } from "../../domain/portfolio/constants.js";
import { normalizeAssets, sanitizeAsset } from "../../domain/portfolio/assetCalculations.js";
import { derivePortfolioAssets } from "../../domain/portfolio/derivePortfolio.js";
import { partitionAssets } from "../../domain/portfolio/selectors.js";
import { computePortfolioMetrics } from "../../domain/portfolio/portfolioMetrics.js";
import { normalizeYahooSymbol, getCacheEntry } from "../../domain/pricing/yahooSymbol.js";
import { applyPriceCacheToAssets, refreshPortfolioPrices, summarizeCacheInfo } from "../services/priceCacheService.js";
import {
  loadPortfolio,
  savePortfolio,
  getDeviceId,
  supabase,
  getPriceCache,
  isCacheStale,
  getTransactions,
  addTransaction,
  updateTransaction,
  deleteTransaction,
  getPortfolioSnapshots,
  getLatestSnapshot,
} from "../../infrastructure/persistence/supabase.js";
import { fetchCurrentNAV } from "../../infrastructure/external/finnomenaService.js";
import { fetchStockPrice, fetchUSDTHBRate } from "../../infrastructure/external/yahooFinanceService.js";
import { uid } from "../../presentation/utils/format.js";

export function usePortfolioApp() {
  const [session, setSession] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [assets, setAssets] = useState(DEFAULT_ASSETS);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [tab, setTab] = useState("dashboard");
  const [showClosed, setShowClosed] = useState(false);
  const [modal, setModal] = useState(null);
  const [snapshots, setSnapshots] = useState([]);
  const [snapshotRange, setSnapshotRange] = useState(30);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const snapshotCache = useRef({});
  const [editingAsset, setEditingAsset] = useState(null);
  const [saveStatus, setSaveStatus] = useState(null);
  const [loadStatus, setLoadStatus] = useState("loading");
  const [cacheInfo, setCacheInfo] = useState(null);
  const [lastSnapshot, setLastSnapshot] = useState(null);
  const [priceRefreshing, setPriceRefreshing] = useState(false);
  const [usdThbRate, setUsdThbRate] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const dragSrcId = useRef(null);
  const [subModal, setSubModal] = useState(null);
  const [activeGroupId, setActiveGroupId] = useState(null);
  const [editingSubAsset, setEditingSubAsset] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [txModal, setTxModal] = useState(null);
  const [historyModal, setHistoryModal] = useState(null);

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

  useEffect(() => {
    if (!userId) return;
    async function load() {
      try {
        const [data, txs] = await Promise.all([
          loadPortfolio(userId),
          getTransactions(userId),
        ]);
        if (data?.assets) setAssets(data.assets);
        if (data?.settings) setSettings(data.settings);
        setTransactions(txs || []);
        setLoadStatus("ready");
      } catch {
        setLoadStatus("error");
      }
    }
    load();
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    getLatestSnapshot(userId).then(setLastSnapshot);
  }, [userId, snapshots.length]);

  useEffect(() => {
    if (loadStatus !== "ready") return;

    async function applyCache() {
      const symbols = new Set();
      for (const a of assets) {
        if (a.finnomenaCode?.trim()) symbols.add(a.finnomenaCode.trim());
        if (a.yahooSymbol?.trim()) symbols.add(normalizeYahooSymbol(a.yahooSymbol));
        for (const sub of a.subAssets || []) {
          if (sub.yahooSymbol?.trim()) symbols.add(normalizeYahooSymbol(sub.yahooSymbol));
        }
      }
      symbols.add("USDTHB=X");
      if (symbols.size === 0) return;

      const cache = await getPriceCache([...symbols]);
      if (cache.size === 0) return;

      if (cache.has("USDTHB=X")) setUsdThbRate(cache.get("USDTHB=X").price);

      setCacheInfo(summarizeCacheInfo(cache));
      setAssets(prev => applyPriceCacheToAssets(prev, cache));
    }
    applyCache();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadStatus]);

  useEffect(() => {
    if (loadStatus !== "ready" || !usdThbRate) return;
    setAssets(prev => {
      const sanitized = prev.map(a => sanitizeAsset(a, usdThbRate));
      if (JSON.stringify(sanitized) === JSON.stringify(prev)) return prev;
      console.log("[Migration] Sanitizing legacy asset data structure...");
      return sanitized;
    });
  }, [loadStatus, usdThbRate]);

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

  const derivedAssets = derivePortfolioAssets(assets, transactions, usdThbRate);
  const normalizedAssets = normalizeAssets(derivedAssets);
  const {
    activeAssets,
    closedAssets,
    investments,
    speculative,
    totalInvest,
    coreAssetIds,
  } = partitionAssets(normalizedAssets, transactions);

  const {
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
  } = computePortfolioMetrics(investments, speculative, settings, totalInvest);

  const handleRefreshPrices = async () => {
    if (priceRefreshing) return;
    setPriceRefreshing(true);
    const REFRESH_TIMEOUT_MS = 90_000;
    try {
      const result = await Promise.race([
        refreshPortfolioPrices(assets),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error("Refresh timed out after 90 seconds")), REFRESH_TIMEOUT_MS);
        }),
      ]);
      const { cache, errors, fx, updated } = result;
      if (fx) setUsdThbRate(fx);
      setCacheInfo(summarizeCacheInfo(cache));
      setAssets(prev => applyPriceCacheToAssets(prev, cache));
      if (errors.length) {
        console.warn("[Price refresh]", errors);
        if (updated === 0) {
          alert(`Price refresh failed:\n${errors.slice(0, 5).join("\n")}${errors.length > 5 ? `\n…and ${errors.length - 5} more` : ""}`);
        }
      }
    } catch (e) {
      console.error(e);
      alert(e.message || "Price refresh failed. Try again in a moment.");
    } finally {
      setPriceRefreshing(false);
    }
  };

  const saveAsset = async (asset) => {
    const isNew = !assets.find(a => a.id === asset.id);

    setAssets(prev => isNew ? [...prev, asset] : prev.map(a => a.id === asset.id ? asset : a));
    setModal(null);
    setEditingAsset(null);

    if (isNew && parseFloat(asset.invested || 0) > 0) {
      await saveTransaction({
        asset_id: asset.id,
        sub_asset_id: null,
        type: "buy",
        currency: asset.currency || "THB",
        date: new Date().toISOString().split("T")[0],
        amount_thb: asset.currency === "USD" ? null : Number(parseFloat(asset.invested || 0).toFixed(2)),
        amount_usd: asset.currency === "USD" ? Number(parseFloat(asset.investedUSD || 0).toFixed(2)) : null,
        units: asset.units ? Number(parseFloat(asset.units).toFixed(8)) : null,
        qty: asset.qty ? Number(parseFloat(asset.qty).toFixed(8)) : null,
        notes: "[System] Initial Setup Investment",
      });
    }

    if (asset.finnomenaCode?.trim() && supabase) {
      const code = asset.finnomenaCode.trim();
      const cached = await getPriceCache([code]);
      if (!cached.has(code) || isCacheStale(cached.get(code)?.updated_at)) {
        try {
          const navData = await fetchCurrentNAV(code);
          if (navData && asset.units > 0) {
            const newVal = +(asset.units * navData.nav).toFixed(2);
            const now = new Date().toISOString();
            await supabase.from("price_cache").upsert({
              symbol: code,
              type: "fund",
              price: navData.nav,
              currency: "THB",
              price_date: navData.date,
              source: "finnomena",
              updated_at: now,
            }, { onConflict: "symbol" });
            setAssets(prev => prev.map(a => a.id === asset.id
              ? { ...a, currentValue: newVal, navUpdatedAt: now } : a));
          }
        } catch (e) {
          console.warn("[Cache-on-save] Finnomena fetch failed:", e.message);
        }
      }
    }

    if (asset.yahooSymbol?.trim() && asset.qty > 0 && supabase) {
      const sym = normalizeYahooSymbol(asset.yahooSymbol);
      const cached = await getPriceCache([sym]);
      const cachedRow = getCacheEntry(cached, sym);
      if (!cachedRow || isCacheStale(cachedRow.updated_at)) {
        try {
          const priceData = await fetchStockPrice(sym);
          if (priceData) {
            const isUsd = asset.currency === "USD";
            const fx = isUsd ? await fetchUSDTHBRate() : null;
            const thbPrice = fx ? +(priceData.price * fx).toFixed(4) : priceData.price;
            const dbPrice = isUsd ? priceData.price : thbPrice;
            const now = new Date().toISOString();
            await supabase.from("price_cache").upsert({
              symbol: sym,
              type: isUsd ? "us_stock" : (asset.type === "gold" ? "commodity" : "other"),
              price: dbPrice,
              currency: isUsd ? "USD" : "THB",
              price_date: priceData.date,
              source: "yahoo",
              updated_at: now,
            }, { onConflict: "symbol" });
            const newVal = +(asset.qty * thbPrice).toFixed(2);
            setAssets(prev => prev.map(a => a.id === asset.id
              ? { ...a, currentValue: newVal, priceUpdatedAt: now } : a));
          }
        } catch (e) {
          console.warn("[Cache-on-save] Yahoo fetch failed:", e.message);
        }
      }
    }
  };

  const deleteAsset = (id) => {
    if (window.confirm("Delete this asset?")) setAssets(prev => prev.filter(a => a.id !== id));
  };

  const updateValue = (id, val) => {
    setAssets(prev => prev.map(a => a.id === id ? { ...a, currentValue: val } : a));
    setModal(null);
    setEditingAsset(null);
  };

  const updateSettings = (key, val) => setSettings(prev => ({ ...prev, [key]: val }));

  const closeSub = () => {
    setSubModal(null);
    setActiveGroupId(null);
    setEditingSubAsset(null);
  };

  const saveSubAsset = async (sub) => {
    let isNew = false;

    setAssets(prev => prev.map(a => {
      if (a.id !== activeGroupId) return a;
      const existing = (a.subAssets || []).find(s => s.id === sub.id);
      if (!existing) isNew = true;

      const subAssets = existing
        ? (a.subAssets || []).map(s => s.id === sub.id ? sub : s)
        : [...(a.subAssets || []), sub];
      return { ...a, subAssets };
    }));
    closeSub();

    if (isNew && parseFloat(sub.invested || 0) > 0) {
      await saveTransaction({
        asset_id: activeGroupId,
        sub_asset_id: sub.id,
        type: "buy",
        currency: sub.currency || "THB",
        date: new Date().toISOString().split("T")[0],
        amount_thb: sub.currency === "USD" ? null : Number(parseFloat(sub.invested || 0).toFixed(2)),
        amount_usd: sub.currency === "USD" ? Number(parseFloat(sub.investedUSD || 0).toFixed(2)) : null,
        units: null,
        qty: Number(parseFloat(sub.qty || 0).toFixed(8)),
        notes: "[System] Initial Setup Investment",
      });
    }

    if (sub.yahooSymbol?.trim() && sub.qty > 0 && supabase) {
      const sym = normalizeYahooSymbol(sub.yahooSymbol);
      const cached = await getPriceCache([sym]);
      const cachedRow = getCacheEntry(cached, sym);
      if (!cachedRow || isCacheStale(cachedRow.updated_at)) {
        try {
          const priceData = await fetchStockPrice(sym);
          if (priceData) {
            const isUsd = sub.currency === "USD";
            const fx = isUsd ? await fetchUSDTHBRate() : null;
            const thbPrice = fx ? +(priceData.price * fx).toFixed(4) : priceData.price;
            const dbPrice = isUsd ? priceData.price : thbPrice;
            const now = new Date().toISOString();
            await supabase.from("price_cache").upsert({
              symbol: sym,
              type: isUsd ? "us_stock" : "thai_stock",
              price: dbPrice,
              currency: isUsd ? "USD" : "THB",
              price_date: priceData.date,
              source: "yahoo",
              updated_at: now,
            }, { onConflict: "symbol" });
            const newVal = +(sub.qty * thbPrice).toFixed(2);
            setAssets(prev => prev.map(a => a.id !== activeGroupId ? a : {
              ...a,
              subAssets: (a.subAssets || []).map(s => s.id === sub.id
                ? { ...s, currentValue: newVal, priceDate: priceData.date, priceUpdatedAt: now } : s),
            }));
          }
        } catch (e) {
          console.warn("[Cache-on-save] Yahoo fetch failed:", e.message);
        }
      }
    }
  };

  const deleteSubAsset = (groupId, subId) => {
    if (!window.confirm("Delete this stock?")) return;
    setAssets(prev => prev.map(a => a.id !== groupId ? a : {
      ...a,
      subAssets: (a.subAssets || []).filter(s => s.id !== subId),
    }));
  };

  const updateSubValue = (groupId, subId, val) => {
    setAssets(prev => prev.map(a => a.id !== groupId ? a : {
      ...a,
      subAssets: (a.subAssets || []).map(s => s.id === subId ? { ...s, currentValue: val } : s),
    }));
    closeSub();
  };

  const saveTransaction = async (tx) => {
    try {
      setSaveStatus("saving");
      let savedTx = tx;

      if (tx.id) {
        if (supabase) {
          savedTx = await updateTransaction(tx.id, { ...tx, user_id: userId });
        } else {
          savedTx = { ...tx, user_id: userId };
        }

        if (savedTx) {
          setTransactions(prev => prev.map(t => t.id === savedTx.id ? savedTx : t)
            .sort((a, b) => new Date(b.date) - new Date(a.date)));
        }
      } else {
        if (supabase) {
          savedTx = await addTransaction({ ...tx, user_id: userId });
        } else {
          savedTx = { ...tx, user_id: userId, id: uid() };
        }

        if (savedTx) {
          setTransactions(prev => [savedTx, ...prev].sort((a, b) => new Date(b.date) - new Date(a.date)));
        }
      }

      setTxModal(null);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus(null), 2000);
    } catch (err) {
      console.error("Failed to save transaction:", err);
      setSaveStatus("error");
      setTimeout(() => setSaveStatus(null), 3000);
      alert("Failed to save transaction");
    }
  };

  const deleteTx = async (id) => {
    try {
      setSaveStatus("saving");
      if (supabase) await deleteTransaction(id);
      setTransactions(prev => prev.filter(t => t.id !== id));
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus(null), 2000);
    } catch (err) {
      console.error("Failed to delete transaction:", err);
      setSaveStatus("error");
      setTimeout(() => setSaveStatus(null), 3000);
      alert("Failed to delete transaction");
    }
  };

  const reorderAssets = (srcId, dstId) => {
    if (!srcId || srcId === dstId) return;
    setAssets(prev => {
      const list = [...prev];
      const srcIdx = list.findIndex(x => x.id === srcId);
      const dstIdx = list.findIndex(x => x.id === dstId);
      const [moved] = list.splice(srcIdx, 1);
      list.splice(dstIdx, 0, moved);
      return list;
    });
    setDragOverId(null);
  };

  const resetToDefaults = () => {
    setAssets(DEFAULT_ASSETS);
    setSettings(DEFAULT_SETTINGS);
  };

  useEffect(() => {
    if ((tab !== "history" && !historyModal) || !userId) return;

    if (snapshotCache.current[snapshotRange]) {
      setSnapshots(snapshotCache.current[snapshotRange]);
      return;
    }

    setSnapshotLoading(true);
    getPortfolioSnapshots(userId, snapshotRange === 0 ? null : snapshotRange)
      .then(rows => {
        snapshotCache.current[snapshotRange] = rows;
        setSnapshots(rows);
        setSnapshotLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load snapshots:", err);
        setSnapshotLoading(false);
      });
  }, [tab, userId, snapshotRange, historyModal]);

  return {
    session,
    isAuthLoading,
    userId,
    assets,
    setAssets,
    settings,
    tab,
    setTab,
    showClosed,
    setShowClosed,
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
    derivedAssets,
    normalizedAssets,
    activeAssets,
    closedAssets,
    investments,
    speculative,
    coreAssetIds,
    totalInvest,
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
  };
}
