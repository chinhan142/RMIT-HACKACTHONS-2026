async function inspectIdp() {
  const tokenRes = await fetch("http://localhost:8080/realms/master/protocol/openid-connect/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "username=admin&password=password&grant_type=password&client_id=admin-cli"
  });
  const { access_token } = await tokenRes.json();
  const idpRes = await fetch("http://localhost:8080/admin/realms/nextjs-test/identity-provider/instances/tide", {
    headers: { Authorization: `Bearer ${access_token}` }
  });
  const idp = await idpRes.json();
  console.log("IDP Tide Config:", idp);
  
  // Also check admin user attributes
  const userRes = await fetch("http://localhost:8080/admin/realms/nextjs-test/users/04ef7d69-ad81-43ef-ae0a-a762da5a1787", {
    headers: { Authorization: `Bearer ${access_token}` }
  });
  const user = await userRes.json();
  console.log("Admin user:", user);

  // Check federated identities of admin
  const fedRes = await fetch("http://localhost:8080/admin/realms/nextjs-test/users/04ef7d69-ad81-43ef-ae0a-a762da5a1787/federated-identity", {
    headers: { Authorization: `Bearer ${access_token}` }
  });
  const fed = await fedRes.json();
  console.log("Admin federated identity:", fed);
}
inspectIdp().catch(console.error);
