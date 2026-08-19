/**
 * PKCE (RFC 7636) primitives on WebCrypto, so they run everywhere the SDK
 * does. spoo.me's device flow mandates S256; plain is not supported.
 */

export interface PkcePair {
  /** Random secret the app keeps until the code exchange. 43 chars, base64url. */
  verifier: string;
  /** S256 challenge derived from the verifier, sent in the authorization URL. */
  challenge: string;
}

export async function generatePkcePair(): Promise<PkcePair> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const verifier = base64url(bytes);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: base64url(new Uint8Array(digest)) };
}

/** Random state parameter for CSRF binding of the authorization redirect. */
export function generateState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

export function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Decode a JWT payload without verifying it. Verification is the server's job;
 * the client only reads `exp` to schedule proactive refresh. */
export function decodeJwtPayload(token: string): Record<string, unknown> | undefined {
  const part = token.split(".")[1];
  if (part === undefined) return undefined;
  try {
    const padded = part.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}
