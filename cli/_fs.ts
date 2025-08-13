// Minimal FS helpers for atomic writes & directories
export async function ensureDir(path: string): Promise<void> {
  try {
    await Deno.mkdir(path, { recursive: true });
  } catch (_e) {
    // ignore
  }
}

export async function atomicWriteJson(path: string, data: unknown): Promise<void> {
  const tmp = `${path}.tmp`;
  await Deno.writeTextFile(tmp, JSON.stringify(data, null, 2));
  await Deno.rename(tmp, path);
}

export async function readJson<T = unknown>(path: string): Promise<T> {
  const text = await Deno.readTextFile(path);
  return JSON.parse(text) as T;
}

export function nowMs(): number {
  return Date.now();
}

export function toBigInt(value: string | number | bigint): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(value);
  if (typeof value === "string") return value.startsWith("0x") ? BigInt(value) : BigInt(value);
  throw new Error("Unsupported bigint input");
}


