import { DEFAULT_ENDPOINT } from './constants.js'

function payload(events) {
  return JSON.stringify(events)
}

export async function sendEvents(events, options = {}) {
  if (!Array.isArray(events) || events.length === 0) return true
  const endpoint = options.endpoint || DEFAULT_ENDPOINT
  const navigatorObj = options.navigatorObj || globalThis.navigator
  const fetchImpl = options.fetchImpl || globalThis.fetch
  const body = payload(events)

  if (options.preferBeacon && typeof navigatorObj?.sendBeacon === 'function') {
    try {
      const beaconBody = typeof Blob === 'function'
        ? new Blob([body], { type: 'application/json' })
        : body
      if (navigatorObj.sendBeacon(endpoint, beaconBody)) return true
    } catch {
      // Fall through to keepalive fetch.
    }
  }

  if (typeof fetchImpl !== 'function') return false
  try {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      keepalive: true,
      credentials: 'omit',
      cache: 'no-store',
    })
    return Boolean(response?.ok)
  } catch {
    return false
  }
}
