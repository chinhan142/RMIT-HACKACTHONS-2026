import { NextRequest, NextResponse } from 'next/server'
import { authenticate } from '../../../lib/server/sim-auth'
import { getCases, getEvidence } from '../../../lib/server/sim-db'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const auth = await authenticate(request)
  if (auth.error) return auth.error
  const cases = getCases().map((record) => ({ ...record, sealed: Boolean(getEvidence(record.id)) }))
  return NextResponse.json({ cases })
}
