async function run() {
  const tokenRes = await fetch("http://localhost:8080/realms/master/protocol/openid-connect/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "username=admin&password=password&grant_type=password&client_id=admin-cli"
  });
  const { access_token } = await tokenRes.json();
  const userId = '04ef7d69-ad81-43ef-ae0a-a762da5a1787';

  // 1. Get role definition for _tide_case001.selfencrypt
  const roleRes = await fetch("http://localhost:8080/admin/realms/nextjs-test/roles/_tide_case001.selfencrypt", {
    headers: { Authorization: `Bearer ${access_token}` }
  });
  const role = await roleRes.json();
  console.log("Target Role:", role);

  // 2. Assign role to admin
  const assignRes = await fetch(`http://localhost:8080/admin/realms/nextjs-test/users/${userId}/role-mappings/realm`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${access_token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify([role])
  });
  console.log("Assign status:", assignRes.status, assignRes.statusText);

  // 3. Check pending IGA change requests
  const crRes = await fetch("http://localhost:8080/admin/realms/nextjs-test/iga/change-requests?status=PENDING", {
    headers: { Authorization: `Bearer ${access_token}` }
  });
  const crs = await crRes.json();
  console.log("Pending Change Requests:", crs);

  // 4. If any change requests, approve them!
  if (Array.isArray(crs)) {
    for (const cr of crs) {
      console.log(`Approving Change Request ${cr.id}...`);
      const appRes = await fetch(`http://localhost:8080/admin/realms/nextjs-test/iga/change-requests/${cr.id}/approve`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${access_token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({})
      });
      console.log(`Approve ${cr.id} status:`, appRes.status);
    }
  }

  // 5. Re-check admin's roles
  const mappingsRes = await fetch(`http://localhost:8080/admin/realms/nextjs-test/users/${userId}/role-mappings/realm`, {
    headers: { Authorization: `Bearer ${access_token}` }
  });
  const mappings = await mappingsRes.json();
  console.log("Updated Admin Roles:", mappings.map(r => r.name));
}

run().catch(console.error);
