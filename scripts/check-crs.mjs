async function check() {
  const tokenRes = await fetch("http://localhost:8080/realms/master/protocol/openid-connect/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "username=admin&password=password&grant_type=password&client_id=admin-cli"
  });
  const { access_token } = await tokenRes.json();
  const roles = await fetch("http://localhost:8080/admin/realms/nextjs-test/roles", {
    headers: { Authorization: `Bearer ${access_token}` }
  }).then(r => r.json());
  console.log("Roles:", roles.map(r => r.name));

  const crs = await fetch("http://localhost:8080/admin/realms/nextjs-test/iga/change-requests?status=PENDING", {
    headers: { Authorization: `Bearer ${access_token}` }
  }).then(r => r.json());
  console.log("Pending CRs count:", crs.length);
  for (const cr of crs) {
    console.log(`CR ID: ${cr.id}, action: ${cr.actionType}, threshold: ${cr.threshold}, rows:`, JSON.stringify(cr.rows));
  }
}
check().catch(console.error);
