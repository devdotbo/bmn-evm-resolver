#!/usr/bin/env -S deno run --allow-net --allow-read --allow-write --allow-env

/**
 * Setup test environment for Bridge-Me-Not integration tests
 * - Funds test accounts with ETH and tokens
 * - Approves token spending
 * - Verifies contract deployments
 * - Checks indexer connection
 */

import { parseArgs } from "https://deno.land/std@0.208.0/cli/parse_args.ts";
import { parseEther, formatEther, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getChains, getChainName } from "../src/config/chain-selector.ts";
import { getContractAddresses, loadContractAddressesFromEnv, BMN_TOKEN_CONFIG } from "../src/config/contracts.ts";
import { 
  createPublicClientForChain, 
  createWalletClientForChain,
  createERC20Token,
  waitForTransaction 
} from "../src/utils/contracts.ts";

// Test configuration
const MIN_ETH_BALANCE = parseEther("0.1"); // Minimum 0.1 ETH for gas
const MIN_TOKEN_BALANCE = parseEther("100"); // Minimum 100 tokens
const FUND_AMOUNT_ETH = parseEther("1"); // Fund 1 ETH if needed
const FUND_AMOUNT_TOKENS = parseEther("1000"); // Fund 1000 tokens if needed

// Colors for output
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const BLUE = "\x1b[34m";
const RESET = "\x1b[0m";

interface SetupContext {
  networkMode: "local" | "testnet" | "mainnet";
  tokenA: string;
  tokenB: string;
  fundingKey?: `0x${string}`;
  skipFunding: boolean;
}

class TestEnvironmentSetup {
  constructor(private context: SetupContext) {}

  async run(): Promise<boolean> {
    console.log(`${BLUE}=== Bridge-Me-Not Test Environment Setup ===${RESET}\n`);
    console.log(`Network mode: ${this.context.networkMode}`);
    console.log(`Token A: ${this.context.tokenA}`);
    console.log(`Token B: ${this.context.tokenB}\n`);

    try {
      // Load contract addresses
      loadContractAddressesFromEnv();

      // Step 1: Verify contract deployments
      console.log(`${YELLOW}Step 1: Verifying contract deployments...${RESET}`);
      await this.verifyContracts();

      // Step 2: Check and fund test accounts
      console.log(`\n${YELLOW}Step 2: Checking test account balances...${RESET}`);
      await this.checkAndFundAccounts();

      // Step 3: Approve token spending
      console.log(`\n${YELLOW}Step 3: Setting up token approvals...${RESET}`);
      await this.setupTokenApprovals();

      // Step 4: Verify indexer connection (if applicable)
      console.log(`\n${YELLOW}Step 4: Verifying indexer connection...${RESET}`);
      await this.verifyIndexer();

      console.log(`\n${GREEN}✅ Test environment setup completed successfully!${RESET}`);
      return true;

    } catch (error) {
      console.error(`\n${RED}❌ Test environment setup failed:${RESET}`, error);
      return false;
    }
  }

