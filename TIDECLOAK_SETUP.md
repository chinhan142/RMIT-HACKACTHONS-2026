# TideCloak manual setup for the existing realm

Target realm: `nextjs-test`; OIDC client: `myclient`; Tide Console: `http://localhost:8080/realms/nextjs-test/tide-console/`.

The repo's `init/realm.json` is only an initialization template. Editing it will not update the already running realm. Perform live changes in Tide Console and approve each governed request.

## 0. Check current configuration

1. Start the **existing** TideCloak Docker container and inspect logs. Do not remove the container/volume.
2. Confirm `http://localhost:8080/` loads and `nextjs-test` exists.
3. In Apps → `myclient`, check redirect URIs include `http://localhost:3000/*` and web origin is `http://localhost:3000`. If changed, QEA must approve the config request.
4. Confirm the Tide IDP and dev license are active, then test app login.

## 1. Create custodian and two more independent admins

1. Open `http://localhost:8080/realms/nextjs-test/tide-console/` and sign in as the **first enrolled QEA admin** (Admin A). This is a user inside `nextjs-test`, not the bootstrap admin of the `master` realm. In People, verify Admin A holds `tide-realm-admin`.
2. In People → Add a user, create `reviewer-b` with a unique email. Copy the **one-time Tide enrollment link** shown after creation. Open that link in a separate browser profile/private window and enroll a distinct Tide account for B. Return to Admin A's profile. The one-time link is on `localhost`, so for a fast local demo open it on the same machine; a teammate's own `localhost` points at their laptop.
3. Enable Advanced (bottom-left). In Roles → Realm roles → `tide-realm-admin`, assign B; if the UI offers it under People → `reviewer-b` → Role mapping, that is equivalent. This creates a QEA change request. In QEA Approvals, Admin A opens and authorizes it. With only A and B present, the documented threshold is still 1, so the change should commit.
4. Repeat People → Add a user and separate Tide enrollment for `reviewer-c`. Assign `tide-realm-admin` to C and authorize that change. Once A, B and C all hold the role, N=3 and the documented threshold is 2.
5. Create a normal user `custodian-demo` and enroll its own Tide account, distinct from A/B/C. This account seals and later opens sample evidence. In separate browser profiles you can keep admin and custodian sessions apart.

If you want fewer approval clicks during setup, create the two tag roles and grant the custodian's **encrypt-only** role before adding C. Do not grant decrypt until the actual demo. One admin alone has threshold 1; two admins also have threshold 1. Do not start the 1/2 demonstration until N=3. Verify in QEA Approvals that one approval of the demo role grant leaves the request pending.

## 2. Create exact roles

Under Advanced → Roles → Realm roles, create:

- `_tide_case001.selfencrypt`
- `_tide_case001.selfdecrypt`

Approve the resulting QEA change requests. Grant **only** `_tide_case001.selfencrypt` to `custodian-demo` initially, then approve that change. Check that `_tide_case001.selfdecrypt` is not assigned to the custodian and not included in default roles. The starter realm's `_tide_message.*` roles are unrelated; do not use the `message` tag for this demo.

## 3. Live demonstration

1. Log in to the app as `custodian-demo`; seal synthetic evidence using tag `case001`.
2. Submit a purpose; try to open evidence. Confirm actual API 403.
3. Admin A uses People or Roles to assign `_tide_case001.selfdecrypt` to `custodian-demo`. This governed write enters QEA Pending.
4. Admin A Authorize: capture that one approval does not apply the role.
5. Admin B signs into the Tide Console separately and Authorize: the CR auto-commits at quorum.
6. Custodian signs out/in to get a fresh token. Open the evidence; show ciphertext returned by API and plaintext decrypted only in browser.

The app does **not** issue legal warrants. The administrators in this demo represent independent governance actors, not verified judicial office holders. Time expiry, cross-user decrypt, provider data integration and immutable application audit logs are not implemented.

References: https://docs.tide.org/Admin/SetupIGA and https://docs.tide.org/Admin/e2ee
