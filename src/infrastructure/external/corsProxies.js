import { fetchWithTimeout } from "./fetchWithTimeout.js";

const PROXY_TIMEOUT_MS = 30_000;

/** Build proxy URLs — tried in order until one succeeds. */
const PROXY_BUILDERS = [
  (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
];

/**
 * Fetch a URL through public CORS proxies (production browser only).
 * Tries each proxy in sequence before failing.
 */
export async function fetchViaCorsProxies(targetUrl, ms = PROXY_TIMEOUT_MS) {
  const failures = [];
  for (const build of PROXY_BUILDERS) {
    try {
      const res = await fetchWithTimeout(build(targetUrl), {}, ms);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (e) {
      failures.push(e.message);
    }
  }
  throw new Error(`All CORS proxies failed (${failures.join("; ")})`);
}
