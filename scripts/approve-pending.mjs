async function approveAllPending() {
  const tokenRes = await fetch("http://localhost:8080/realms/master/protocol/openid-connect/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "username=admin&password=password&grant_type=password&client_id=admin-cli"
  });
  const { access_token } = await tokenRes.json();
  const crs = await fetch("http://localhost:8080/admin/realms/nextjs-test/iga/change-requests?status=PENDING", {
    headers: { Authorization: `Bearer ${access_token}` }
  }).then(r => r.json());
  console.log("Pending CRs to approve:", crs.length);
  for (const cr of crs) {
    console.log(`Approving ${cr.id} (${cr.actionType})...`);
    const app = await fetch(`http://localhost:8080/admin/realms/nextjs-test/iga/change-requests/${cr.id}/approve`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access_token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({})
    });
    console.log(`Status for ${cr.id}:`, app.status);
  }
}
approveAllPending().catch(console.error);
