import type { Address } from "viem";

/**
 * PostInteraction Error Handler for v2.2.0
 * 
 * Handles various error scenarios that can occur during PostInteraction execution
 * and provides recovery strategies.
 */

export enum PostInteractionErrorType {
  INSUFFICIENT_ALLOWANCE = "INSUFFICIENT_ALLOWANCE",
  INSUFFICIENT_BALANCE = "INSUFFICIENT_BALANCE",
  RESOLVER_NOT_WHITELISTED = "RESOLVER_NOT_WHITELISTED",
  FACTORY_PAUSED = "FACTORY_PAUSED",
  INVALID_EXTENSION_DATA = "INVALID_EXTENSION_DATA",
  ESCROW_ALREADY_EXISTS = "ESCROW_ALREADY_EXISTS",
  INVALID_HASHLOCK = "INVALID_HASHLOCK",
  INVALID_TIMELOCKS = "INVALID_TIMELOCKS",
  TRANSACTION_REVERTED = "TRANSACTION_REVERTED",
  UNKNOWN_ERROR = "UNKNOWN_ERROR",
}

export interface PostInteractionError {
  type: PostInteractionErrorType;
  message: string;
  details?: any;
  recoverable: boolean;
  suggestedAction?: string;
}

export class PostInteractionErrorHandler {
  /**
   * Parse error message and determine error type
   * @param error Raw error from transaction
   * @returns Parsed error with type and recovery information
   */
  static parseError(error: any): PostInteractionError {
    const errorMessage = error.message || error.toString();
    const errorLower = errorMessage.toLowerCase();

    // Check for insufficient allowance
    if (
      errorLower.includes("insufficient allowance") ||
      errorLower.includes("erc20: insufficient allowance") ||
      errorLower.includes("transfer amount exceeds allowance")
    ) {
      return {
        type: PostInteractionErrorType.INSUFFICIENT_ALLOWANCE,
        message: "Factory doesn't have sufficient token allowance",
        details: error,
        recoverable: true,
        suggestedAction: "Approve the factory contract for token transfers",
      };
    }

    // Check for insufficient balance
    if (
      errorLower.includes("insufficient balance") ||
      errorLower.includes("erc20: transfer amount exceeds balance") ||
      errorLower.includes("transfer exceeds balance")
    ) {
      return {
        type: PostInteractionErrorType.INSUFFICIENT_BALANCE,
        message: "Insufficient token balance for the swap",
        details: error,
        recoverable: false,
        suggestedAction: "Ensure sufficient token balance before retrying",
      };
    }

    // Check for whitelist issues
    if (
      errorLower.includes("not whitelisted") ||
      errorLower.includes("unauthorized resolver") ||
      errorLower.includes("resolver not authorized")
    ) {
      return {
        type: PostInteractionErrorType.RESOLVER_NOT_WHITELISTED,
        message: "Resolver is not whitelisted on the factory",
        details: error,
        recoverable: false,
        suggestedAction: "Contact factory owner to whitelist resolver address",
      };
    }

    // Check if factory is paused
    if (
      errorLower.includes("paused") ||
      errorLower.includes("pausable: paused") ||
      errorLower.includes("contract is paused")
    ) {
      return {
        type: PostInteractionErrorType.FACTORY_PAUSED,
        message: "Factory contract is currently paused",
        details: error,
        recoverable: true,
        suggestedAction: "Wait for factory to be unpaused and retry",
      };
    }

    // Check for invalid extension data
    if (
      errorLower.includes("invalid extension") ||
      errorLower.includes("invalid data") ||
      errorLower.includes("decode error") ||
      errorLower.includes("abi decode")
    ) {
      return {
        type: PostInteractionErrorType.INVALID_EXTENSION_DATA,
        message: "Extension data format is invalid",
        details: error,
        recoverable: false,
        suggestedAction: "Check extension data encoding matches v2.2.0 format",
      };
    }

    // Check for duplicate escrow
    if (
      errorLower.includes("escrow already exists") ||
      errorLower.includes("already initialized") ||
      errorLower.includes("duplicate escrow")
    ) {
      return {
        type: PostInteractionErrorType.ESCROW_ALREADY_EXISTS,
        message: "Escrow with these parameters already exists",
        details: error,
        recoverable: false,
        suggestedAction: "Use different nonce or parameters",
      };
    }

    // Check for invalid hashlock
    if (
      errorLower.includes("invalid hashlock") ||
      errorLower.includes("zero hashlock")
    ) {
      return {
        type: PostInteractionErrorType.INVALID_HASHLOCK,
        message: "Invalid or zero hashlock provided",
        details: error,
        recoverable: false,
        suggestedAction: "Ensure hashlock is properly generated",
      };
    }

    // Check for invalid timelocks
    if (
      errorLower.includes("invalid timelock") ||
      errorLower.includes("timelock expired") ||
      errorLower.includes("timelock too short")
    ) {
      return {
        type: PostInteractionErrorType.INVALID_TIMELOCKS,
        message: "Invalid timelock parameters",
        details: error,
        recoverable: false,
        suggestedAction: "Check timelock values are in the future and properly formatted",
      };
    }

    // Check for general revert
    if (
      errorLower.includes("revert") ||
      errorLower.includes("execution reverted")
    ) {
      return {
        type: PostInteractionErrorType.TRANSACTION_REVERTED,
        message: "Transaction reverted during execution",
        details: error,
        recoverable: false,
        suggestedAction: "Check all parameters and contract state",
      };
    }

    // Unknown error
    return {
      type: PostInteractionErrorType.UNKNOWN_ERROR,
      message: "Unknown error occurred",
      details: error,
      recoverable: false,
      suggestedAction: "Review transaction details and logs",
    };
  }

