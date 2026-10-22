import { NextRequest, NextResponse } from 'next/server'
import { authenticate } from '../../../lib/server/sim-auth'
import { createRequest, getCase, getEvidence, getRequests } from '../../../lib/server/sim-db'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const auth = await authenticate(request)
  if (auth.error) return auth.error
  return NextResponse.json({ requests: getRequests(), scope: 'all' })
}

export async function POST(request: NextRequest) {
  const auth = await authenticate(request)
  if (auth.error) return auth.error
  let body: unknown
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const input = body as Record<string, unknown>
  const caseId = input.caseId
  const purpose = typeof input.purpose === 'string' ? input.purpose.trim() : ''
  if (typeof caseId !== 'string' || !getCase(caseId)) return NextResponse.json({ error: 'Unknown case' }, { status: 404 })
  if (purpose.length < 12 || purpose.length > 500) return NextResponse.json({ error: 'Purpose must be 12–500 characters' }, { status: 400 })
  const evidence = getEvidence(caseId)
  if (!evidence) return NextResponse.json({ error: 'Evidence has not been sealed' }, { status: 409 })
  const result = createRequest(caseId, auth.principal.sub, auth.principal.name, purpose)
  return NextResponse.json({ request: result, governanceStatus: 'pending-qea-quorum' }, { status: 201 })
}
