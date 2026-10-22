import { NextRequest, NextResponse } from 'next/server'
import { authenticate, hasRole } from '../../../../../lib/server/sim-auth'
import { createEvidence, getCase, getEvidence, getQeaState, resetEvidence } from '../../../../../lib/server/sim-db'

export const runtime = 'nodejs'
type Context = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, context: Context) {
  const auth = await authenticate(request)
  if (auth.error) return auth.error
  const { id } = await context.params
  if (!getCase(id)) return NextResponse.json({ error: 'Unknown case / exam' }, { status: 404 })
  const evidence = getEvidence(id)
  if (!evidence) return NextResponse.json({ error: 'Grade evidence has not been sealed yet' }, { status: 404 })
  const decryptRole = `_tide_${id.replaceAll('-', '')}.selfdecrypt`
  if (!hasRole(auth.principal, decryptRole)) {
    const qea = getQeaState(id)
    return NextResponse.json(
      {
        error: `Access Denied (403 Forbidden): Missing role '${decryptRole}'. Current QEA Quorum status: ${qea.approvals.length}/${qea.threshold} (${qea.status}). At least 2 of 3 Examination Board Members must authorize this request!`,
      },
      { status: 403 }
    )
  }
  return NextResponse.json({ ciphertext: evidence.ciphertext, tags: [id.replaceAll('-', '')], createdAt: evidence.created_at })
}

export async function PUT(request: NextRequest, context: Context) {
  const auth = await authenticate(request)
  if (auth.error) return auth.error
  const { id } = await context.params
  if (!getCase(id)) return NextResponse.json({ error: 'Unknown case / exam' }, { status: 404 })
  if (!hasRole(auth.principal, `_tide_${id.replaceAll('-', '')}.selfencrypt`)) {
    return NextResponse.json({ error: 'Tide encrypt role (_tide_case001.selfencrypt) required to seal grade' }, { status: 403 })
  }
  if (getEvidence(id)) return NextResponse.json({ error: 'Grade record is already sealed' }, { status: 409 })
  let body: unknown
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const ciphertext = body && typeof body === 'object' ? (body as Record<string, unknown>).ciphertext : undefined
  if (typeof ciphertext !== 'string' || ciphertext.length < 16 || ciphertext.length > 200_000) {
    return NextResponse.json({ error: 'Invalid ciphertext' }, { status: 400 })
  }
  try {
    createEvidence(id, auth.principal.sub, ciphertext)
  } catch {
    return NextResponse.json({ error: 'Grade record already sealed' }, { status: 409 })
  }
  return NextResponse.json({ sealed: true }, { status: 201 })
}

export async function DELETE(request: NextRequest, context: Context) {
  const auth = await authenticate(request)
  if (auth.error) return auth.error
  const { id } = await context.params
  resetEvidence(id)
  return NextResponse.json({ reset: true })
}
