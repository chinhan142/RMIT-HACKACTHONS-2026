import { createHash } from 'node:crypto'
import { calculateJwkThumbprint, compactVerify, decodeProtectedHeader, importJWK } from 'jose'

const MAX_PROOF_AGE_SECONDS = 300
const MAX_REPLAY_ENTRIES = 10_000
const usedProofs = new Map<string, number>()

// Demo replay cache. A multi-instance deployment needs a shared atomic store.
export async function verifyDpopProof(
  proof: string | null,
  accessToken: string,
  boundJkt: unknown,
  method: string,
  requestUrl: string,
): Promise<boolean> {
  if (!proof || proof.length > 8192 || typeof boundJkt !== 'string') return false

  try {
    const header = decodeProtectedHeader(proof)
    const jwk = header.jwk
    if (
      header.typ?.toLowerCase() !== 'dpop+jwt' ||
      header.alg !== 'ES256' ||
      !jwk || jwk.kty !== 'EC' || jwk.crv !== 'P-256' ||
      !jwk.x || !jwk.y || 'd' in jwk
    ) return false

    const key = await importJWK(jwk, 'ES256')
    const verified = await compactVerify(proof, key, { algorithms: ['ES256'] })
    const claims = JSON.parse(new TextDecoder().decode(verified.payload)) as Record<string, unknown>
    const now = Math.floor(Date.now() / 1000)
    const uri = new URL(requestUrl)
    uri.search = ''
    uri.hash = ''

    if (
      claims.htm !== method.toUpperCase() ||
      claims.htu !== uri.href ||
      !Number.isInteger(claims.iat) ||
      (claims.iat as number) < now - MAX_PROOF_AGE_SECONDS ||
      (claims.iat as number) > now + 60 ||
      typeof claims.jti !== 'string' || !claims.jti || claims.jti.length > 128 ||
      claims.ath !== createHash('sha256').update(accessToken).digest('base64url') ||
      await calculateJwkThumbprint(jwk, 'sha256') !== boundJkt
    ) return false

    for (const [id, expiresAt] of usedProofs) {
      if (expiresAt <= now) usedProofs.delete(id)
    }
    const replayKey = `${boundJkt}:${claims.jti}`
    if (usedProofs.has(replayKey) || usedProofs.size >= MAX_REPLAY_ENTRIES) return false
    usedProofs.set(replayKey, (claims.iat as number) + MAX_PROOF_AGE_SECONDS + 1)
    return true
  } catch {
    return false
  }
}
