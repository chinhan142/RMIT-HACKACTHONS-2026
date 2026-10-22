import 'server-only'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

export type CaseRecord = {
  id: string
  title: string
  summary: string
  source: string
  student_id?: string
  student_name?: string
  course_code?: string
  created_at: string
}

export type EvidenceRecord = {
  case_id: string
  custodian_sub: string
  ciphertext: string
  created_at: string
}

export type AccessRequest = {
  id: number
  case_id: string
  requester_sub: string
  requester_name: string
  purpose: string
  created_at: string
}

export type QeaApproval = {
  id: number
  case_id: string
  admin_sub: string
  admin_name: string
  signature_preview: string
  created_at: string
}

export type QeaState = {
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

const dbPath = process.env.APP_DB_PATH || join(process.cwd(), 'app-data', 'gateway.sqlite')
let connection: DatabaseSync | undefined

function database(): DatabaseSync {
  if (connection) return connection
  mkdirSync(dirname(dbPath), { recursive: true })
  const db = new DatabaseSync(dbPath)
  db.exec('PRAGMA busy_timeout = 5000;')
  db.exec(`
  CREATE TABLE IF NOT EXISTS cases (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    source TEXT NOT NULL,
    student_id TEXT DEFAULT 's3912345',
    student_name TEXT DEFAULT 'Hoang Nguyen',
    course_code TEXT DEFAULT 'COSC2759',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS evidence (
    case_id TEXT PRIMARY KEY REFERENCES cases(id),
    custodian_sub TEXT NOT NULL,
    ciphertext TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS access_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    case_id TEXT NOT NULL REFERENCES cases(id),
    requester_sub TEXT NOT NULL,
    requester_name TEXT NOT NULL,
    purpose TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS qea_approvals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    case_id TEXT NOT NULL,
    admin_sub TEXT NOT NULL,
    admin_name TEXT NOT NULL,
    signature_preview TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(case_id, admin_sub)
  );
  `)
  
  db.prepare(`INSERT OR IGNORE INTO cases (id, title, summary, source, student_id, student_name, course_code) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
    'case-001',
    'Bảng Điểm Thi Cuối Kỳ — COSC2759 Distributed Systems & Security',
    'Hồ sơ điểm thi sinh viên RMIT s3912345 (Hoang Nguyen) được niêm phong mật mã E2EE bằng Tide Protocol. Ngăn chặn triệt để mọi hành vi xem lén hoặc sửa điểm từ Hacker, DBA và Admin đơn lẻ.',
    'Phòng Khảo thí & Đảm bảo Chất lượng Đào tạo RMIT',
    's3912345',
    'Hoang Nguyen',
    'COSC2759',
  )

  connection = db
  return db
}

export function getCases(): CaseRecord[] {
  return database().prepare('SELECT * FROM cases ORDER BY created_at DESC').all() as CaseRecord[]
}

export function getCase(id: string): CaseRecord | undefined {
  return database().prepare('SELECT * FROM cases WHERE id = ?').get(id) as CaseRecord | undefined
}

export function getEvidence(caseId: string): EvidenceRecord | undefined {
  return database().prepare('SELECT * FROM evidence WHERE case_id = ?').get(caseId) as EvidenceRecord | undefined
}

export function createEvidence(caseId: string, custodianSub: string, ciphertext: string): void {
  database().prepare('INSERT INTO evidence (case_id, custodian_sub, ciphertext) VALUES (?, ?, ?)').run(caseId, custodianSub, ciphertext)
}

export function resetEvidence(caseId: string): void {
  const db = database()
  db.prepare('DELETE FROM evidence WHERE case_id = ?').run(caseId)
  db.prepare('DELETE FROM access_requests WHERE case_id = ?').run(caseId)
  db.prepare('DELETE FROM qea_approvals WHERE case_id = ?').run(caseId)
}

export function getQeaState(caseId = 'case-001'): QeaState {
  const db = database()
  const approvals = db
    .prepare('SELECT * FROM qea_approvals WHERE case_id = ? ORDER BY id ASC')
    .all(caseId) as QeaApproval[]
  const threshold = 2
  const committed = approvals.length >= threshold
  return {
    changeRequestId: 'cr-qea-case001-selfdecrypt',
    caseId,
    actionType: 'GRANT_ROLES',
    targetRole: `_tide_${caseId.replaceAll('-', '')}.selfdecrypt`,
    targetUser: 'custodian-demo',
    threshold,
    totalAdmins: 3,
    status: committed ? 'COMMITTED' : 'PENDING',
    readyToCommit: committed,
    approvals,
  }
}

export function approveQeaChangeRequest(
  caseId: string,
  adminSub: string,
  adminName: string
): { state: QeaState; alreadyApproved?: boolean } {
  const db = database()
  const existing = db
    .prepare('SELECT id FROM qea_approvals WHERE case_id = ? AND admin_sub = ?')
    .get(caseId, adminSub)
  if (existing) {
    return { state: getQeaState(caseId), alreadyApproved: true }
  }
  const sig = `EdDSA_ORK_VVK_${Buffer.from(`${adminSub}:${caseId}:${Date.now()}`).toString('base64').slice(0, 36)}`
  db.prepare(
    'INSERT INTO qea_approvals (case_id, admin_sub, admin_name, signature_preview) VALUES (?, ?, ?, ?)'
  ).run(caseId, adminSub, adminName, sig)
  return { state: getQeaState(caseId) }
}

export function tamperEvidence(caseId: string): { original: string; tampered: string } {
  const db = database()
  const ev = getEvidence(caseId)
  if (!ev) throw new Error('No evidence to tamper')
  const original = ev.ciphertext
  const tampered = original.length > 30 
    ? original.substring(0, 15) + 'BAD_TAMPERED_PAYLOAD_HACKER_ATTEMPT' + original.substring(50)
    : 'CORRUPTED_' + original
  db.prepare('UPDATE evidence SET ciphertext = ? WHERE case_id = ?').run(tampered, caseId)
  return { original, tampered }
}

export function createRequest(caseId: string, sub: string, name: string, purpose: string): AccessRequest {
  const db = database()
  const result = db.prepare('INSERT INTO access_requests (case_id, requester_sub, requester_name, purpose) VALUES (?, ?, ?, ?)')
    .run(caseId, sub, name, purpose)
  return db.prepare('SELECT * FROM access_requests WHERE id = ?').get(Number(result.lastInsertRowid)) as AccessRequest
}

export function getRequests(sub?: string): AccessRequest[] {
  const db = database()
  if (sub) return db.prepare('SELECT * FROM access_requests WHERE requester_sub = ? ORDER BY id DESC').all(sub) as AccessRequest[]
  return db.prepare('SELECT * FROM access_requests ORDER BY id DESC').all() as AccessRequest[]
}

export function getRawDbState() {
  const db = database()
  return {
    cases: db.prepare('SELECT * FROM cases').all(),
    evidence: db.prepare("SELECT case_id, custodian_sub, substr(ciphertext, 1, 40) || '...' AS ciphertext_preview, length(ciphertext) AS bytes, created_at FROM evidence").all(),
    requests: db.prepare('SELECT * FROM access_requests').all(),
    qeaApprovals: db.prepare('SELECT * FROM qea_approvals').all(),
  }
}
