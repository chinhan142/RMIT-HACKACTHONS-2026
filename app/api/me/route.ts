import { NextRequest, NextResponse } from 'next/server'
import { authenticate } from '../../../lib/server/auth'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const auth = await authenticate(request)
  if (auth.error) return auth.error
  return NextResponse.json(auth.principal)
}
