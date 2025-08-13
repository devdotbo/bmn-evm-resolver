// Unified error logging for CLI scripts. Logs full trace & nested causes.
// Use when you cannot rethrow, or before exiting.

type AnyRecord = Record<string, unknown>;

function getErrorChain(err: unknown): AnyRecord[] {
  const chain: AnyRecord[] = [];
  let current: any = err;
  const maxDepth = 6;
  let depth = 0;
  while (current && depth < maxDepth) {
    chain.push({
      name: current?.name,
      message: current?.message ?? String(current),
      stack: current?.stack,
      data: current?.data ?? current?.error?.data ?? current?.cause?.data,
    });
    current = current?.cause;
    depth++;
  }
  return chain;
}

function safeStringify(value: unknown): string {
  const seen = new WeakSet();
  return JSON.stringify(value, (_key, val) => {
    if (typeof val === "object" && val !== null) {
      if (seen.has(val as object)) return "[Circular]";
      seen.add(val as object);
    }
    if (typeof val === "bigint") return (val as bigint).toString();
    return val;
  }, 2);
}

export async function logErrorWithRevert(
  err: unknown,
  source: string,
  context?: AnyRecord,
): Promise<void> {
  try {
    // Basic label
    console.error(`error_source: ${source}`);

    // Context if provided
    if (context) {
      try {
        console.error(`error_context: ${safeStringify(context)}`);
      } catch {
        // ignore stringify failures
      }
    }

    // Full chain dump
    const chain = getErrorChain(err);
    console.error(`error_chain: ${safeStringify(chain)}`);

    // Raw object (best-effort)
    try {
      console.error(`error_raw: ${safeStringify(err)}`);
    } catch {
      // ignore
    }

    // Attempt decode of revert using LOP ABI helper
    try {
      const { decodeRevert } = await import("./limit-order.ts");
      const dec = (decodeRevert as any)(err);
      if (dec?.selector) console.error(`revert_selector: ${dec.selector}`);
      if (dec?.data) console.error(`revert_data: ${dec.data}`);
    } catch {
      // ignore if decode not possible
    }

    // Also print stack if present
    const stack = (err as any)?.stack;
    if (stack) console.error(stack);
  } catch (loggingFailure) {
    // As a last resort, print something
    console.error("error_logging_failed", loggingFailure);
    console.error("original_error", err);
  }
}


