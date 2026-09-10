export const CATEGORY_TYPES = [
  { value: "equity", label: "Equity / Stock Fund" },
  { value: "index", label: "Index Fund" },
  { value: "bond", label: "Bond / Fixed Income" },
  { value: "gold", label: "Gold / Commodity" },
  { value: "stock", label: "Individual Stock" },
  { value: "thai_stocks", label: "Thai Individual Stocks" },
  { value: "us_stocks", label: "US Individual Stocks" },
  { value: "forex", label: "Forex / Speculation" },
  { value: "crypto", label: "Crypto" },
  { value: "cash", label: "Cash / Savings" },
  { value: "property", label: "Property / REIT" },
  { value: "other", label: "Other" },
];

// Stock group types — these act as containers for sub-assets
export const STOCK_GROUP_TYPES = new Set(["thai_stocks", "us_stocks"]);

export const DEFAULT_ASSETS = [];

export const DEFAULT_SETTINGS = { dca: 1000, specCap: 10 };

export const CHART_PALETTE = [
  "#3b82f6", "#22c55e", "#eab308", "#f97316", "#a855f7",
  "#06b6d4", "#ec4899", "#14b8a6", "#f59e0b", "#8b5cf6",
  "#10b981", "#ef4444", "#6366f1", "#84cc16", "#fb923c",
];

export const TABS = [
  { id: "dashboard", label: "\ud83c\udfe0 Dashboard" },
  { id: "assets", label: "\ud83d\udcbc Assets" },
  { id: "speculative", label: "\u26a1 Speculation" },
  { id: "history", label: "\ud83d\udcc8 History" },
  { id: "projection", label: "\ud83d\udd2e Projection" },
  { id: "ai", label: "\u2728 AI Assistant" },
  { id: "settings", label: "\u2699 Settings" },
];
