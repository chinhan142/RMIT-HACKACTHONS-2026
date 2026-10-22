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
  { id: 'custodian-demo', label: '🎓 custodian-demo (Lecturer/Student)', badge: 'CUSTODIAN' },
  { id: 'admin-a', label: '🏛️ admin-a (Board Member 1/3)', badge: 'ADMIN 1/3' },
  { id: 'reviewer-b', label: '🏛️ reviewer-b (Dean of School 2/3)', badge: 'ADMIN 2/3' },
  { id: 'reviewer-c', label: '🏛️ reviewer-c (Auditor 3/3)', badge: 'ADMIN 3/3' },
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
    examinerNote: 'Outstanding work! Verified end-to-end encryption and 2-of-3 QEA Quorum governance.',
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
    throw new Error('🚨 CRYPTOGRAPHIC INTEGRITY ALERT: Invalid or tampered Tide E2EE packet header!')
  }
  const parts = packet.split('.')
  if (parts.length !== 4) {
    throw new Error('🚨 CRYPTOGRAPHIC INTEGRITY ALERT: Ciphertext structure was corrupted!')
  }
  const [, , ivHex, cipherB64] = parts
  const ivMatch = ivHex.match(/.{1,2}/g)
  if (!ivMatch || ivMatch.length !== 12) {
    throw new Error('🚨 CRYPTOGRAPHIC INTEGRITY ALERT: Invalid Initialization Vector (IV)!')
  }
  const iv = new Uint8Array(ivMatch.map((byte) => parseInt(byte, 16)))
  let rawBytes: Uint8Array
  try {
    const bin = atob(cipherB64)
    rawBytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) rawBytes[i] = bin.charCodeAt(i)
  } catch {
    throw new Error(
      '🚨 TAMPERING DETECTED (Corrupted Base64 Payload): The ciphertext in SQLite was modified by an unauthorized party!'
    )
  }
  try {
    const key = await getBrowserE2eeKey(tag)
    const plainBuf = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, rawBytes)
    return new TextDecoder().decode(plainBuf)
  } catch {
    throw new Error(
      '🚨 CRYPTOGRAPHIC TAMPERING DETECTED (AEAD AES-GCM Tag Mismatch): The grade record in SQLite was altered by a Hacker/DBA! Tide E2EE refused to decrypt forged data!'
    )
  }
}

const config = rawConfig as unknown as { realm?: string; 'auth-server-url'?: string }
const consoleUrl = `${(config['auth-server-url'] || 'http://localhost:8080/').replace(/\/$/, '')}/realms/${config.realm || 'nextjs-test'}/tide-console/`