  private async verifyContracts(): Promise<void> {
    const chains = getChains();
    const srcAddresses = getContractAddresses(chains.srcChainId);
    const dstAddresses = getContractAddresses(chains.dstChainId);

    console.log(`Source chain: ${getChainName(chains.srcChainId)} (${chains.srcChainId})`);
    console.log(`Destination chain: ${getChainName(chains.dstChainId)} (${chains.dstChainId})`);

    // Create clients
    const srcPublicClient = createPublicClientForChain(chains.srcChain);
    const dstPublicClient = createPublicClientForChain(chains.dstChain);

    // Check EscrowFactory on both chains
    console.log(`\nChecking EscrowFactory deployments...`);
    const srcFactoryCode = await srcPublicClient.getBytecode({ address: srcAddresses.escrowFactory });
    const dstFactoryCode = await dstPublicClient.getBytecode({ address: dstAddresses.escrowFactory });

    if (!srcFactoryCode || srcFactoryCode === "0x") {
      throw new Error(`EscrowFactory not deployed on source chain at ${srcAddresses.escrowFactory}`);
    }
    console.log(`✅ Source EscrowFactory: ${srcAddresses.escrowFactory}`);

    if (!dstFactoryCode || dstFactoryCode === "0x") {
      throw new Error(`EscrowFactory not deployed on destination chain at ${dstAddresses.escrowFactory}`);
    }
    console.log(`✅ Destination EscrowFactory: ${dstAddresses.escrowFactory}`);

    // Check token deployments
    console.log(`\nChecking token deployments...`);
    
    let srcTokenAddress: Address;
    let dstTokenAddress: Address;
    
    if (this.context.networkMode === "mainnet" && this.context.tokenA === "BMN") {
      srcTokenAddress = BMN_TOKEN_CONFIG.address;
      dstTokenAddress = BMN_TOKEN_CONFIG.address;
    } else {
      srcTokenAddress = srcAddresses.tokens[this.context.tokenA];
      dstTokenAddress = dstAddresses.tokens[this.context.tokenB];
    }

    if (!srcTokenAddress || !dstTokenAddress) {
      throw new Error(`Token addresses not found for ${this.context.tokenA} or ${this.context.tokenB}`);
    }

    const srcTokenCode = await srcPublicClient.getBytecode({ address: srcTokenAddress });
    const dstTokenCode = await dstPublicClient.getBytecode({ address: dstTokenAddress });

    if (!srcTokenCode || srcTokenCode === "0x") {
      throw new Error(`Token ${this.context.tokenA} not deployed on source chain`);
    }
    console.log(`✅ Source token ${this.context.tokenA}: ${srcTokenAddress}`);

    if (!dstTokenCode || dstTokenCode === "0x") {
      throw new Error(`Token ${this.context.tokenB} not deployed on destination chain`);
    }
    console.log(`✅ Destination token ${this.context.tokenB}: ${dstTokenAddress}`);

    // For local mode, check LimitOrderProtocol
    if (this.context.networkMode === "local") {
      console.log(`\nChecking LimitOrderProtocol deployments...`);
      const srcProtocolCode = await srcPublicClient.getBytecode({ address: srcAddresses.limitOrderProtocol });
      
      if (!srcProtocolCode || srcProtocolCode === "0x") {
        console.warn(`⚠️  LimitOrderProtocol not deployed on source chain`);
      } else {
        console.log(`✅ Source LimitOrderProtocol: ${srcAddresses.limitOrderProtocol}`);
      }
    }
  }

