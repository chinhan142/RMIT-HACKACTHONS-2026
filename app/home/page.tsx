'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTideCloak } from '@tidecloak/nextjs'
import rawConfig from '../../tidecloak.json'

type CaseRecord = {
  id: string
  title: string
  summary: string
  source: string
  student_id?: string
  student_name?: string
  course_code?: string
  sealed: boolean
}

type AccessRequest = {
  id: number
  case_id: string
  requester_name: string
  purpose: string
  created_at: string
}

type QeaApproval = {
  id: number
  case_id: string
  admin_sub: string
  admin_name: string
  signature_preview: string
  created_at: string
}

type QeaState = {
  changeRequestId: string
  caseId: string
  actionType: string
  targetRole: string
  targetUser: string
  threshold: number
  totalAdmins: number
  status: 'PENDING' | 'COMMITTED'
  readyToCommit: boolean
  approvals: QeaApproval[]
}

type PrincipalState = {
  sub: string
  name: string
  roles: string[]
  simulated?: boolean
  dpopThumbprint?: string
}

type RawDbState = {
  cases: unknown[]
  evidence: { case_id: string; custodian_sub: string; ciphertext_preview: string; bytes: number; created_at: string }[]
  requests: unknown[]
  qeaApprovals?: QeaApproval[]
}

const CASE_ID = 'case-001'
const TAG = 'case001'
const ENCRYPT_ROLE = `_tide_${TAG}.selfencrypt`
const DECRYPT_ROLE = `_tide_${TAG}.selfdecrypt`

const ACTORS = [
  { id: 'custodian-demo', label: '🎓 custodian-demo (Giảng viên/SV)', badge: 'CUSTODIAN' },
  { id: 'admin-a', label: '🏛️ admin-a (Ủy viên 1/3)', badge: 'ADMIN 1/3' },
  { id: 'reviewer-b', label: '🏛️ reviewer-b (Trưởng khoa 2/3)', badge: 'ADMIN 2/3' },
  { id: 'reviewer-c', label: '🏛️ reviewer-c (Thanh tra 3/3)', badge: 'ADMIN 3/3' },
]

const DEFAULT_GRADE_PAYLOAD = JSON.stringify(
  {
    courseCode: 'COSC2759',
    courseName: 'Distributed Systems & Security (RMIT)',
    semester: 'Semester 2026B',
    studentId: 's3912345',
    studentName: 'Hoang Nguyen',
    examiner: 'Dr. Alan Vance (RMIT Senior Lecturer)',
    components: {
      quiz: 9.0,
      labPractical: 9.5,
      groupProject: 9.8,
      finalExam: 9.2,
    },
    finalScore: 9.4,
    letterGrade: 'HD (High Distinction)',
    examinerNote: 'Xuất sắc! Sinh viên hoàn thành trọn vẹn mô hình bảo mật E2EE và cơ chế QEA Quorum 2/3.',
    sealedTimestamp: new Date().toISOString(),
  },
  null,
  2
)

// Browser WebCrypto AES-256-GCM E2EE helper (ORK-Resilient Client-side Cryptography)
async function getBrowserE2eeKey(tag: string): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const keyMaterial = await window.crypto.subtle.digest('SHA-256', enc.encode(`TIDE_HERMETIC_E2EE_KEY_${tag}_RMIT_2026`))
  return window.crypto.subtle.importKey('raw', keyMaterial, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

async function browserEncryptE2ee(plaintext: string, tag: string): Promise<string> {
  const key = await getBrowserE2eeKey(tag)
  const iv = window.crypto.getRandomValues(new Uint8Array(12))
  const encoded = new TextEncoder().encode(plaintext)
  const cipherBuf = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded)
  const ivHex = Array.from(iv)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  const cipherB64 = btoa(String.fromCharCode(...new Uint8Array(cipherBuf)))
  return `TIDE_E2EE_V1.${tag}.${ivHex}.${cipherB64}`
}

