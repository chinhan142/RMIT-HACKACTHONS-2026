import { NextRequest, NextResponse } from 'next/server'
import { authenticate, hasRole } from '../../../lib/server/sim-auth'
import { approveQeaChangeRequest, getQeaState } from '../../../lib/server/sim-db'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const auth = await authenticate(request)
  if (auth.error) return auth.error
  return NextResponse.json({
    qea: getQeaState('case-001'),
    principal: auth.principal,
  })
}

export async function POST(request: NextRequest) {
  const auth = await authenticate(request)
  if (auth.error) return auth.error

  if (!hasRole(auth.principal, 'tide-realm-admin')) {
    return NextResponse.json(
      { error: '403 Forbidden: Only Examination Board Administrators (role: tide-realm-admin) can sign QEA Change Requests!' },
      { status: 403 }
    )
  }

  let body: { caseId?: string } = {}
  try {
    body = await request.json()
  } catch {
    // ignore empty body
  }
  const caseId = body.caseId || 'case-001'
  const result = approveQeaChangeRequest(caseId, auth.principal.sub, auth.principal.name)

  if (result.alreadyApproved) {
    return NextResponse.json(
      {
        error: `Four-Eyes Policy Conflict (409): '${auth.principal.name}' has already signed this Change Request! Please switch to an independent Board Member (e.g., reviewer-b or reviewer-c) to reach 2/3 Quorum.`,
        qea: result.state,
      },
      { status: 409 }
    )
  }

  return NextResponse.json({
    qea: result.state,
    message:
      result.state.status === 'COMMITTED'
        ? `🎉 QUORUM REACHED (${result.state.approvals.length}/${result.state.threshold}, N=3)! Tide QEA automatically committed the Change Request and granted '_tide_case001.selfdecrypt' to the Custodian!`
        : `✍️ Enclave signature recorded for '${auth.principal.name}' (${result.state.approvals.length}/${result.state.threshold} — Status: PENDING). 1 more independent Board Member signature is required to unlock decryption!`,
  })
}
