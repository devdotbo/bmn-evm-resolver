# Mainnet Deployment Configuration

## Overview

This document describes the mainnet deployment configuration for the Bridge-Me-Not resolver service on Base and Etherlink mainnets.

## Deployed Addresses

### Factory Contract
- **Address**: `0x068aABdFa6B8c442CD32945A9A147B45ad7146d2` (same on both chains)
- **Base Chain ID**: 8453
- **Etherlink Chain ID**: 42793

### BMN Token
- **Address**: `0x18ae5BB6E03Dc346eA9fd1afA78FEc314343857e` (same on both chains)

## Configuration Steps

### 1. Environment Setup

Copy the mainnet example configuration:
```bash
cp .env.mainnet.example .env.mainnet
```

Edit `.env.mainnet` with your actual values:
- Replace placeholder addresses with your mainnet resolver and user addresses
- Add your private keys (NEVER commit these!)
- Configure RPC URLs with your preferred providers

### 2. Using Mainnet Configuration

To run the resolver with mainnet configuration:
```bash
# Load mainnet environment variables
source .env.mainnet

# Run the resolver
deno run --allow-all main.ts
```

### 3. Chain Configuration

The resolver now supports the following chains:

#### Test Chains (Default)
- **Chain A**: Local Anvil (port 8545, chain ID 1337)
- **Chain B**: Local Anvil (port 8546, chain ID 1338)

#### Mainnet Chains
- **Base**: Chain ID 8453
- **Etherlink**: Chain ID 42793

### 4. Required ABIs

Ensure the following ABIs are present in the `abis/` directory:
- `EscrowFactory.json`
- `EscrowSrc.json`
- `EscrowDst.json`
- `LimitOrderProtocol.json` (when deployed)
- `IERC20.json`

To update ABIs from the contracts project:
```bash
cd ../bmn-evm-contracts
forge build
cp out/EscrowFactory.sol/EscrowFactory.json ../bmn-evm-resolver/abis/
cp out/EscrowSrc.sol/EscrowSrc.json ../bmn-evm-resolver/abis/
cp out/EscrowDst.sol/EscrowDst.json ../bmn-evm-resolver/abis/
# Copy other ABIs as needed
```

### 5. Network Selection

The resolver automatically selects the appropriate network based on chain IDs:
- For test networks: Uses local chain configurations (1337, 1338)
- For mainnet: Uses Base (8453) and Etherlink (42793) configurations

### 6. Security Considerations

- **Private Keys**: Never commit private keys to version control
- **RPC URLs**: Use authenticated endpoints for production
- **Access Control**: Ensure proper access token configuration if required
- **Monitoring**: Set up proper logging and monitoring for mainnet operations

### 7. Pending Deployments

The following contracts still need to be deployed on mainnet:
- **LimitOrderProtocol**: Required for full order functionality
- **Access Token**: For resolver participation control (optional)
- **Fee Token**: For protocol fees (optional)

Update the configuration as these contracts are deployed.

## Testing Mainnet Configuration

Before running on mainnet:

1. Test configuration loading:
```bash
deno run --allow-env src/config/contracts.ts
```

2. Verify chain connectivity:
```bash
deno run --allow-net --allow-env scripts/check-chains.ts
```

3. Check contract deployments:
```bash
deno run --allow-all scripts/verify-contracts.ts
```

## Support

For issues or questions about mainnet deployment, please refer to the main project documentation or contact the development team.