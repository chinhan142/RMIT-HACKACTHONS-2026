# Proof/Gate implementation plan (internal)

## Priority and ownership

| Priority | Work | Owner | Acceptance |
|---|---|---|---|
| P0 | Keep existing Tide login, strict DPoP and OIDC client working | Integrator | Login reaches `/home`; `/api/me` verifies token and proof |
| P0 | SQLite cases/evidence/access requests | BE | One synthetic case; evidence column contains ciphertext only |
| P0 | Authenticated API with owner + realm-role checks | BE | Missing role is a real 403 from server; no client-only gate |
| P0 | Seal, request, attempt, decrypt UI | FE | One click path for each demo beat; error and success states visible |
| P0 | Three admins, distinct Tide accounts, encrypt/decrypt roles | Realm operator | QEA shows 2 approvals needed, decrypt role absent initially |
| P1 | README, demo script, video | Integrator | Another team member can replay all five demo beats |
| Later | App-side QEA API orchestration, Forseti per-case policy, expiry, cross-user sharing | Post-MVP | Must be independently implemented and tested before claiming |

## Two-agent edit boundaries

**BE agent:** `app/api/**`, `lib/server/**`. Keep token verification and DPoP enforcement in one helper. Use `node:sqlite`; do not add admin credentials to the browser or call the master realm for bypass. Report API status and DB schema.

**FE agent:** `app/page.tsx`, `app/home/page.tsx`, `app/globals.css`, components if needed. Reuse the existing `TideCloakProvider`; call Tide `doEncrypt`/`doDecrypt` in browser and `secureFetch` for app APIs. Do not fake approval state.

**Integrator:** realm setup, repo README, end-to-end validation, recording. Do not run two agents editing `app/layout.tsx` or shared config simultaneously.

## Sequence

1. Confirm Docker TideCloak is running, existing `nextjs-test` realm and `myclient` work, `tidecloak.json` points to localhost. Do not rerun `npm run init` against a working realm.
2. Provision custodian and two additional Tide-enrolled realm admins. Create `_tide_case001.selfencrypt` and `_tide_case001.selfdecrypt`. Give only encrypt to custodian initially; do not add decrypt to `default-roles-nextjs-test`.
3. Start app on port 3000; custodian login; seal evidence from browser. Inspect DB ciphertext.
4. Submit app request; attempt open and capture 403.
5. Admin A grants decrypt role to custodian, then approves pending QEA CR. Capture 1/2 still pending.
6. Admin B approves. Custodian logs out/in and decrypts. Capture success.
7. Record video and document exact functional vs future capabilities.

## Tide Raziel MCP usage

The repo already has Tide remote MCP configuration in `opencode.json`. If your coding client supports remote MCP, connect `https://mcp.tide.org/mcp`; otherwise use Tide's documented `npx -y @tideorg/mcp` configuration. Raziel supplies read-only guidance/playbooks and does not operate the local realm itself.

Useful requests to Raziel:

- “Review this Next.js 16 `@tidecloak/nextjs` strict-DPoP API flow; identify any missing verification steps.”
- “For realm `nextjs-test`, explain exact QEA Console steps to create tag roles and ensure decrypt is not in default roles.”
- “Check whether `doEncrypt`/`doDecrypt` with `selfencrypt/selfdecrypt` can share data between distinct users. Cite the canon; do not infer.”
- “Review this prototype’s trust boundary. List what Tide guarantees versus what app SQLite and the server do not guarantee.”

Use the Console or Management API for live changes. A tool name shown in a slide is not proof that the MCP can mutate your instance; verify the actual exposed MCP capability before asking an agent to call it.

## Technical risks and gates

| Gate | Failure response |
|---|---|
| Fewer than 3 realm admins | Demo quorum is not 2/3; enroll third admin before recording |
| Decrypt role in default roles | Remove it through QEA; new session must lack role before demo |
| `doEncrypt` fails | Check Tide license, QEA, Tide IDP login, exact tag role and SDK input string |
| API returns 401 to `secureFetch` | Check current token, DPoP proof URL/method, callback and port 3000 |
| SDK returns non-text encrypted payload | Adapt storage encoding deliberately; do not stringify bytes implicitly |
| Docker is stopped | Start existing container and preserve its H2 volume; do not recreate realm blindly |

## Submission check

Push source, project context, setup/runbook and a video file or working link. Keep `tidecloak.json`, local DB, `.env` and real credentials out of Git. The venue slide specifies a GitHub repository with source, README and video by 18:00 Vietnam time on 22 Oct 2026.
