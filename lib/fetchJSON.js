// Resilient JSON fetch with retry — hardens against intermittent proxy hiccups.
export async function fetchJSON(url, opts = {}, retries = 3) {
  let lastErr
  for (let i = 0; i <= retries; i++) {
    try {
      const r = await fetch(url, { cache: 'no-store', ...opts })
      if (!r.ok) throw new Error('HTTP ' + r.status)
      return await r.json()
    } catch (e) {
      lastErr = e
      if (i < retries) await new Promise((res) => setTimeout(res, 350 * (i + 1)))
    }
  }
  throw lastErr
}
