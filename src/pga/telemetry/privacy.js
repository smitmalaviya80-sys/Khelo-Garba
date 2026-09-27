const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
const PHONE_RE = /(?:\+?\d[\d\s().-]{7,}\d)/
const URL_RE = /\b(?:https?:\/\/|www\.)\S+/i

export function sanitiseSearchTerm(value) {
  if (typeof value !== 'string') return ''
  const cleaned = value.normalize('NFKC').trim().replace(/\s+/g, ' ').slice(0, 80)
  if (!cleaned) return ''
  if (EMAIL_RE.test(cleaned) || PHONE_RE.test(cleaned) || URL_RE.test(cleaned)) return ''
  return cleaned
}

export function sanitiseToken(value, max = 64) {
  if (typeof value !== 'string') return ''
  const cleaned = value.normalize('NFKC').trim().slice(0, max)
  return /^[A-Za-z0-9._ -]+$/.test(cleaned) ? cleaned : ''
}

export function referrerHostname(documentObj) {
  const referrer = documentObj?.referrer
  if (!referrer || typeof referrer !== 'string') return ''
  try {
    const host = new URL(referrer).hostname.toLowerCase()
    return /^[a-z0-9.-]+$/.test(host) ? host.slice(0, 255) : ''
  } catch {
    return ''
  }
}

export function acquisitionFromLocation(locationObj, documentObj) {
  let source = ''
  let medium = ''
  let campaign = ''
  try {
    const url = new URL(locationObj?.href || 'https://playgarba.com/')
    source = sanitiseToken(url.searchParams.get('utm_source') || '')
    medium = sanitiseToken(url.searchParams.get('utm_medium') || '')
    campaign = sanitiseToken(url.searchParams.get('utm_campaign') || '')
  } catch {
    // A malformed location should not break the product or leak its raw value.
  }

  const referrerHost = referrerHostname(documentObj)
  if (!source && !referrerHost) source = 'direct'
  return { source, medium, campaign, referrerHost }
}

export function detectDisplayMode(windowObj, navigatorObj) {
  if (navigatorObj?.standalone === true) return 'standalone'
  try {
    if (windowObj?.matchMedia?.('(display-mode: standalone)')?.matches) return 'standalone'
    if (windowObj?.matchMedia?.('(display-mode: minimal-ui)')?.matches) return 'minimal-ui'
  } catch {
    return 'unknown'
  }
  return 'browser'
}
