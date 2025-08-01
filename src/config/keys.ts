/**
 * Load private key from environment variable
 */
export function loadPrivateKey(envVar: string): `0x${string}` {
  const key = Deno.env.get(envVar);
  
  if (!key) {
    throw new Error(`${envVar} environment variable not set`);
  }
  
  if (!key.startsWith("0x")) {
    throw new Error(`${envVar} must start with 0x`);
  }
  
  if (key.length !== 66) {
    throw new Error(`${envVar} must be 66 characters (0x + 64 hex chars)`);
  }
  
  return key as `0x${string}`;
}