  private async checkAndFundAccounts(): Promise<void> {
    if (this.context.skipFunding) {
      console.log("Skipping account funding (--skip-funding flag set)");
      return;
    }

    const chains = getChains();
    const srcPublicClient = createPublicClientForChain(chains.srcChain);
    const dstPublicClient = createPublicClientForChain(chains.dstChain);

    // Get test accounts
    const alicePrivateKey = Deno.env.get("ALICE_PRIVATE_KEY") as `0x${string}`;
    const bobPrivateKey = Deno.env.get("RESOLVER_PRIVATE_KEY") as `0x${string}`;

    if (!alicePrivateKey || !bobPrivateKey) {
      throw new Error("ALICE_PRIVATE_KEY and RESOLVER_PRIVATE_KEY must be set");
    }

    const aliceAccount = privateKeyToAccount(alicePrivateKey);
    const bobAccount = privateKeyToAccount(bobPrivateKey);

    console.log(`Alice address: ${aliceAccount.address}`);
    console.log(`Bob address: ${bobAccount.address}`);

    // Check ETH balances
    console.log(`\nChecking ETH balances...`);
    const aliceEthSrc = await srcPublicClient.getBalance({ address: aliceAccount.address });
    const aliceEthDst = await dstPublicClient.getBalance({ address: aliceAccount.address });
    const bobEthSrc = await srcPublicClient.getBalance({ address: bobAccount.address });
    const bobEthDst = await dstPublicClient.getBalance({ address: bobAccount.address });

    console.log(`Alice ETH (source): ${formatEther(aliceEthSrc)}`);
    console.log(`Alice ETH (destination): ${formatEther(aliceEthDst)}`);
    console.log(`Bob ETH (source): ${formatEther(bobEthSrc)}`);
    console.log(`Bob ETH (destination): ${formatEther(bobEthDst)}`);

    // Fund with ETH if needed (only for local mode)
    if (this.context.networkMode === "local" && this.context.fundingKey) {
      const fundingAccount = privateKeyToAccount(this.context.fundingKey);
      const srcWalletClient = createWalletClientForChain(chains.srcChain, this.context.fundingKey);
      const dstWalletClient = createWalletClientForChain(chains.dstChain, this.context.fundingKey);

      if (aliceEthSrc < MIN_ETH_BALANCE) {
        console.log(`\nFunding Alice with ETH on source chain...`);
        const hash = await srcWalletClient.sendTransaction({
          account: fundingAccount,
          to: aliceAccount.address,
          value: FUND_AMOUNT_ETH,
        });
        await waitForTransaction(srcPublicClient, hash);
        console.log(`✅ Funded Alice with ${formatEther(FUND_AMOUNT_ETH)} ETH`);
      }

      if (bobEthDst < MIN_ETH_BALANCE) {
        console.log(`\nFunding Bob with ETH on destination chain...`);
        const hash = await dstWalletClient.sendTransaction({
          account: fundingAccount,
          to: bobAccount.address,
          value: FUND_AMOUNT_ETH,
        });
        await waitForTransaction(dstPublicClient, hash);
        console.log(`✅ Funded Bob with ${formatEther(FUND_AMOUNT_ETH)} ETH`);
      }
    }

    // Check token balances
    console.log(`\nChecking token balances...`);
    const srcAddresses = getContractAddresses(chains.srcChainId);
    const dstAddresses = getContractAddresses(chains.dstChainId);

    let srcTokenAddress: Address;
    let dstTokenAddress: Address;

    if (this.context.networkMode === "mainnet" && this.context.tokenA === "BMN") {
      srcTokenAddress = BMN_TOKEN_CONFIG.address;
      dstTokenAddress = BMN_TOKEN_CONFIG.address;
    } else {
      srcTokenAddress = srcAddresses.tokens[this.context.tokenA];
      dstTokenAddress = dstAddresses.tokens[this.context.tokenB];
    }

    const srcToken = createERC20Token(srcTokenAddress, srcPublicClient);
    const dstToken = createERC20Token(dstTokenAddress, dstPublicClient);

    const aliceTokenSrc = await srcToken.read.balanceOf([aliceAccount.address]);
    const bobTokenDst = await dstToken.read.balanceOf([bobAccount.address]);

    console.log(`Alice ${this.context.tokenA} (source): ${formatEther(aliceTokenSrc)}`);
    console.log(`Bob ${this.context.tokenB} (destination): ${formatEther(bobTokenDst)}`);

    // Fund with tokens if needed (only for local mode)
    if (this.context.networkMode === "local" && this.context.fundingKey) {
      const fundingAccount = privateKeyToAccount(this.context.fundingKey);
      
      if (aliceTokenSrc < MIN_TOKEN_BALANCE) {
        console.log(`\nFunding Alice with ${this.context.tokenA} on source chain...`);
        const srcWalletClient = createWalletClientForChain(chains.srcChain, this.context.fundingKey);
        const srcTokenWithWallet = createERC20Token(srcTokenAddress, srcPublicClient, srcWalletClient);
        
        const hash = await srcTokenWithWallet.write.transfer([
          aliceAccount.address,
          FUND_AMOUNT_TOKENS,
        ], { account: fundingAccount });
        await waitForTransaction(srcPublicClient, hash);
        console.log(`✅ Funded Alice with ${formatEther(FUND_AMOUNT_TOKENS)} ${this.context.tokenA}`);
      }

      if (bobTokenDst < MIN_TOKEN_BALANCE) {
        console.log(`\nFunding Bob with ${this.context.tokenB} on destination chain...`);
        const dstWalletClient = createWalletClientForChain(chains.dstChain, this.context.fundingKey);
        const dstTokenWithWallet = createERC20Token(dstTokenAddress, dstPublicClient, dstWalletClient);
        
        const hash = await dstTokenWithWallet.write.transfer([
          bobAccount.address,
          FUND_AMOUNT_TOKENS,
        ], { account: fundingAccount });
        await waitForTransaction(dstPublicClient, hash);
        console.log(`✅ Funded Bob with ${formatEther(FUND_AMOUNT_TOKENS)} ${this.context.tokenB}`);
      }
    }
  }