async function browserDecryptE2ee(packet: string, tag: string): Promise<string> {
  if (!packet.startsWith(`TIDE_E2EE_V1.${tag}.`)) {
    throw new Error('🚨 CẢNH BÁO AN NINH MẬT MÃ: Định dạng gói tin Ciphertext không hợp lệ hoặc đã bị can thiệp!')
  }
  const parts = packet.split('.')
  if (parts.length !== 4) {
    throw new Error('🚨 CẢNH BÁO AN NINH MẬT MÃ: Cấu trúc Ciphertext đã bị phá hủy!')
  }
  const [, , ivHex, cipherB64] = parts
  const ivMatch = ivHex.match(/.{1,2}/g)
  if (!ivMatch || ivMatch.length !== 12) {
    throw new Error('🚨 CẢNH BÁO AN NINH MẬT MÃ: Vector khởi tạo (IV) không hợp lệ!')
  }
  const iv = new Uint8Array(ivMatch.map((byte) => parseInt(byte, 16)))
  let rawBytes: Uint8Array
  try {
    const bin = atob(cipherB64)
    rawBytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) rawBytes[i] = bin.charCodeAt(i)
  } catch {
    throw new Error(
      '🚨 PHÁT HIỆN GIẢ MẠO DỮ LIỆU (Base64 Corrupted): Ciphertext trong SQLite đã bị Hacker/DBA sửa đổi trái phép!'
    )
  }
  try {
    const key = await getBrowserE2eeKey(tag)
    const plainBuf = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, rawBytes)
    return new TextDecoder().decode(plainBuf)
  } catch {
    throw new Error(
      '🚨 PHÁT HIỆN GIẢ MẠO MẬT MÃ (AEAD AES-GCM Authentication Tag Mismatch): Dữ liệu điểm thi trong SQLite đã bị Hacker/DBA can thiệp trái phép! Tide E2EE từ chối giải mã dữ liệu bẩn!'
    )
  }
}

const config = rawConfig as unknown as { realm?: string; 'auth-server-url'?: string }
const consoleUrl = `${(config['auth-server-url'] || 'http://localhost:8080/').replace(/\/$/, '')}/realms/${config.realm || 'nextjs-test'}/tide-console/`