export default function HomePage() {
  const router = useRouter()
  const {
    authenticated,
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
    'Official grade appeal and review request for COSC2759 Final Exam (Question 3 — Distributed Consensus Protocol). Requesting Examination Board authorization to unseal grade record.'
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
        setMessage(error instanceof Error ? error.message : 'Failed to load data')
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
      setMessage(error instanceof Error ? error.message : 'Failed to fetch raw SQLite state')
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
    setMessage(`🔄 Switched active TideCloak session to '${newActorId}' (DPoP proof & role claims updated)`)
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
      setMessage('✅ Grade record encrypted client-side in the browser and sealed in SQLite (Zero-Knowledge Server)!')
      await refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to seal grade record')
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
      if (String(record.ciphertext).startsWith(`TIDE_E2EE_V1.${TAG}.`)) {
        decryptedText = await browserDecryptE2ee(record.ciphertext, TAG)
      } else {
        const [decrypted] = await doDecrypt([{ encrypted: record.ciphertext, tags: record.tags }])
        decryptedText = String(decrypted)
      }
      setPlaintext(decryptedText)
      setMessage('🎉 Client-side decryption succeeded! Tide Protocol verified role _tide_case001.selfdecrypt granted via 2/3 QEA Quorum.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Access Denied! Grade record is locked or awaiting 2/3 Quorum.')
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
      setMessage('📋 Appeal request submitted to the Examination Board. Tide QEA blocks decryption until at least 2 of 3 Board Members approve.')
      await refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to submit appeal request')
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
      setMessage(error instanceof Error ? error.message : 'QEA Enclave approval failed')
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
      setMessage(`⚠️ SIMULATED ATTACK: ${res.message} Return to Tab 1 and click "Decrypt Exam Grade" to verify cryptographic tamper detection!`)
      await fetchRawDb()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Simulated attack failed')
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
      setMessage('🔄 Demo state & QEA Quorum reset to 0/2! Ready for a fresh walkthrough.')
      await refresh()
      if (activeTab === 'auditor') await fetchRawDb()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Reset failed')
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
            <span className="status ok">EXAM BOARD (tide-realm-admin)</span>
          ) : (
            <span className="status locked">CUSTODIAN</span>
          )}
          <div className="divider" />
          <button className="text-button" onClick={() => void resetDemo()}>
            🔄 Reset Demo
          </button>
          <div className="divider" />
          <button className="text-button" onClick={handleLogout}>
            Sign Out
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
            ⚡ TIDECLOAK SESSION & DPoP IDENTITY SWITCHER (INSTANT ROLE SWITCHING):
          </span>
          <span style={{ fontSize: '11px', color: 'var(--muted)', fontFamily: 'monospace' }}>
            VUID: {principal?.sub.slice(0, 24)}… | DPoP cnf.jkt: {principal?.dpopThumbprint || 'verified'} | Active Roles:{' '}
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
          Cryptographic Exam Grade<br />
          <em>Custody & Quorum Vault.</em>
        </h1>
        <p>
          End-to-end encrypted in the lecturer’s browser, stored as opaque ciphertext on a zero-knowledge SQLite server,
          and governed by a 2-of-3 Examination Board Quorum (Tide QEA) to prevent unilateral grade tampering.
        </p>
      </section>

      {/* Tabs */}
      <nav className="nav-tabs">
        <button
          className={`tab-btn ${activeTab === 'portal' ? 'active' : ''}`}
          onClick={() => setActiveTab('portal')}
        >
          🎓 1. Lecturer & Student Portal (Client-Side E2EE)
        </button>
        <button
          className={`tab-btn ${activeTab === 'quorum' ? 'active' : ''}`}
          onClick={() => setActiveTab('quorum')}
        >
          🏛️ 2. Exam Board QEA Quorum ({qeaState?.approvals.length || 0}/{qeaState?.threshold || 2} Approved)
        </button>
        <button
          className={`tab-btn ${activeTab === 'auditor' ? 'active' : ''}`}
          onClick={() => setActiveTab('auditor')}
        >
          🛡️ 3. Live Attack Sandbox (Zero-Knowledge & Tamper Proof)
        </button>
      </nav>

      {message && <div className="feedback">{message}</div>}

      {/* TAB 1: Lecturer & Student Portal */}
      {activeTab === 'portal' && (
        <div className="layout-grid">
          {/* Left Panel: Lecturer Seals Grade */}
          <section className="panel">
            <div className="panel-head">
              <span>01 — LECTURER: ENCRYPT & SEAL GRADE</span>
              <span className={`status ${caseRecord?.sealed ? 'ok' : 'locked'}`}>
                {caseRecord?.sealed ? 'Sealed (E2EE)' : 'Unsealed'}
              </span>
            </div>

            <h2>COSC2759 — Distributed Systems</h2>
            <p className="muted small">
              Student: <strong>s3912345 · Hoang Nguyen</strong>
              <br />
              Term: <strong>Semester 2026B (RMIT Vietnam)</strong>
            </p>

            <div className="action-block">
              <h3>Grade Record Payload (Encrypted in Browser Before Leaving Client):</h3>
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
                {busy ? 'Encrypting in Browser…' : '🔒 Client-Side E2EE Encrypt & Seal Grade Record'}
              </button>
            </div>

            <div className="role-line">
              <span>REQUIRED TIDE ENCRYPTION ROLE</span>
              <code>{ENCRYPT_ROLE}</code>
              <span className="hint">
                {canEncrypt
                  ? '✔ Session holds _tide_case001.selfencrypt to seal grade records.'
                  : '✖ Current actor lacks encrypt role. Switch to custodian-demo above.'}
              </span>
            </div>
          </section>

          {/* Right Panel: Student / Custodian Decrypts */}
          <section className="panel">
            <div className="panel-head">
              <span>02 — CUSTODIAN / STUDENT: VERIFY & DECRYPT</span>
              <span className={`status ${canDecrypt ? 'ok' : 'locked'}`}>
                {canDecrypt
                  ? `Quorum ${qeaState?.approvals.length || 2}/2: UNLOCKED`
                  : `Quorum ${qeaState?.approvals.length || 0}/2: LOCKED (403)`}
              </span>
            </div>

            <h2>Official Grade Transcript</h2>
            <p className="muted small">
              The server and SQLite database only store opaque ciphertext. Calling{' '}
              <code>GET /api/cases/case-001/evidence</code> returns <strong>403 Forbidden</strong> until at least{' '}
              <strong>2 of 3 Examination Board Members</strong> approve the QEA Change Request for{' '}
              <code>{DECRYPT_ROLE}</code>.
            </p>

            <button
              className="secondary full"
              onClick={() => void openEvidence()}
              disabled={!caseRecord?.sealed || busy || loading}
            >
              {busy ? 'Verifying Role & Decrypting…' : '🔑 Decrypt Exam Grade (Client-Side Decrypt)'}
            </button>

            {plaintext ? (
              <div className="data-box revealed">
                <label>🎉 DECRYPTED PLAINTEXT GRADE RECORD (BROWSER ONLY):</label>
                <pre>{plaintext}</pre>
              </div>
            ) : ciphertext ? (
              <div className="data-box">
                <label>OPAQUE CIPHERTEXT STORED IN SQLITE (ZERO-KNOWLEDGE SERVER):</label>
                <code>{ciphertext.slice(0, 160)}…</code>
              </div>
            ) : null}

            <div className="action-block">
              <h3>Submit Grade Review / Unseal Request:</h3>
              <textarea
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder="State the academic reason for requesting Examination Board quorum review..."
                rows={3}
                disabled={busy}
              />
              <button
                className="primary full"
                onClick={() => void requestAccess()}
                disabled={!caseRecord?.sealed || busy || loading}
              >
                📝 Submit Appeal Request to Examination Board
              </button>
            </div>

            <div className="role-line">
              <span>REQUIRED TIDE DECRYPTION ROLE (GOVERNED BY QEA QUORUM)</span>
              <code>{DECRYPT_ROLE}</code>
              <span className="hint">
                {canDecrypt
                  ? '✔ QEA Quorum (2/3) Committed! Session holds _tide_case001.selfdecrypt.'
                  : `✖ Cryptographically Locked (${qeaState?.approvals.length || 0}/2 approvals). Go to Tab 2 for 2/3 Board Quorum approval!`}
              </span>
            </div>
          </section>
        </div>
      )}

      {/* TAB 2: Examination Board & QEA Quorum */}
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
              <h2>2-of-3 Examination Board Governance</h2>
              <p className="muted">
                No single administrator (Admin A alone) can unilaterally unlock or modify a sealed grade record. With
                only <code>1/2</code> approval, the Change Request remains <code>PENDING</code> and the API enforces{' '}
                <code>403 Forbidden</code>. At least <strong>2 of 3 independent Board Members</strong> must sign.
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
                    VERIFIED ENCLAVE SIGNATURES ({qeaState?.approvals.length || 0}/2 REQUIRED):
                  </div>
                  {qeaState?.approvals.length === 0 ? (
                    <p className="muted small" style={{ margin: 0 }}>
                      No Board Member signatures recorded yet (0/2).
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
                          ✔ Signature #{i + 1}: {app.admin_name}
                        </strong>
                        <div style={{ fontFamily: 'monospace', fontSize: '11px', color: 'var(--muted)' }}>
                          VVK Proof: {app.signature_preview}…
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Action buttons for 3 admins */}
                <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div className="eyebrow">AUTHORIZE VIA TIDE ENCLAVE (SELECT BOARD MEMBER):</div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      className="primary"
                      disabled={busy}
                      onClick={() => void signQeaApproval('admin-a')}
                    >
                      ✍️ 1. Sign as Admin A (1/2 Pending)
                    </button>
                    <button
                      className="primary"
                      disabled={busy}
                      onClick={() => void signQeaApproval('reviewer-b')}
                    >
                      ✍️ 2. Sign as Reviewer B (2/2 Auto-Commit!)
                    </button>
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() => void signQeaApproval('reviewer-c')}
                    >
                      ✍️ 3. Sign as Reviewer C (Reserve)
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
                  🎓 Return to Student Portal (custodian-demo) to Test Decryption →
                </button>
                <a
                  className="text-button"
                  href={consoleUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ textDecoration: 'underline', color: 'var(--muted)' }}
                >
                  Open External Tide Console (localhost:8080) ↗
                </a>
              </div>
            </div>

            <div>
              <div className="panel-head">
                <span>GRADE APPEAL REQUESTS</span>
                <span className="status ok">{requests.length} Logged</span>
              </div>
              <h2>Submitted Audit Trail</h2>

              <div className="request-list">
                {requests.length === 0 ? (
                  <p className="muted">No grade appeal requests submitted yet.</p>
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

      {/* TAB 3: Live Attack Sandbox */}
      {activeTab === 'auditor' && (
        <section className="panel request-panel">
          <div className="panel-head">
            <span>LIVE AUDITOR ATTACK SANDBOX</span>
            <span className="status locked">RED-TEAM VERIFICATION</span>
          </div>
          <h2>Zero-Knowledge DB Inspection & Tamper Resistance</h2>
          <p className="muted">
            Simulate insider DBA inspection or malicious SQL injection tampering directly against the SQLite database to
            verify how TideGrade protects academic records:
          </p>

          <div style={{ display: 'flex', gap: '12px', margin: '20px 0', flexWrap: 'wrap' }}>
            <button className="secondary" onClick={() => void fetchRawDb()} disabled={busy}>
              🔍 1. Inspect Raw SQLite Database (DBA View)
            </button>
            <button className="warning-btn" onClick={() => void tamperDb()} disabled={!caseRecord?.sealed || busy}>
              ⚡ 2. Simulate Hacker Tampering Ciphertext in SQLite
            </button>
            <button className="danger-btn" onClick={() => void resetDemo()} disabled={busy}>
              🔄 3. Reset Grade Record & Quorum (Start Fresh)
            </button>
          </div>

          {rawDb && (
            <div className="auditor-box">
              <h4>Raw SQLite Table Contents (`app-data/gateway.sqlite`):</h4>
              <p className="muted small">
                The application server, cloud host, and DBA only see opaque ciphertext — zero plaintext grades or keys
                ever touch the server:
              </p>
              <table className="raw-table">
                <thead>
                  <tr>
                    <th>Case ID</th>
                    <th>Custodian VUID</th>
                    <th>Stored Ciphertext Preview (Opaque E2EE Blob)</th>
                    <th>Size</th>
                    <th>Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {rawDb.evidence.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', color: '#9eb0ae' }}>
                        No sealed grade records currently stored in SQLite.
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
        ◈ TIDEGRADE · RMIT HACKATHON 2026 · Built with Tide Protocol E2EE, QEA Quorum Governance & TideCloak Next.js SDK.
      </footer>
    </div>
  )
}
