'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTideCloak } from '@tidecloak/nextjs'

const SIM_ACTORS = [
  {
    id: 'custodian-demo',
    label: '🎓 custodian-demo (Giảng viên / Sinh viên)',
    desc: 'Có quyền _tide_case001.selfencrypt. Bị chặn giải mã (403) cho đến khi đủ 2/3 Quorum.',
  },
  {
    id: 'admin-a',
    label: '🏛️ admin-a (Ủy viên Khảo thí 1/3)',
    desc: 'Có quyền tide-realm-admin. Ký duyệt phiếu QEA đầu tiên (1/2 Pending).',
  },
  {
    id: 'reviewer-b',
    label: '🏛️ reviewer-b (Trưởng khoa RMIT 2/3)',
    desc: 'Có quyền tide-realm-admin. Ký duyệt phiếu QEA thứ hai (2/2 Auto-Commit).',
  },
  {
    id: 'reviewer-c',
    label: '🏛️ reviewer-c (Thanh tra Độc lập 3/3)',
    desc: 'Có quyền tide-realm-admin. Ủy viên dự phòng đảm bảo N=3 (Threshold = 2).',
  },
]

export default function LoginPage() {
  const { login, isInitializing, initError } = useTideCloak()
  const [error, setError] = useState('')
  const router = useRouter()

  const onLogin = useCallback(async () => {
    setError('')
    try {
      await login()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Đăng nhập thất bại')
    }
  }, [login])

  const enterSimulation = (actorId: string) => {
    localStorage.setItem('tide_sim_actor', actorId)
    router.push('/home')
  }

  return (
    <main className="login-shell">
      <div className="login-panel">
        <div className="brand">
          <span className="brand-mark">◈</span>TIDEGRADE
        </div>
        <div className="eyebrow">RMIT HACKATHON 2026 · TIDE UNLOCKED CHALLENGE</div>
        <h1>
          Điểm thi bất khả xâm phạm:<br />
          <em>không thể xem lén, không thể sửa đổi.</em>
        </h1>
        <p>
          Hệ thống Quản lý & Công bố Điểm thi Bảo mật Tuyệt đối ứng dụng công nghệ
          <strong> TideCloak Client-side E2EE</strong> và <strong>Cơ chế Quorum QEA (2/3 Đồng thuận Đa bên)</strong>.
          Ngăn chặn triệt để mọi hành vi sửa điểm từ Hacker, DBA và quản trị viên đơn lẻ.
        </p>

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '18px' }}>
          <button
            className="primary"
            style={{ marginTop: 0 }}
            onClick={() => enterSimulation('custodian-demo')}
          >
            🚀 Vào Nhanh Chế Độ Demo TideCloak (Interactive Role & Quorum 2/3) →
          </button>
          <button
            className="secondary"
            onClick={onLogin}
            disabled={isInitializing}
          >
            {isInitializing ? 'Đang kết nối TideCloak…' : '🔐 Đăng nhập qua TideCloak ORK Live'}
          </button>
        </div>

        {(error || initError) && <p className="warning" style={{ marginTop: '10px' }}>{error || initError?.message}</p>}

        <div
          style={{
            marginTop: '28px',
            padding: '16px',
            background: '#111d24',
            border: '1px solid #2d4149',
            borderRadius: '8px',
            width: '100%',
            maxWidth: '720px',
          }}
        >
          <div className="eyebrow" style={{ marginBottom: '10px' }}>
            CHỌN NHANH DANH TÍNH MẬT MÃ TIDECLOAK (SIMULATED DPoP + RBAC + QEA 2/3):
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            {SIM_ACTORS.map((actor) => (
              <button
                key={actor.id}
                onClick={() => enterSimulation(actor.id)}
                style={{
                  textAlign: 'left',
                  padding: '10px 12px',
                  background: '#142027',
                  border: '1px solid #355059',
                  borderRadius: '6px',
                  color: '#ecf2ee',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--lime)', marginBottom: '4px' }}>
                  {actor.label}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--muted)', lineHeight: 1.4 }}>{actor.desc}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="login-aside">
        <span>01 — GIẢNG VIÊN NIÊM PHONG (E2EE)</span>
        <span>02 — ZERO-KNOWLEDGE SERVER</span>
        <span>03 — HỘI ĐỒNG PHÚC KHẢO (QEA 2/3)</span>
        <span>04 — SINH VIÊN GIẢI MÃ ĐÍCH DANH</span>
      </div>
    </main>
  )
}
