# Proof/Gate — project context (internal)

## One-sentence pitch

A case custodian can seal a synthetic evidence record, but cannot unseal it until a TideCloak role change survives an independent QEA quorum.

## Hackathon scope

This is Challenge 2, Tide UNLOCKED. The prototype uses the existing Next.js 16 / React 19 scaffold, `@tidecloak/nextjs`, the local `nextjs-test` Tide realm and public OIDC client `myclient`. TideCloak runs separately on `localhost:8080`; the app runs on `localhost:3000`. App data lives in local SQLite (`app-data/gateway.sqlite`) via Node 24's `node:sqlite`, separate from TideCloak's H2 volume. All evidence content and case identifiers are synthetic.

The application demonstrates a narrow property: an IAM role grant does not take effect until the QEA change request reaches quorum, and Tide E2EE decrypt still requires the user's session and `_tide_case001.selfdecrypt` role. The MVP uses Tide Console for actual role changes and approval. The app's own access-request row is contextual information, **not** a QEA change request.

## Actors

| Actor | In prototype | Tide roles |
|---|---|---|
| Evidence custodian | Seals the sample using their own session, requests reopening, reads after approval | `_tide_case001.selfencrypt` initially; `_tide_case001.selfdecrypt` only after QEA |
| Admin A | Proposes/grants decrypt role, approves once | `tide-realm-admin` |
| Admin B | Independently approves same pending role change | `tide-realm-admin` |
| Admin C | Makes N=3 so Tide's current threshold is 2; can be reserve approver | `tide-realm-admin` |

The first admin alone has threshold 1. Three enrolled realm admins are required for the 2/3 demonstration. The `master` realm is outside QEA governance; do not claim every possible operator action is impossible. The app does not implement legal warrant issuance or real judicial roles.

## Trust boundaries

1. Browser: Tide login, self-encryption and self-decryption. Plaintext exists here when sealing/opening.
2. Next.js API: verifies Tide JWT plus DPoP, checks realm role and ownership, stores only Tide ciphertext.
3. SQLite: stores case metadata, request purpose, encrypted payload. Metadata and request purpose are not encrypted.
4. TideCloak / QEA: controls identity and governed role changes. It is not the app database.
5. Tide Fabric: provides the cryptographic operations invoked through the SDK.

`selfencrypt/selfdecrypt` is bound to a user's own identity in the current scaffold. This prototype deliberately seals and later opens with **the same custodian account**. Cross-user evidence sharing, a time-limited warrant, per-field judicial scope, immutable app audit logs, and an emergency override are future work requiring separately verified policy/design. Do not show them as implemented.

## API contract

| Endpoint | Purpose | Access |
|---|---|---|
| `GET /api/me` | Current verified subject and roles | Tide JWT + DPoP |
| `GET /api/cases` | Synthetic case metadata plus `sealed` flag | Tide JWT + DPoP |
| `PUT /api/cases/case-001/evidence` | Save browser-produced ciphertext once | Same user has encrypt role |
| `GET /api/cases/case-001/evidence` | Return ciphertext for browser decrypt | Same custodian subject + decrypt role |
| `POST /api/requests` | Save `{caseId,purpose}` for current user | Custodian of sealed evidence |
| `GET /api/requests` | List own requests; realm admins see all | Tide JWT + DPoP |

No route contains an approval shortcut or server-held plaintext key. `secureFetch` in the SDK turns a bearer call into DPoP token + proof; every API route verifies both.

## Demo success criteria

1. Custodian with encrypt-only role seals synthetic record; SQLite contains ciphertext, not the sample sentence.
2. Same account requests access and calls GET evidence; API returns 403.
3. Admin A proposes the decrypt role change; one approval leaves QEA pending.
4. Admin B approves; change commits. Custodian signs in again to get fresh role claims.
5. GET evidence returns ciphertext and `doDecrypt` reveals plaintext in browser.

## Source of truth

- Tide QEA: https://docs.tide.org/Core-Concepts/iga-workflow
- QEA setup: https://docs.tide.org/Admin/SetupIGA
- E2EE setup: https://docs.tide.org/Admin/e2ee
- Next.js auth pattern: https://docs.tide.org/Languages/NextJS/tidecloak-nextjs-discussion
- Raziel MCP: https://docs.tide.org/ai-agent-pack
