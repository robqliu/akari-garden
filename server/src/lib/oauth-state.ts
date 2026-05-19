// OAuth `state` parameter helpers. The state value is passed to Google
// at the start of the authorize redirect and returned to us on the
// callback. Without verification an attacker could trick a signed-in
// user into completing the attacker's OAuth flow (callback CSRF), so
// we sign + time-bound the state.
//
// Format: base64url("<nonce>.<expiresAtMs>") + "." + base64url(HMAC).

const STATE_TTL_MS = 10 * 60 * 1000

const encoder = new TextEncoder()

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

function base64UrlEncode(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlDecode(s: string): Uint8Array {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(s.length + ((4 - (s.length % 4)) % 4), '=')
  const bin = atob(padded)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

export async function createState(signingKey: string): Promise<string> {
  const nonceBytes = new Uint8Array(16)
  crypto.getRandomValues(nonceBytes)
  const nonce = base64UrlEncode(nonceBytes)
  const expiresAt = Date.now() + STATE_TTL_MS
  const payload = `${nonce}.${expiresAt}`

  const key = await hmacKey(signingKey)
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(payload)))

  return `${base64UrlEncode(encoder.encode(payload))}.${base64UrlEncode(sig)}`
}

export type StateVerification =
  | { ok: true }
  | { ok: false; reason: 'malformed' | 'bad-signature' | 'expired' }

export async function verifyState(state: string, signingKey: string): Promise<StateVerification> {
  const parts = state.split('.')
  if (parts.length !== 2) return { ok: false, reason: 'malformed' }
  const [payloadB64, sigB64] = parts

  let payloadBytes: Uint8Array
  let sigBytes: Uint8Array
  try {
    payloadBytes = base64UrlDecode(payloadB64)
    sigBytes = base64UrlDecode(sigB64)
  } catch {
    return { ok: false, reason: 'malformed' }
  }

  const key = await hmacKey(signingKey)
  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    sigBytes as BufferSource,
    payloadBytes as BufferSource,
  )
  if (!valid) return { ok: false, reason: 'bad-signature' }

  const payload = new TextDecoder().decode(payloadBytes)
  const [, expiresAtStr] = payload.split('.')
  const expiresAt = Number(expiresAtStr)
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) {
    return { ok: false, reason: 'expired' }
  }
  return { ok: true }
}