  /**
   * Handle PostInteraction error with automatic recovery attempts
   * @param error The error that occurred
   * @param context Additional context for error handling
   * @returns Recovery result or throws if unrecoverable
   */
  static async handleError(
    error: any,
    context: {
      orderHash?: string;
      resolverAddress?: Address;
      factoryAddress?: Address;
      tokenAddress?: Address;
      amount?: bigint;
    }
  ): Promise<{ retry: boolean; action?: string }> {
    const parsedError = this.parseError(error);
    
    console.error(`\n❌ PostInteraction Error: ${parsedError.message}`);
    console.error(`   Type: ${parsedError.type}`);
    console.error(`   Recoverable: ${parsedError.recoverable}`);
    
    if (parsedError.suggestedAction) {
      console.error(`   Suggested Action: ${parsedError.suggestedAction}`);
    }

    // Log context information
    if (context.orderHash) {
      console.error(`   Order Hash: ${context.orderHash}`);
    }
    if (context.resolverAddress) {
      console.error(`   Resolver: ${context.resolverAddress}`);
    }
    if (context.factoryAddress) {
      console.error(`   Factory: ${context.factoryAddress}`);
    }

    // Handle specific error types
    switch (parsedError.type) {
      case PostInteractionErrorType.INSUFFICIENT_ALLOWANCE:
        console.log("\n🔧 Attempting to fix allowance issue...");
        return {
          retry: true,
          action: "APPROVE_FACTORY",
        };

      case PostInteractionErrorType.FACTORY_PAUSED:
        console.log("\n⏸️ Factory is paused. Waiting before retry...");
        // Wait 30 seconds before suggesting retry
        await new Promise((resolve) => setTimeout(resolve, 30000));
        return {
          retry: true,
          action: "WAIT_AND_RETRY",
        };

      case PostInteractionErrorType.RESOLVER_NOT_WHITELISTED:
        console.error("\n🚫 Fatal: Resolver not whitelisted");
        throw new Error(
          `Resolver ${context.resolverAddress} is not whitelisted on factory ${context.factoryAddress}`
        );

      case PostInteractionErrorType.INVALID_EXTENSION_DATA:
        console.error("\n🚫 Fatal: Invalid extension data format");
        throw new Error(
          "Extension data encoding doesn't match v2.2.0 specification"
        );

      case PostInteractionErrorType.ESCROW_ALREADY_EXISTS:
        console.warn("\n⚠️ Escrow already exists, order may have been filled");
        return {
          retry: false,
          action: "CHECK_EXISTING_ESCROW",
        };

      default:
        // For unknown or unrecoverable errors, throw
        if (!parsedError.recoverable) {
          throw new Error(`Unrecoverable error: ${parsedError.message}`);
        }
        
        // For potentially recoverable unknown errors, suggest retry with delay
        console.log("\n🔄 Unknown error, waiting before retry...");
        await new Promise((resolve) => setTimeout(resolve, 10000));
        return {
          retry: true,
          action: "RETRY_WITH_DELAY",
        };
    }
  }

  /**
   * Create a user-friendly error message
   * @param error The error that occurred
   * @returns User-friendly error message
   */
  static getUserMessage(error: any): string {
    const parsedError = this.parseError(error);
    
    switch (parsedError.type) {
      case PostInteractionErrorType.INSUFFICIENT_ALLOWANCE:
        return "Please approve the factory contract to transfer your tokens.";
      
      case PostInteractionErrorType.INSUFFICIENT_BALANCE:
        return "You don't have enough tokens for this swap.";
      
      case PostInteractionErrorType.RESOLVER_NOT_WHITELISTED:
        return "The resolver is not authorized. Please contact support.";
      
      case PostInteractionErrorType.FACTORY_PAUSED:
        return "The system is temporarily paused for maintenance. Please try again later.";
      
      case PostInteractionErrorType.INVALID_EXTENSION_DATA:
        return "There's an issue with the order data. Please try creating a new order.";
      
      case PostInteractionErrorType.ESCROW_ALREADY_EXISTS:
        return "This order may have already been processed.";
      
      case PostInteractionErrorType.INVALID_HASHLOCK:
        return "Invalid swap parameters. Please create a new order.";
      
      case PostInteractionErrorType.INVALID_TIMELOCKS:
        return "The swap timing parameters are invalid. Please create a new order.";
      
      default:
        return "An unexpected error occurred. Please try again or contact support.";
    }
  }

  /**
   * Log error details for debugging
   * @param error The error that occurred
   * @param verbose Whether to include full error details
   */
  static logError(error: any, verbose: boolean = false): void {
    const parsedError = this.parseError(error);
    
    console.error("═══════════════════════════════════════");
    console.error("PostInteraction Error Report");
    console.error("═══════════════════════════════════════");
    console.error(`Time: ${new Date().toISOString()}`);
    console.error(`Type: ${parsedError.type}`);
    console.error(`Message: ${parsedError.message}`);
    console.error(`Recoverable: ${parsedError.recoverable}`);
    
    if (parsedError.suggestedAction) {
      console.error(`Action: ${parsedError.suggestedAction}`);
    }
    
    if (verbose && parsedError.details) {
      console.error("\nFull Error Details:");
      console.error(parsedError.details);
    }
    
    console.error("═══════════════════════════════════════\n");
  }
}