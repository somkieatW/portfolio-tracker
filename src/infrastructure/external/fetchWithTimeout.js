const DEFAULT_MS = 15_000;

/**
 * fetch() that rejects if the response takes longer than `ms`.
 * Prevents the refresh button from hanging when a proxy or API stalls.
 */
export async function fetchWithTimeout(url, options = {}, ms = DEFAULT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error(`Request timed out after ${ms}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
