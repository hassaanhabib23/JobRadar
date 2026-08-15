/**
 * Runtime configuration.
 *
 * The API base URL is read from /config.json, which the container entrypoint
 * writes from environment variables at start-up. That keeps it runtime config
 * rather than build-time, so one image runs in both dev and prod.
 */

export interface RuntimeConfig {
  apiBaseUrl: string
}

const FALLBACK: RuntimeConfig = { apiBaseUrl: '/api' }

/** Reset between tests, which swap the mock server's state. */
export function resetConfigCache(): void {
  cached = null
}

let cached: RuntimeConfig | null = null

export async function loadConfig(): Promise<RuntimeConfig> {
  if (cached) return cached

  try {
    const response = await fetch('/config.json', { cache: 'no-store' })
    if (!response.ok) throw new Error(`config.json returned ${response.status}`)
    const parsed = (await response.json()) as Partial<RuntimeConfig>
    cached = { ...FALLBACK, ...parsed }
  } catch {
    // In `vite dev` there is no config.json — the dev proxy handles /api.
    cached = FALLBACK
  }

  return cached
}
