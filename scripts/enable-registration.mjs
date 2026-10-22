async function test() {
  const tokenRes = await fetch("http://localhost:8080/realms/master/protocol/openid-connect/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "username=admin&password=password&grant_type=password&client_id=admin-cli"
  });
  const { access_token } = await tokenRes.json();
  const realmRes = await fetch("http://localhost:8080/admin/realms/nextjs-test", {
    headers: { Authorization: `Bearer ${access_token}` }
  });
  const realm = await realmRes.json();
  console.log("registrationAllowed:", realm.registrationAllowed);
  console.log("loginWithEmailAllowed:", realm.loginWithEmailAllowed);

  // Enable registrationAllowed so users can self register or log in cleanly!
  if (!realm.registrationAllowed) {
    console.log("Enabling registrationAllowed on nextjs-test realm...");
    const updateRes = await fetch("http://localhost:8080/admin/realms/nextjs-test", {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${access_token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ registrationAllowed: true })
    });
    console.log("Update status:", updateRes.status);
  }
}
test().catch(console.error);
