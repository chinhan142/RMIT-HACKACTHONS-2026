async function run() {
  const tokenRes = await fetch("http://localhost:8080/realms/master/protocol/openid-connect/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "username=admin&password=password&grant_type=password&client_id=admin-cli"
  });
  const { access_token } = await tokenRes.json();
  const userId = '04ef7d69-ad81-43ef-ae0a-a762da5a1787';
  
  const mappingsRes = await fetch(`http://localhost:8080/admin/realms/nextjs-test/users/${userId}/role-mappings/realm`, {
    headers: { Authorization: `Bearer ${access_token}` }
  });
  const mappings = await mappingsRes.json();
  console.log("=== ADMIN'S CURRENT ROLES ===");
  console.log(mappings.map(r => r.name));
}

run().catch(console.error);
