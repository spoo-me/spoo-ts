// Sign in with Spoo from a connected app (authorization-code + PKCE).
// The SDK handles the protocol; your app drives the browser and stores tokens.
// Your app_id and its exact redirect URI must be registered with spoo.me.
import { Spoo, generatePkcePair, generateState } from "spoo.me";

const spoo = new Spoo(); // anonymous: the flow endpoints need no credentials

// 1. Send the user to consent
const pkce = await generatePkcePair();
const state = generateState();
const url = spoo.oauth.authorizationUrl({
  appId: "your-app",
  redirectUri: "http://127.0.0.1:53682/callback",
  state,
  codeChallenge: pkce.challenge,
});
console.log("Open:", url);

// 2. Your callback receives ?code=...&state=... — verify state, then exchange.
declare const codeFromCallback: string;
const tokens = await spoo.oauth.exchangeCode({
  code: codeFromCallback,
  codeVerifier: pkce.verifier,
});
console.log("Signed in as", tokens.user.email);

// 3. Wrap the pair in a self-refreshing provider and use the API.
// Refresh tokens rotate: persist every pair onRefresh hands you, the old
// refresh token is dead the moment it fires.
const provider = spoo.oauth.tokenProvider({
  tokens,
  onRefresh: (next) => saveToSecureStorage(next),
});

const client = new Spoo({ token: provider });
for await (const link of await client.links.list()) {
  console.log(link.alias, link.total_clicks);
}

// When the refresh token is rejected (grant revoked, session expired), calls
// throw SessionExpiredError: catch it and send the user back to step 1.

declare function saveToSecureStorage(t: { access_token: string; refresh_token: string }): void;
