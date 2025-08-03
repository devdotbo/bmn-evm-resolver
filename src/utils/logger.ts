/**
 * Enhanced logging utilities for mainnet operations
 */

import { isMainnetMode } from "../config/chain-selector.ts";

// Log levels
export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
  TRACE = 4,
}

// ANSI color codes
const COLORS = {
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  green: "\x1b[32m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
  reset: "\x1b[0m",
};

// Log level colors
const LEVEL_COLORS = {
  [LogLevel.ERROR]: COLORS.red,
  [LogLevel.WARN]: COLORS.yellow,
  [LogLevel.INFO]: COLORS.green,
  [LogLevel.DEBUG]: COLORS.blue,
  [LogLevel.TRACE]: COLORS.gray,
};

// Log level names
const LEVEL_NAMES = {
  [LogLevel.ERROR]: "ERROR",
  [LogLevel.WARN]: "WARN",
  [LogLevel.INFO]: "INFO",
  [LogLevel.DEBUG]: "DEBUG",
  [LogLevel.TRACE]: "TRACE",
};

/**
 * Logger class with enhanced mainnet features
 */
export class Logger {
  private context: string;
  private minLevel: LogLevel;
  private logFile?: string;

  constructor(context: string) {
    this.context = context;
    this.minLevel = this.getLogLevelFromEnv();
    
    // Enable file logging for mainnet
    if (isMainnetMode() && Deno.env.get("LOG_FILE")) {
      this.logFile = Deno.env.get("LOG_FILE");
    }
  }

  /**
   * Get log level from environment
   */
  private getLogLevelFromEnv(): LogLevel {
    const level = Deno.env.get("LOG_LEVEL")?.toUpperCase();
    
    switch (level) {
      case "ERROR": return LogLevel.ERROR;
      case "WARN": return LogLevel.WARN;
      case "INFO": return LogLevel.INFO;
      case "DEBUG": return LogLevel.DEBUG;
      case "TRACE": return LogLevel.TRACE;
      default:
        // Default to INFO for mainnet, DEBUG for testnet
        return isMainnetMode() ? LogLevel.INFO : LogLevel.DEBUG;
    }
  }

  /**
   * Format log message
   */
  private formatMessage(
    level: LogLevel,
    message: string,
    data?: any
  ): { console: string; file: string } {
    const timestamp = new Date().toISOString();
    const levelName = LEVEL_NAMES[level];
    const levelColor = LEVEL_COLORS[level];
    
    // Console format with colors
    let consoleMsg = `${COLORS.gray}[${timestamp}]${COLORS.reset} `;
    consoleMsg += `${levelColor}[${levelName}]${COLORS.reset} `;
    consoleMsg += `${COLORS.cyan}[${this.context}]${COLORS.reset} `;
    consoleMsg += message;
    
    // File format without colors
    let fileMsg = `[${timestamp}] [${levelName}] [${this.context}] ${message}`;
    
    // Add data if provided
    if (data !== undefined) {
      const dataStr = typeof data === "object" 
        ? JSON.stringify(data, null, 2)
        : String(data);
      
      consoleMsg += `\n${COLORS.gray}${dataStr}${COLORS.reset}`;
      fileMsg += `\n${dataStr}`;
    }
    
    return { console: consoleMsg, file: fileMsg };
  }

  /**
   * Write to log file
   */
  private async writeToFile(message: string): Promise<void> {
    if (!this.logFile) return;
    
    try {
      await Deno.writeTextFile(this.logFile, message + "\n", { append: true });
    } catch (error) {
      console.error("Failed to write to log file:", error);
    }
  }

  /**
   * Log message
   */
  private log(level: LogLevel, message: string, data?: any): void {
    if (level > this.minLevel) return;
    
    const formatted = this.formatMessage(level, message, data);
    
    // Console output
    if (level === LogLevel.ERROR) {
      console.error(formatted.console);
    } else if (level === LogLevel.WARN) {
      console.warn(formatted.console);
    } else {
      console.log(formatted.console);
    }
    
    // File output for mainnet
    if (this.logFile) {
      this.writeToFile(formatted.file);
    }
  }

  // Public logging methods
  error(message: string, data?: any): void {
    this.log(LogLevel.ERROR, message, data);
  }

  warn(message: string, data?: any): void {
    this.log(LogLevel.WARN, message, data);
  }

  info(message: string, data?: any): void {
    this.log(LogLevel.INFO, message, data);
  }

  debug(message: string, data?: any): void {
    this.log(LogLevel.DEBUG, message, data);
  }

  trace(message: string, data?: any): void {
    this.log(LogLevel.TRACE, message, data);
  }

  /**
   * Log transaction details
   */
  logTransaction(
    action: string,
    txHash: string,
    details?: {
      from?: string;
      to?: string;
      value?: bigint;
      gasUsed?: bigint;
      status?: string;
      chain?: string;
    }
  ): void {
    const chain = details?.chain || "unknown";
    const explorer = this.getExplorerUrl(chain, txHash);
    
    this.info(`${action} - Transaction: ${txHash}`, {
      ...details,
      explorer,
      value: details?.value ? `${details.value} wei` : undefined,
      gasUsed: details?.gasUsed ? `${details.gasUsed} gas` : undefined,
    });
  }

  /**
   * Log order lifecycle event
   */
  logOrderEvent(
    orderId: string,
    event: string,
    details?: Record<string, any>
  ): void {
    const level = event.includes("Failed") || event.includes("Error") 
      ? LogLevel.ERROR 
      : LogLevel.INFO;
    
    this.log(level, `Order ${orderId} - ${event}`, details);
  }

  /**
   * Get explorer URL for transaction
   */
  private getExplorerUrl(chain: string, txHash: string): string {
    const explorers: Record<string, string> = {
      base: `https://basescan.org/tx/${txHash}`,
      etherlink: `https://explorer.etherlink.com/tx/${txHash}`,
      "8453": `https://basescan.org/tx/${txHash}`,
      "42793": `https://explorer.etherlink.com/tx/${txHash}`,
    };
    
    return explorers[chain] || txHash;
  }

  /**
   * Create child logger with additional context
   */
  child(subContext: string): Logger {
    return new Logger(`${this.context}:${subContext}`);
  }
}

// Global logger instances
export const rootLogger = new Logger("BMN-Resolver");
export const resolverLogger = rootLogger.child("Resolver");
export const executorLogger = rootLogger.child("Executor");
export const monitorLogger = rootLogger.child("Monitor");
export const aliceLogger = rootLogger.child("Alice");