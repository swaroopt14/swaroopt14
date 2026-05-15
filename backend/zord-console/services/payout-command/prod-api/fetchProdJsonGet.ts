/**
 * Single place to breakpoint all payout-command → `/api/prod/*` GET traffic.
 */
export async function fetchProdJsonGet<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    })
    if (!response.ok) return null
    return (await response.json()) as T
  } catch {
    return null
  }
}
