import { NextRequest, NextResponse } from 'next/server'
import { verifyTideCloakToken } from '@tidecloak/nextjs/server'
import tcConfig from '../../../tidecloak.json'
import { verifyDpopProof } from '../../../lib/verify-dpop'

const ALLOWED_ROLE = 'offline_access'

export async function GET(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('DPoP ')) {
    return NextResponse.json(
      { error: 'Unauthorized: DPoP token required' },
      { status: 401 }
    )
  }

  const token = authHeader.slice('DPoP '.length)

  try {
    const user = await verifyTideCloakToken(tcConfig, token, [ALLOWED_ROLE]) as Record<string, any>

    if (!user) {
      return NextResponse.json(
        { error: 'Forbidden: Invalid token or insufficient role' },
        { status: 403 }
      )
    }
    if (!await verifyDpopProof(request.headers.get('dpop'), token, user.cnf?.jkt, request.method, request.url)) {
      return NextResponse.json(
        { error: 'Unauthorized: Invalid DPoP proof' },
        { status: 401 }
      )
    }
    return NextResponse.json(
      { vuid: user.vuid, userkey: user.tideuserkey },
      { status: 200 }
    )
  } catch (err) {
    console.error('Token verification failed:', err)
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    )
  }
}
