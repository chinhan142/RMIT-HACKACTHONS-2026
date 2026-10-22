import { NextRequest, NextResponse } from 'next/server'
import { authenticate } from '../../../lib/server/sim-auth'
import { getRawDbState, tamperEvidence, resetEvidence } from '../../../lib/server/sim-db'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const auth = await authenticate(request)
  if (auth.error) return auth.error
  return NextResponse.json(getRawDbState())
}

export async function POST(request: NextRequest) {
  const auth = await authenticate(request)
  if (auth.error) return auth.error
  
  let body: unknown
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const { action, caseId = 'case-001' } = (body as { action?: string; caseId?: string }) || {}

  if (action === 'tamper') {
    try {
      const result = tamperEvidence(caseId)
      return NextResponse.json({ message: 'Dữ liệu ciphertext trong SQLite đã bị can thiệp trái phép!', ...result })
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : 'Tamper failed' }, { status: 400 })
    }
  }

  if (action === 'reset') {
    resetEvidence(caseId)
    return NextResponse.json({ message: 'Đã xóa dữ liệu điểm thi để chạy lại demo!' })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
