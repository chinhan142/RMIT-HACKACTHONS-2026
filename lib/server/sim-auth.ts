import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { verifyTideCloakToken } from '@tidecloak/nextjs/server'
import tcConfig from '../../tidecloak.json'
import { verifyDpopProof } from '../verify-dpop'
import { getQeaState } from './sim-db'

export type Principal = {
  sub: string
  name: string
  roles: string[]
  simulated?: boolean
  dpopThumbprint?: string
}

type AuthResult = { principal: Principal; error?: never } | { principal?: never; error: NextResponse }

const SIMULATED_ACTORS: Record<string, { sub: string; name: string; baseRoles: string[]; jkt: string }> = {
  'custodian-demo': {
    sub: '14f791c7f7a62339394694d22428e956f3bad77f42aec4c2bc1a8172dc171983',
    name: 'custodian-demo (Lecturer / Student)',
    baseRoles: ['_tide_case001.selfencrypt', 'appUser', 'offline_access'],
    jkt: 'dpop_jkt_es256_custodian_9f8e7d6c5b4a',
  },
  'admin-a': {
    sub: '04ef7d69-ad81-43ef-ae0a-a762da5a1787',
    name: 'admin-a (Exam Board Member 1/3)',
    baseRoles: ['tide-realm-admin', '_tide_case001.selfencrypt', 'appUser', 'offline_access'],
    jkt: 'dpop_jkt_es256_adminA_1a2b3c4d5e6f',
  },
  'reviewer-b': {
    sub: '4ce912bc-45e2-490b-856d-432dabe9e700',
    name: 'reviewer-b (Dean of School 2/3)',
    baseRoles: ['tide-realm-admin', 'appUser', 'offline_access'],
    jkt: 'dpop_jkt_es256_reviewerB_7a8b9c0d1e2f',
  },
  'reviewer-c': {
    sub: '3094ff7c-55fe-4368-a3f1-e493cbc76133',
    name: 'reviewer-c (Academic Auditor 3/3)',
    baseRoles: ['tide-realm-admin', 'appUser', 'offline_access'],
    jkt: 'dpop_jkt_es256_reviewerC_3f4e5d6c7b8a',
  },
}

export async function authenticate(request: NextRequest): Promise<AuthResult> {
  const simActorKey = request.headers.get('x-tide-sim-actor')
  if (simActorKey && SIMULATED_ACTORS[simActorKey]) {
    const actor = SIMULATED_ACTORS[simActorKey]
    const qea = getQeaState('case-001')
    const roles = [...actor.baseRoles]
    if (qea.status === 'COMMITTED' && (simActorKey === 'custodian-demo' || simActorKey === 'admin-a')) {
      if (!roles.includes('_tide_case001.selfdecrypt')) {
        roles.push('_tide_case001.selfdecrypt')
      }
    }
    return {
      principal: {
        sub: actor.sub,
        name: actor.name,
        roles,
        simulated: true,
        dpopThumbprint: actor.jkt,
      },
    }
  }

  const header = request.headers.get('authorization')
  if (!header?.startsWith('DPoP ')) {
    return { error: NextResponse.json({ error: 'DPoP token required' }, { status: 401 }) }
  }
  const token = header.slice(5)
  try {
    const claims = (await verifyTideCloakToken(tcConfig, token)) as Record<string, unknown> | null
    if (!claims || typeof claims.sub !== 'string') {
      return { error: NextResponse.json({ error: 'Invalid token' }, { status: 401 }) }
    }
    const boundJkt = (claims.cnf as Record<string, unknown> | undefined)?.jkt
    if (!(await verifyDpopProof(request.headers.get('dpop'), token, boundJkt, request.method, request.url))) {
      return { error: NextResponse.json({ error: 'Invalid DPoP proof' }, { status: 401 }) }
    }
    const access = claims.realm_access as { roles?: unknown } | undefined
    const clientAccess = claims.resource_access as Record<string, { roles?: unknown }> | undefined
    const realmRoles = Array.isArray(access?.roles)
      ? access.roles.filter((value): value is string => typeof value === 'string')
      : []
    const rmRoles = Array.isArray(clientAccess?.['realm-management']?.roles)
      ? clientAccess['realm-management'].roles.filter((value): value is string => typeof value === 'string')
      : []
    const roles = Array.from(new Set([...realmRoles, ...rmRoles]))

    const qea = getQeaState('case-001')
    if (qea.status === 'COMMITTED' && !roles.includes('_tide_case001.selfdecrypt')) {
      roles.push('_tide_case001.selfdecrypt')
    }

    return {
      principal: {
        sub: claims.sub,
        name: typeof claims.preferred_username === 'string' ? claims.preferred_username : claims.sub,
        roles,
        simulated: false,
        dpopThumbprint: typeof boundJkt === 'string' ? boundJkt : undefined,
      },
    }
  } catch {
    return { error: NextResponse.json({ error: 'Token verification failed' }, { status: 401 }) }
  }
}

export function hasRole(principal: Principal, role: string): boolean {
  return principal.roles.includes(role)
}
