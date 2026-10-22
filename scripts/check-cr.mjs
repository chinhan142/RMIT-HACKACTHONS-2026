async function test() {
  const tokenRes = await fetch("http://localhost:8080/realms/master/protocol/openid-connect/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "username=admin&password=password&grant_type=password&client_id=admin-cli"
  });
  const { access_token } = await tokenRes.json();
  const cr = await fetch("http://localhost:8080/admin/realms/nextjs-test/iga/change-requests/b6737a66-e7df-43fa-b1f9-8254cd8cb56b", {
    headers: { Authorization: `Bearer ${access_token}` }
  }).then(r => r.json());
  console.log("CR Status:", cr.status, "readyToCommit:", cr.readyToCommit, "authorizers:", cr.authorizers);
  
  // Try commit if needed
  if (cr.status !== 'COMMITTED') {
    const commitRes = await fetch("http://localhost:8080/admin/realms/nextjs-test/iga/change-requests/b6737a66-e7df-43fa-b1f9-8254cd8cb56b/commit", {
      method: "POST",
      headers: { Authorization: `Bearer ${access_token}` }
    });
    console.log("Commit status:", commitRes.status);
  }

  const mappings = await fetch("http://localhost:8080/admin/realms/nextjs-test/users/04ef7d69-ad81-43ef-ae0a-a762da5a1787/role-mappings/realm", {
    headers: { Authorization: `Bearer ${access_token}` }
  }).then(r => r.json());
  console.log("Admin Roles now:", mappings.map(r => r.name));
}
test().catch(console.error);
