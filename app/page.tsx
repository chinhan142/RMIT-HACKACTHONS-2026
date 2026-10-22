'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTideCloak } from '@tidecloak/nextjs'

const SIM_ACTORS = [
  {
    id: 'custodian-demo',
    label: '🎓 custodian-demo (Lecturer / Student)',
    desc: 'Holds _tide_case001.selfencrypt. Blocked from decrypting (403) until 2/3 QEA Quorum commits.',
  },
  {
    id: 'admin-a',
    label: '🏛️ admin-a (Exam Board Member 1/3)',
    desc: 'Holds tide-realm-admin. Casts the 1st QEA approval vote (1/2 Pending — still locked).',
  },
  {
    id: 'reviewer-b',
    label: '🏛️ reviewer-b (Dean of School 2/3)',
    desc: 'Holds tide-realm-admin. Casts the 2nd independent QEA vote (2/2 Auto-Commit).',
  },
  {
    id: 'reviewer-c',
    label: '🏛️ reviewer-c (Academic Auditor 3/3)',
    desc: 'Holds tide-realm-admin. Reserve governance member ensuring N=3 (Threshold = 2).',
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
      setError(cause instanceof Error ? cause.message : 'Sign-in failed')
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
          <span className="brand-muted">| RMIT VIETNAM</span>
        </div>
        <div className="eyebrow">RMIT HACKATHON 2026 · TIDE UNLOCKED CHALLENGE</div>
        <h1>
          Tamper-proof exam grades:<br />
          <em>zero-knowledge, quorum-governed.</em>
        </h1>
        <p>
          Cryptographic Academic Grade Vault powered by <strong>TideCloak Client-Side E2EE</strong> and{' '}
          <strong>Quorum-Enforced Authorization (2-of-3 Multi-Admin QEA)</strong>. Eliminates unauthorized grade
          reads or tampering by hackers, database administrators, and single rogue insiders.
        </p>

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '18px' }}>
          <button
            className="primary"
            style={{ marginTop: 0 }}
            onClick={() => enterSimulation('custodian-demo')}
          >
            🚀 Launch TideCloak Interactive Demo (Simulated DPoP + 2/3 Quorum) →
          </button>
          <button
            className="secondary"
            onClick={onLogin}
            disabled={isInitializing}
          >
            {isInitializing ? 'Connecting to TideCloak…' : '🔐 Sign in via TideCloak ORK Live'}
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
            QUICK-SELECT TIDECLOAK CRYPTOGRAPHIC IDENTITY (SIMULATED DPoP + RBAC + QEA 2/3):
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
        <span>01 — LECTURER CLIENT-SIDE E2EE</span>
        <span>02 — ZERO-KNOWLEDGE SQLITE</span>
        <span>03 — 2-OF-3 QEA BOARD QUORUM</span>
        <span>04 — VERIFIED STUDENT DECRYPT</span>
      </div>
    </main>
  )
}
