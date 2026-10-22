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
      { error: '403 Forbidden: Chỉ thành viên Hội đồng Khảo thí (role: tide-realm-admin) mới có quyền ký duyệt QEA!' },
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
        error: `Chính sách Four-Eyes (Độc lập Đa bên): Tài khoản '${auth.principal.name}' đã ký duyệt yêu cầu này rồi! Vui lòng chuyển sang thành viên Hội đồng khác (ví dụ reviewer-b hoặc reviewer-c) để đạt Quorum 2/3.`,
        qea: result.state,
      },
      { status: 409 }
    )
  }

  return NextResponse.json({
    qea: result.state,
    message:
      result.state.status === 'COMMITTED'
        ? `🎉 ĐÃ ĐẠT QUORUM ${result.state.approvals.length}/${result.state.threshold} (N=3)! Hệ thống QEA đã tự động Commit và cấp quyền '_tide_case001.selfdecrypt' cho tài khoản Custodian!`
        : `✍️ Đã ghi nhận chữ ký Enclave của '${auth.principal.name}' (${result.state.approvals.length}/${result.state.threshold} — Trạng thái: PENDING). Cần thêm 1 chữ ký độc lập nữa từ thành viên Hội đồng khác để mở khóa!`,
  })
}
