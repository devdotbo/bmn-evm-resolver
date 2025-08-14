// Unified error logging for CLI scripts. Logs full trace & nested causes.
// Use when you cannot rethrow, or before exiting.

import type { Hex } from "viem";

type AnyRecord = Record<string, unknown>;

export enum LogLevel {
  DEBUG = "DEBUG",
  INFO = "INFO",
  WARN = "WARN",
  ERROR = "ERROR",
}

export enum ErrorCategory {
  CONTRACT_REVERT = "CONTRACT_REVERT",
  NETWORK_ERROR = "NETWORK_ERROR",
  VALIDATION_ERROR = "VALIDATION_ERROR",
  FILE_ERROR = "FILE_ERROR",
  UNKNOWN = "UNKNOWN",
}

interface ErrorInfo {
  category: ErrorCategory;
  message: string;
  selector?: Hex;
  data?: Hex;
  chain?: AnyRecord[];
  context?: AnyRecord;
}

/**
 * Known revert selectors for better error messages
 */
const KNOWN_REVERTS: Record<string, string> = {
  "0x1b39b146": "BadSignature",
  "0x6a172882": "TransferFromMakerToTakerFailed", 
  "0x4e682690": "MakingAmountTooLow",
  "0x2c5211c6": "InvalidTime",
  "0xbfcd8365": "InvalidSecret",
  "0x4a094431": "InvalidImmutables",
  "0x0c2324e0": "SafeTransferFromFailed",
  "0x82b42900": "Unauthorized",
  "0x8e4a23d6": "InvalidExtensionHash",
  "0x0d1231f7": "ExtensionRequired",
};

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

function categorizeError(err: unknown): ErrorCategory {
  const message = (err as any)?.message?.toLowerCase() || "";
  const name = (err as any)?.name?.toLowerCase() || "";
  
  if (message.includes("revert") || message.includes("execution reverted") || name.includes("contract")) {
    return ErrorCategory.CONTRACT_REVERT;
  }
  if (message.includes("network") || message.includes("timeout") || message.includes("connection")) {
    return ErrorCategory.NETWORK_ERROR;
  }
  if (message.includes("invalid") || message.includes("validation") || message.includes("missing")) {
    return ErrorCategory.VALIDATION_ERROR;
  }
  if (message.includes("file") || message.includes("enoent") || message.includes("read")) {
    return ErrorCategory.FILE_ERROR;
  }
  
  return ErrorCategory.UNKNOWN;
}

export function log(level: LogLevel, message: string, data?: AnyRecord): void {
  const timestamp = new Date().toISOString();
  const output = {
    timestamp,
    level,
    message,
    ...(data && { data }),
  };
  
  switch (level) {
    case LogLevel.ERROR:
      console.error(safeStringify(output));
      break;
    case LogLevel.WARN:
      console.warn(safeStringify(output));
      break;
    case LogLevel.DEBUG:
      if (Deno.env.get("DEBUG")) {
        console.log(safeStringify(output));
      }
      break;
    default:
      console.log(safeStringify(output));
  }
}

export async function logErrorWithRevert(
  err: unknown,
  source: string,
  context?: AnyRecord,
): Promise<void> {
  try {
    const errorInfo: ErrorInfo = {
      category: categorizeError(err),
      message: (err as any)?.message || String(err),
      chain: getErrorChain(err),
      context,
    };

    // Try to extract revert information
    try {
      const { decodeRevert } = await import("./limit-order.ts");
      const dec = (decodeRevert as any)(err);
      if (dec?.selector) {
        errorInfo.selector = dec.selector;
        errorInfo.data = dec.data;
        
        // Look up known revert reason
        const knownReason = KNOWN_REVERTS[dec.selector];
        if (knownReason) {
          errorInfo.message = `${knownReason}: ${errorInfo.message}`;
        }
      }
    } catch {
      // ignore if decode not possible
    }

    // Structured error output
    console.error("================== ERROR REPORT ==================");
    console.error(`Source: ${source}`);
    console.error(`Category: ${errorInfo.category}`);
    console.error(`Message: ${errorInfo.message}`);
    
    if (errorInfo.selector) {
      console.error(`Revert Selector: ${errorInfo.selector}`);
      const knownReason = KNOWN_REVERTS[errorInfo.selector];
      if (knownReason) {
        console.error(`Revert Reason: ${knownReason}`);
      }
    }
    
    if (errorInfo.data) {
      console.error(`Revert Data: ${errorInfo.data}`);
    }
    
    if (context) {
      console.error(`Context: ${safeStringify(context)}`);
    }
    
    console.error("\n--- Error Chain ---");
    errorInfo.chain?.forEach((item: AnyRecord, index: number) => {
      console.error(`[${index}] ${item.name || "Unknown"}: ${item.message}`);
      if (Deno.env.get("DEBUG") && item.stack) {
        console.error(item.stack);
      }
    });
    
    console.error("================================================");
    
    // Also log as structured data for parsing
    if (Deno.env.get("LOG_JSON")) {
      log(LogLevel.ERROR, `Error in ${source}`, errorInfo as unknown as AnyRecord);
    }
    
  } catch (loggingFailure) {
    // As a last resort, print something
    console.error("error_logging_failed", loggingFailure);
    console.error("original_error", err);
  }
}

export function logSuccess(source: string, message: string, data?: AnyRecord): void {
  log(LogLevel.INFO, `[${source}] ${message}`, data);
}

export function logWarning(source: string, message: string, data?: AnyRecord): void {
  log(LogLevel.WARN, `[${source}] ${message}`, data);
}

export function logDebug(source: string, message: string, data?: AnyRecord): void {
  log(LogLevel.DEBUG, `[${source}] ${message}`, data);
}