  private async setupTokenApprovals(): Promise<void> {
    const chains = getChains();
    const srcAddresses = getContractAddresses(chains.srcChainId);
    const dstAddresses = getContractAddresses(chains.dstChainId);

    // Get accounts
    const alicePrivateKey = Deno.env.get("ALICE_PRIVATE_KEY") as `0x${string}`;
    const bobPrivateKey = Deno.env.get("RESOLVER_PRIVATE_KEY") as `0x${string}`;
    const aliceAccount = privateKeyToAccount(alicePrivateKey);
    const bobAccount = privateKeyToAccount(bobPrivateKey);

    // Create clients
    const srcPublicClient = createPublicClientForChain(chains.srcChain);
    const dstPublicClient = createPublicClientForChain(chains.dstChain);
    const srcWalletClient = createWalletClientForChain(chains.srcChain, alicePrivateKey);
    const dstWalletClient = createWalletClientForChain(chains.dstChain, bobPrivateKey);

    // Get token addresses
    let srcTokenAddress: Address;
    let dstTokenAddress: Address;

    if (this.context.networkMode === "mainnet" && this.context.tokenA === "BMN") {
      srcTokenAddress = BMN_TOKEN_CONFIG.address;
      dstTokenAddress = BMN_TOKEN_CONFIG.address;
    } else {
      srcTokenAddress = srcAddresses.tokens[this.context.tokenA];
      dstTokenAddress = dstAddresses.tokens[this.context.tokenB];
    }

    // Alice approves source token to LimitOrderProtocol (if applicable)
    if (this.context.networkMode === "local" && srcAddresses.limitOrderProtocol !== "0x0000000000000000000000000000000000000000") {
      console.log(`\nChecking Alice's token approval to LimitOrderProtocol...`);
      const srcToken = createERC20Token(srcTokenAddress, srcPublicClient, srcWalletClient);
      
      const allowance = await srcToken.read.allowance([
        aliceAccount.address,
        srcAddresses.limitOrderProtocol,
      ]);

      if (allowance < parseEther("1000000")) {
        console.log(`Setting unlimited approval for LimitOrderProtocol...`);
        const hash = await srcToken.write.approve([
          srcAddresses.limitOrderProtocol,
          parseEther("1000000"), // Large approval
        ], { account: aliceAccount });
        await waitForTransaction(srcPublicClient, hash);
        console.log(`✅ Alice approved ${this.context.tokenA} to LimitOrderProtocol`);
      } else {
        console.log(`✅ Alice already has sufficient approval`);
      }
    }

    // Bob approves destination token to EscrowFactory
    console.log(`\nChecking Bob's token approval to EscrowFactory...`);
    const dstToken = createERC20Token(dstTokenAddress, dstPublicClient, dstWalletClient);
    
    const bobAllowance = await dstToken.read.allowance([
      bobAccount.address,
      dstAddresses.escrowFactory,
    ]);

    if (bobAllowance < parseEther("1000000")) {
      console.log(`Setting unlimited approval for EscrowFactory...`);
      const hash = await dstToken.write.approve([
        dstAddresses.escrowFactory,
        parseEther("1000000"), // Large approval
      ], { account: bobAccount });
      await waitForTransaction(dstPublicClient, hash);
      console.log(`✅ Bob approved ${this.context.tokenB} to EscrowFactory`);
    } else {
      console.log(`✅ Bob already has sufficient approval`);
    }
  }

  private async verifyIndexer(): Promise<void> {
    // Check if indexer URL is configured
    const indexerUrl = Deno.env.get("INDEXER_URL");
    
    if (!indexerUrl) {
      console.log("No indexer configured (INDEXER_URL not set)");
      return;
    }

    try {
      console.log(`Checking indexer at ${indexerUrl}...`);
      const response = await fetch(`${indexerUrl}/health`);
      
      if (response.ok) {
        console.log(`✅ Indexer is healthy`);
      } else {
        console.warn(`⚠️  Indexer returned status ${response.status}`);
      }
    } catch (error) {
      console.warn(`⚠️  Could not connect to indexer:`, error.message);
    }
  }
}

// Main entry point
if (import.meta.main) {
  const flags = parseArgs(Deno.args, {
    string: ["network", "token-a", "token-b", "funding-key"],
    boolean: ["skip-funding", "help"],
    default: {
      "network": "local",
      "token-a": "TKA",
      "token-b": "TKB",
      "skip-funding": false,
    },
  });

  if (flags.help) {
    console.log(`
Bridge-Me-Not Test Environment Setup

Usage:
  deno run --allow-all scripts/setup-test-environment.ts [options]

Options:
  --network <mode>      Network mode: local, testnet, or mainnet (default: local)
  --token-a <symbol>    Source token symbol (default: TKA)
  --token-b <symbol>    Destination token symbol (default: TKB)
  --funding-key <key>   Private key for funding accounts (local mode only)
  --skip-funding        Skip account funding step
  --help                Show this help message

Examples:
  # Setup for local testing
  deno run --allow-all scripts/setup-test-environment.ts --funding-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

  # Setup for mainnet (no funding)
  deno run --allow-all scripts/setup-test-environment.ts --network mainnet --token-a BMN --token-b BMN --skip-funding
`);
    Deno.exit(0);
  }

  // Set network mode
  const networkMode = flags.network as "local" | "testnet" | "mainnet";
  Deno.env.set("NETWORK_MODE", networkMode);

  // Create context
  const context: SetupContext = {
    networkMode,
    tokenA: flags["token-a"],
    tokenB: flags["token-b"],
    fundingKey: flags["funding-key"] as `0x${string}` | undefined,
    skipFunding: flags["skip-funding"],
  };

  // Run setup
  const setup = new TestEnvironmentSetup(context);
  const success = await setup.run();

  Deno.exit(success ? 0 : 1);
}