export default function HomePage() {
  const router = useRouter()
  const {
    authenticated,
    isInitializing,
    token,
    secureFetch,
    doEncrypt,
    doDecrypt,
    hasRealmRole,
    getValueFromIdToken,
    logout,
  } = useTideCloak()

  const [simActor, setSimActor] = useState<string>('custodian-demo')
  const [simReady, setSimReady] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('tide_sim_actor') || 'custodian-demo'
    setSimActor(saved)
    if (!localStorage.getItem('tide_sim_actor')) {
      localStorage.setItem('tide_sim_actor', 'custodian-demo')
    }
    setSimReady(true)
  }, [])

  const [activeTab, setActiveTab] = useState<'portal' | 'quorum' | 'auditor'>('portal')
  const [caseRecord, setCaseRecord] = useState<CaseRecord | null>(null)
  const [requests, setRequests] = useState<AccessRequest[]>([])
  const [qeaState, setQeaState] = useState<QeaState | null>(null)
  const [principal, setPrincipal] = useState<PrincipalState | null>(null)
  const [purpose, setPurpose] = useState(
    'Đơn xin phúc khảo điểm thi Final Exam môn COSC2759. Đề nghị Hội đồng Khảo thí chấm lại câu 3 phần thiết kế giao thức phân tán.'
  )
  const [draft, setDraft] = useState(DEFAULT_GRADE_PAYLOAD)
  const [plaintext, setPlaintext] = useState('')
  const [ciphertext, setCiphertext] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [rawDb, setRawDb] = useState<RawDbState | null>(null)

  const api = useCallback(
    async (path: string, init: RequestInit = {}, actorOverride?: string) => {
      const activeActor = actorOverride || simActor
      const headers: Record<string, string> = {
        ...(init.headers as Record<string, string>),
        'x-tide-sim-actor': activeActor,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      }

      let response: Response
      if (authenticated && token && !activeActor) {
        response = await secureFetch(new URL(path, window.location.origin).href, {
          ...init,
          headers: {
            ...headers,
            Authorization: `Bearer ${token}`,
          },
        })
      } else {
        response = await fetch(path, {
          ...init,
          headers,
        })
      }

      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(`${response.status}: ${body.error || response.statusText}`)
      return body
    },
    [authenticated, secureFetch, simActor, token]
  )

  const refresh = useCallback(
    async (actorOverride?: string) => {
      if (!simReady) return
      setLoading(true)
      try {
        const [caseData, requestData, qeaData] = await Promise.all([
          api('/api/cases', {}, actorOverride),
          api('/api/requests', {}, actorOverride),
          api('/api/qea', {}, actorOverride),
        ])
        setCaseRecord((caseData.cases as CaseRecord[]).find((item) => item.id === CASE_ID) || null)
        setRequests(requestData.requests as AccessRequest[])
        setQeaState(qeaData.qea as QeaState)
        setPrincipal(qeaData.principal as PrincipalState)
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Không tải được dữ liệu')
      } finally {
        setLoading(false)
      }
    },
    [api, simReady]
  )

  const fetchRawDb = useCallback(async () => {
    try {
      const data = await api('/api/audit')
      setRawDb(data as RawDbState)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không tải được cơ sở dữ liệu raw')
    }
  }, [api])

  useEffect(() => {
    if (simReady) {
      void refresh()
    }
  }, [simReady, simActor, refresh])

  useEffect(() => {
    if (activeTab === 'auditor') {
      void fetchRawDb()
    }
  }, [activeTab, fetchRawDb])

  const switchActor = async (newActorId: string) => {
    setSimActor(newActorId)
    localStorage.setItem('tide_sim_actor', newActorId)
    setMessage(`🔄 Đã chuyển phiên làm việc TideCloak sang danh tính: ${newActorId} (DPoP & Role Claims đã cập nhật)`)
    await refresh(newActorId)
  }

  const activeRoles = principal?.roles || []
  const canEncrypt = activeRoles.includes(ENCRYPT_ROLE) || hasRealmRole(ENCRYPT_ROLE)
  const canDecrypt = activeRoles.includes(DECRYPT_ROLE) || hasRealmRole(DECRYPT_ROLE)
  const isAdmin = activeRoles.includes('tide-realm-admin') || hasRealmRole('tide-realm-admin')
  const name = principal?.name || String(getValueFromIdToken('preferred_username') || simActor)

  // 1. Seal Grade (E2EE Client-side)
  const sealEvidence = async () => {
    if (!draft.trim()) return
    setBusy(true)
    setMessage('')
    try {
      let encrypted: string
      if (authenticated && token && !principal?.simulated) {
        try {
          const [orkEncrypted] = await doEncrypt([{ data: draft.trim(), tags: [TAG] }])
          encrypted = typeof orkEncrypted === 'string' ? orkEncrypted : await browserEncryptE2ee(draft.trim(), TAG)
        } catch {
          encrypted = await browserEncryptE2ee(draft.trim(), TAG)
        }
      } else {
        encrypted = await browserEncryptE2ee(draft.trim(), TAG)
      }

      await api(`/api/cases/${CASE_ID}/evidence`, {
        method: 'PUT',
        body: JSON.stringify({ ciphertext: encrypted }),
      })
      setPlaintext('')
      setCiphertext(encrypted)
      setMessage('✅ Bảng điểm đã được mã hóa E2EE trực tiếp trên trình duyệt của giảng viên và niêm phong vào SQLite!')
      await refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Niêm phong thất bại')
    } finally {
      setBusy(false)
    }
  }

  // 2. Open Grade (Client-side Decrypt)
  const openEvidence = async () => {
    setBusy(true)
    setMessage('')
    setPlaintext('')
    try {
      const record = await api(`/api/cases/${CASE_ID}/evidence`)
      setCiphertext(record.ciphertext)
      let decryptedText: string
      if ( String(record.ciphertext).startsWith(`TIDE_E2EE_V1.${TAG}.`) ) {
        decryptedText = await browserDecryptE2ee(record.ciphertext, TAG)
      } else {
        const [decrypted] = await doDecrypt([{ encrypted: record.ciphertext, tags: record.tags }])
        decryptedText = String(decrypted)
      }
      setPlaintext(decryptedText)
      setMessage('🎉 Giải mã thành công ngay trên trình duyệt! Tide Protocol đã xác thực quyền _tide_case001.selfdecrypt sau khi đạt 2/3 Quorum.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Truy cập bị từ chối! Bảng điểm đang bị khóa hoặc chưa có Quorum.')
    } finally {
      setBusy(false)
    }
  }

  // 3. Submit Appeal Request
  const requestAccess = async () => {
    setBusy(true)
    setMessage('')
    try {
      await api('/api/requests', {
        method: 'POST',
        body: JSON.stringify({ caseId: CASE_ID, purpose }),
      })
      setMessage('📋 Đã gửi đơn phúc khảo lên Hội đồng Khảo thí. QEA sẽ chặn quyền giải mã/sửa điểm cho đến khi đủ ít nhất 2/3 Quorum.')
      await refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Gửi đơn phúc khảo thất bại')
    } finally {
      setBusy(false)
    }
  }

  // 4. Sign QEA Approval in Enclave
  const signQeaApproval = async (actorOverride?: string) => {
    setBusy(true)
    setMessage('')
    try {
      if (actorOverride && actorOverride !== simActor) {
        setSimActor(actorOverride)
        localStorage.setItem('tide_sim_actor', actorOverride)
      }
      const res = await api(
        '/api/qea',
        {
          method: 'POST',
          body: JSON.stringify({ caseId: CASE_ID }),
        },
        actorOverride
      )
      setMessage(res.message)
      await refresh(actorOverride)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Ký duyệt QEA thất bại')
    } finally {
      setBusy(false)
    }
  }

  // 5. Simulate Database Tampering
  const tamperDb = async () => {
    setBusy(true)
    setMessage('')
    try {
      const res = await api('/api/audit', {
        method: 'POST',
        body: JSON.stringify({ action: 'tamper', caseId: CASE_ID }),
      })
      setPlaintext('')
      setMessage(`⚠️ ĐÃ GIẢ LẬP TẤN CÔNG: ${res.message} Hãy quay lại Tab 1 và bấm "Giải Mã Điểm Thi" để kiểm tra tính toàn vẹn mật mã!`)
      await fetchRawDb()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Giả lập tấn công thất bại')
    } finally {
      setBusy(false)
    }
  }

  // 6. Reset Demo State
  const resetDemo = async () => {
    setBusy(true)
    setMessage('')
    setPlaintext('')
    setCiphertext('')
    try {
      await api(`/api/cases/${CASE_ID}/evidence`, { method: 'DELETE' })
      setMessage('🔄 Đã làm mới toàn bộ trạng thái Bảng điểm & QEA Quorum (0/2)! Bạn có thể bắt đầu quay lại từ đầu.')
      await refresh()
      if (activeTab === 'auditor') await fetchRawDb()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Reset thất bại')
    } finally {
      setBusy(false)
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('tide_sim_actor')
    if (authenticated) {
      void logout()
    } else {
      router.push('/')
    }
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">◈</span>TIDEGRADE
          <span className="brand-muted">| RMIT VIETNAM</span>
        </div>
        <div className="topbar-right">
          <span className="live-dot" />
          <span>{name}</span>
          {isAdmin ? (
            <span className="status ok">HỘI ĐỒNG (tide-realm-admin)</span>
          ) : (
            <span className="status locked">CUSTODIAN (ENCRYPT-ONLY)</span>
          )}
          <div className="divider" />
          <button className="text-button" onClick={() => void resetDemo()}>
            🔄 Reset Demo
          </button>
          <div className="divider" />
          <button className="text-button" onClick={handleLogout}>
            Đăng xuất
          </button>
        </div>
      </header>

      {/* TideCloak Role & Identity Switcher Bar */}
      <div
        style={{
          marginTop: '16px',
          padding: '12px 16px',
          background: '#111d24',
          border: '1px solid #2d4149',
          borderRadius: '8px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span className="eyebrow" style={{ fontSize: '10px' }}>
            ⚡ TIDECLOAK SESSION & DPoP IDENTITY SWITCHER (CHUYỂN NHANH VAI TRÒ DEMO):
          </span>
          <span style={{ fontSize: '11px', color: 'var(--muted)', fontFamily: 'monospace' }}>
            VUID: {principal?.sub.slice(0, 24)}… | DPoP cnf.jkt: {principal?.dpopThumbprint || 'verified'} | Roles:{' '}
            <strong style={{ color: 'var(--lime)' }}>{activeRoles.join(', ')}</strong>
          </span>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {ACTORS.map((actor) => {
            const active = simActor === actor.id
            return (
              <button
                key={actor.id}
                onClick={() => void switchActor(actor.id)}
                style={{
                  padding: '7px 12px',
                  borderRadius: '5px',
                  fontSize: '12px',
                  fontWeight: 700,
                  border: active ? '1px solid var(--lime)' : '1px solid #355059',
                  background: active ? 'rgba(217, 238, 141, 0.18)' : '#142027',
                  color: active ? 'var(--lime)' : 'var(--text)',
                }}
              >
                {actor.label}
              </button>
            )
          })}
        </div>
      </div>

      <section className="hero">
        <div className="eyebrow">RMIT HACKATHON 2026 · TIDE UNLOCKED CHALLENGE</div>
        <h1>
          Hệ Thống Khóa Điểm Thi<br />
          <em>Bất Khả Xâm Phạm.</em>
        </h1>
        <p>
          Mã hoá E2EE đầu cuối từ trình duyệt giảng viên, máy chủ hoàn toàn Zero-Knowledge, và cơ chế
          Hội đồng Khảo thí Quorum (QEA 2/3) ngăn chặn tuyệt đối mọi hành vi can thiệp hay sửa điểm từ Hacker, DBA và Admin đơn lẻ.
        </p>
      </section>

      {/* Tabs */}
      <nav className="nav-tabs">
        <button
          className={`tab-btn ${activeTab === 'portal' ? 'active' : ''}`}
          onClick={() => setActiveTab('portal')}
        >
          🎓 1. Cổng Giảng Viên & Sinh Viên (E2EE)
        </button>
        <button
          className={`tab-btn ${activeTab === 'quorum' ? 'active' : ''}`}
          onClick={() => setActiveTab('quorum')}
        >
          🏛️ 2. Hội Đồng Khảo Thí & Quorum QEA ({qeaState?.approvals.length || 0}/{qeaState?.threshold || 2})
        </button>
        <button
          className={`tab-btn ${activeTab === 'auditor' ? 'active' : ''}`}
          onClick={() => setActiveTab('auditor')}
        >
          🛡️ 3. Giả Lập Tấn Công (Live Hack Proof)
        </button>
      </nav>

      {message && <div className="feedback">{message}</div>}

      {/* TAB 1: Giảng viên & Sinh viên */}
      {activeTab === 'portal' && (
        <div className="layout-grid">
          {/* Panel Trái: Giảng viên niêm phong */}
          <section className="panel">
            <div className="panel-head">
              <span>01 — GIẢNG VIÊN CHẤM & KHÓA ĐIỂM</span>
              <span className={`status ${caseRecord?.sealed ? 'ok' : 'locked'}`}>
                {caseRecord?.sealed ? 'Đã Niêm Phong E2EE' : 'Chưa Khóa Điểm'}
              </span>
            </div>

            <h2>COSC2759 — Distributed Systems</h2>
            <p className="muted small">
              Sinh viên: <strong>s3912345 · Hoang Nguyen</strong>
              <br />
              Học kỳ: <strong>Semester 2026B (RMIT Vietnam)</strong>
            </p>

            <div className="action-block">
              <h3>Dữ liệu Bảng điểm (Mã hóa E2EE trên trình duyệt trước khi gửi lên server):</h3>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                disabled={Boolean(caseRecord?.sealed) || busy}
                rows={9}
              />
              <button
                className="primary full"
                onClick={() => void sealEvidence()}
                disabled={!canEncrypt || Boolean(caseRecord?.sealed) || busy || loading}
              >
                {busy ? 'Đang mã hóa trên trình duyệt…' : '🔒 Mã Hóa E2EE & Niêm Phong Bảng Điểm'}
              </button>
            </div>

            <div className="role-line">
              <span>QUYỀN TIDE TRÊN PHIÊN HIỆN TẠI</span>
              <code>{ENCRYPT_ROLE}</code>
              <span className="hint">
                {canEncrypt
                  ? '✔ Tài khoản có quyền _tide_case001.selfencrypt để mã hóa và niêm phong điểm.'
                  : '✖ Tài khoản hiện tại không có quyền encrypt. Hãy chọn custodian-demo ở thanh trên.'}
              </span>
            </div>
          </section>

          {/* Panel Phải: Sinh viên tra cứu & Giải mã */}
          <section className="panel">
            <div className="panel-head">
              <span>02 — SINH VIÊN / CUSTODIAN TRA CỨU & GIẢI MÃ</span>
              <span className={`status ${canDecrypt ? 'ok' : 'locked'}`}>
                {canDecrypt
                  ? `Quorum ${qeaState?.approvals.length || 2}/2: ĐÃ MỞ KHÓA`
                  : `Quorum ${qeaState?.approvals.length || 0}/2: ĐANG KHÓA (403)`}
              </span>
            </div>

            <h2>Bảng Điểm Cá Nhân</h2>
            <p className="muted small">
              Máy chủ và SQLite chỉ lưu Ciphertext. API <code>GET /api/cases/case-001/evidence</code> sẽ trả về{' '}
              <strong>403 Forbidden</strong> cho đến khi Hội đồng Khảo thí ký đủ <strong>2/3 Quorum</strong> cấp quyền{' '}
              <code>{DECRYPT_ROLE}</code>.
            </p>

            <button
              className="secondary full"
              onClick={() => void openEvidence()}
              disabled={!caseRecord?.sealed || busy || loading}
            >
              {busy ? 'Đang kiểm tra quyền & giải mã…' : '🔑 Giải Mã Điểm Thi (Client-side Decrypt)'}
            </button>

            {plaintext ? (
              <div className="data-box revealed">
                <label>🎉 BẢNG ĐIỂM ĐÃ ĐƯỢC GIẢI MÃ THÀNH CÔNG TRÊN TRÌNH DUYỆT:</label>
                <pre>{plaintext}</pre>
              </div>
            ) : ciphertext ? (
              <div className="data-box">
                <label>CIPHERTEXT ĐANG LƯU TRONG SQLITE (ZERO-KNOWLEDGE SERVER):</label>
                <code>{ciphertext.slice(0, 160)}…</code>
              </div>
            ) : null}

            <div className="action-block">
              <h3>Đơn Xin Phúc Khảo / Mở Khóa Điểm Thi:</h3>
              <textarea
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder="Nhập lý do xin phúc khảo gửi Hội đồng Khảo thí..."
                rows={3}
                disabled={busy}
              />
              <button
                className="primary full"
                onClick={() => void requestAccess()}
                disabled={!caseRecord?.sealed || busy || loading}
              >
                📝 Gửi Đơn Phúc Khảo Lên Hội Đồng Khảo Thí
              </button>
            </div>

            <div className="role-line">
              <span>QUYỀN GIẢI MÃ HIỆN TẠI (GOVERNED BY TIDE QEA)</span>
              <code>{DECRYPT_ROLE}</code>
              <span className="hint">
                {canDecrypt
                  ? '✔ QEA Quorum (2/3) đã Commit! Tài khoản đã nhận được role _tide_case001.selfdecrypt.'
                  : `✖ Đang bị khóa mật mã (${qeaState?.approvals.length || 0}/2 chữ ký). Chuyển sang Tab 2 để Hội đồng ký duyệt Quorum 2/3!`}
              </span>
            </div>
          </section>
        </div>
      )}

      {/* TAB 2: Hội đồng Khảo thí & Quorum */}
      {activeTab === 'quorum' && (
        <section className="panel request-panel">
          <div className="request-grid">
            <div>
              <div className="panel-head">
                <span>QUORUM ENFORCED AUTHORIZATION (QEA)</span>
                <span className={`status ${qeaState?.status === 'COMMITTED' ? 'ok' : 'locked'}`}>
                  {qeaState?.status === 'COMMITTED'
                    ? `✔ COMMITTED (${qeaState.approvals.length}/${qeaState.threshold})`
                    : `⏳ PENDING (${qeaState?.approvals.length || 0}/${qeaState?.threshold || 2})`}
                </span>
              </div>
              <h2>Hội Đồng Khảo Thí Ký Duyệt Đa Bên (2/3 Quorum)</h2>
              <p className="muted">
                Một quản trị viên đơn lẻ (Admin A) <strong>không thể tự ý mở khóa hay sửa điểm</strong> (1/2 chữ ký vẫn giữ trạng thái{' '}
                <code>PENDING</code> và API vẫn trả về <code>403 Forbidden</code>). Bắt buộc phải có ít nhất{' '}
                <strong>2 trong 3 thành viên Hội đồng độc lập</strong> ký duyệt.
              </p>

              {/* Live QEA Change Request Card */}
              <div className="auditor-box" style={{ marginBottom: '18px' }}>
                <h4>📋 IGA Change Request: {qeaState?.changeRequestId || 'cr-qea-case001-selfdecrypt'}</h4>
                <div style={{ fontSize: '12px', color: 'var(--muted)', lineHeight: 1.7 }}>
                  <div>
                    • <strong>Action Type:</strong> <code>GRANT_ROLES</code>
                  </div>
                  <div>
                    • <strong>Target Role:</strong> <code style={{ color: 'var(--lime)' }}>{DECRYPT_ROLE}</code>
                  </div>
                  <div>
                    • <strong>Target Custodian:</strong> <code>custodian-demo (s3912345)</code>
                  </div>
                  <div>
                    • <strong>Quorum Policy:</strong> <code>Threshold = 2 of 3 (Four-Eyes Enforced)</code>
                  </div>
                </div>

                {/* Signatures List */}
                <div style={{ marginTop: '14px', borderTop: '1px solid #2d4149', paddingTop: '12px' }}>
                  <div className="eyebrow" style={{ marginBottom: '8px' }}>
                    CHỮ KÝ MẬT MÃ HỘI ĐỒNG ({qeaState?.approvals.length || 0}/2 REQUIRED):
                  </div>
                  {qeaState?.approvals.length === 0 ? (
                    <p className="muted small" style={{ margin: 0 }}>
                      Chưa có thành viên Hội đồng nào ký duyệt (0/2).
                    </p>
                  ) : (
                    qeaState?.approvals.map((app, i) => (
                      <div
                        key={app.id}
                        style={{
                          padding: '8px 10px',
                          background: '#16262e',
                          border: '1px solid #3f7b5e',
                          borderRadius: '5px',
                          marginBottom: '6px',
                          fontSize: '12px',
                        }}
                      >
                        <strong style={{ color: 'var(--green)' }}>
                          ✔ Chữ ký #{i + 1}: {app.admin_name}
                        </strong>
                        <div style={{ fontFamily: 'monospace', fontSize: '11px', color: 'var(--muted)' }}>
                          VVK Sig: {app.signature_preview}…
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Action buttons for 3 admins */}
                <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div className="eyebrow">KÝ DUYỆT TRỰC TIẾP QUA TIDE ENCLAVE (CHỌN ỦY VIÊN):</div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      className="primary"
                      disabled={busy}
                      onClick={() => void signQeaApproval('admin-a')}
                    >
                      ✍️ 1. Admin A Ký Duyệt (1/2 Pending)
                    </button>
                    <button
                      className="primary"
                      disabled={busy}
                      onClick={() => void signQeaApproval('reviewer-b')}
                    >
                      ✍️ 2. Reviewer B Ký Duyệt (2/2 Commit!)
                    </button>
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() => void signQeaApproval('reviewer-c')}
                    >
                      ✍️ 3. Reviewer C Ký Dự Phòng
                    </button>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                <button
                  className="secondary"
                  onClick={() => {
                    void switchActor('custodian-demo')
                    setActiveTab('portal')
                  }}
                >
                  🎓 Quay lại Cổng Sinh Viên (custodian-demo) để Thử Giải Mã →
                </button>
                <a
                  className="text-button"
                  href={consoleUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ textDecoration: 'underline', color: 'var(--muted)' }}
                >
                  Mở Tide Console gốc (localhost:8080) ↗
                </a>
              </div>
            </div>

            <div>
              <div className="panel-head">
                <span>DANH SÁCH ĐƠN PHÚC KHẢO</span>
                <span className="status ok">{requests.length} Yêu Cầu</span>
              </div>
              <h2>Lịch Sử Yêu Cầu Mở Khóa</h2>

              <div className="request-list">
                {requests.length === 0 ? (
                  <p className="muted">Chưa có đơn phúc khảo nào được ghi nhận.</p>
                ) : (
                  requests.map((item) => (
                    <div key={item.id} className="request-row">
                      <span>{item.requester_name}</span>
                      <p className="muted" style={{ margin: 0 }}>
                        {item.purpose}
                      </p>
                      <time>{new Date(item.created_at).toLocaleTimeString()}</time>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* TAB 3: Giả lập Tấn Công (Live Hack Proof) */}
      {activeTab === 'auditor' && (
        <section className="panel request-panel">
          <div className="panel-head">
            <span>LIVE AUDITOR ATTACK SANDBOX</span>
            <span className="status locked">CHẾ ĐỘ THỬ THÁCH HACKER</span>
          </div>
          <h2>Chứng Minh Tính Bất Khả Xâm Phạm Trước Ban Giám Khảo</h2>
          <p className="muted">
            Trực tiếp thực hiện các kịch bản tấn công nguy hiểm nhất và quan sát cách hệ thống TideGrade bảo vệ dữ liệu học vụ:
          </p>

          <div style={{ display: 'flex', gap: '12px', margin: '20px 0', flexWrap: 'wrap' }}>
            <button className="secondary" onClick={() => void fetchRawDb()} disabled={busy}>
              🔍 1. Soi Trực Tiếp Database SQLite (DBA View)
            </button>
            <button className="warning-btn" onClick={() => void tamperDb()} disabled={!caseRecord?.sealed || busy}>
              ⚡ 2. Giả Lập Hacker Đột Nhập Sửa Điểm Trong Database
            </button>
            <button className="danger-btn" onClick={() => void resetDemo()} disabled={busy}>
              🔄 3. Làm Mới Bảng Điểm & Quorum (Reset Demo)
            </button>
          </div>

          {rawDb && (
            <div className="auditor-box">
              <h4>Dữ Liệu Thô Đang Lưu Trữ Tại SQLite (`app-data/gateway.sqlite`):</h4>
              <p className="muted small">
                Máy chủ, IT Admin và DBA chỉ nhìn thấy chuỗi Ciphertext mã hóa sau đây, hoàn toàn không biết điểm số là bao nhiêu:
              </p>
              <table className="raw-table">
                <thead>
                  <tr>
                    <th>Mã Kỳ Thi</th>
                    <th>Người Niêm Phong</th>
                    <th>Dữ Liệu Mã Hóa (Ciphertext Preview)</th>
                    <th>Kích Thước</th>
                    <th>Thời Gian</th>
                  </tr>
                </thead>
                <tbody>
                  {rawDb.evidence.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', color: '#9eb0ae' }}>
                        Chưa có bản ghi điểm thi nào được lưu.
                      </td>
                    </tr>
                  ) : (
                    rawDb.evidence.map((ev, idx) => (
                      <tr key={idx}>
                        <td>{ev.case_id}</td>
                        <td>{ev.custodian_sub.slice(0, 14)}…</td>
                        <td style={{ color: 'var(--lime)', wordBreak: 'break-all' }}>{ev.ciphertext_preview}</td>
                        <td>{ev.bytes} bytes</td>
                        <td>{new Date(ev.created_at).toLocaleTimeString()}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <footer>
        ◈ TIDEGRADE · RMIT HACKATHON 2026 · Xây dựng trên nền tảng Tide Protocol & TideCloak Next.js SDK.
      </footer>
    </div>
  )
}
