import {
  createReadContract,
  createWriteContract,
  createSimulateContract,
  createWatchContractEvent,
} from '@wagmi/core/codegen'

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// EscrowDst
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const escrowDstAbi = [
  {
    type: 'constructor',
    inputs: [
      { name: 'rescueDelay', internalType: 'uint32', type: 'uint32' },
      { name: 'accessToken', internalType: 'contract IERC20', type: 'address' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'FACTORY',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'PROXY_BYTECODE_HASH',
    outputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'RESCUE_DELAY',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      {
        name: 'immutables',
        internalType: 'struct IBaseEscrow.Immutables',
        type: 'tuple',
        components: [
          { name: 'orderHash', internalType: 'bytes32', type: 'bytes32' },
          { name: 'hashlock', internalType: 'bytes32', type: 'bytes32' },
          { name: 'maker', internalType: 'Address', type: 'uint256' },
          { name: 'taker', internalType: 'Address', type: 'uint256' },
          { name: 'token', internalType: 'Address', type: 'uint256' },
          { name: 'amount', internalType: 'uint256', type: 'uint256' },
          { name: 'safetyDeposit', internalType: 'uint256', type: 'uint256' },
          { name: 'timelocks', internalType: 'Timelocks', type: 'uint256' },
        ],
      },
    ],
    name: 'cancel',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'secret', internalType: 'bytes32', type: 'bytes32' },
      {
        name: 'immutables',
        internalType: 'struct IBaseEscrow.Immutables',
        type: 'tuple',
        components: [
          { name: 'orderHash', internalType: 'bytes32', type: 'bytes32' },
          { name: 'hashlock', internalType: 'bytes32', type: 'bytes32' },
          { name: 'maker', internalType: 'Address', type: 'uint256' },
          { name: 'taker', internalType: 'Address', type: 'uint256' },
          { name: 'token', internalType: 'Address', type: 'uint256' },
          { name: 'amount', internalType: 'uint256', type: 'uint256' },
          { name: 'safetyDeposit', internalType: 'uint256', type: 'uint256' },
          { name: 'timelocks', internalType: 'Timelocks', type: 'uint256' },
        ],
      },
    ],
    name: 'publicWithdraw',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'token', internalType: 'address', type: 'address' },
      { name: 'amount', internalType: 'uint256', type: 'uint256' },
      {
        name: 'immutables',
        internalType: 'struct IBaseEscrow.Immutables',
        type: 'tuple',
        components: [
          { name: 'orderHash', internalType: 'bytes32', type: 'bytes32' },
          { name: 'hashlock', internalType: 'bytes32', type: 'bytes32' },
          { name: 'maker', internalType: 'Address', type: 'uint256' },
          { name: 'taker', internalType: 'Address', type: 'uint256' },
          { name: 'token', internalType: 'Address', type: 'uint256' },
          { name: 'amount', internalType: 'uint256', type: 'uint256' },
          { name: 'safetyDeposit', internalType: 'uint256', type: 'uint256' },
          { name: 'timelocks', internalType: 'Timelocks', type: 'uint256' },
        ],
      },
    ],
    name: 'rescueFunds',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'secret', internalType: 'bytes32', type: 'bytes32' },
      {
        name: 'immutables',
        internalType: 'struct IBaseEscrow.Immutables',
        type: 'tuple',
        components: [
          { name: 'orderHash', internalType: 'bytes32', type: 'bytes32' },
          { name: 'hashlock', internalType: 'bytes32', type: 'bytes32' },
          { name: 'maker', internalType: 'Address', type: 'uint256' },
          { name: 'taker', internalType: 'Address', type: 'uint256' },
          { name: 'token', internalType: 'Address', type: 'uint256' },
          { name: 'amount', internalType: 'uint256', type: 'uint256' },
          { name: 'safetyDeposit', internalType: 'uint256', type: 'uint256' },
          { name: 'timelocks', internalType: 'Timelocks', type: 'uint256' },
        ],
      },
    ],
    name: 'withdraw',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  { type: 'event', anonymous: false, inputs: [], name: 'EscrowCancelled' },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'secret',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: false,
      },
    ],
    name: 'EscrowWithdrawal',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'token',
        internalType: 'address',
        type: 'address',
        indexed: false,
      },
      {
        name: 'amount',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'FundsRescued',
  },
  { type: 'error', inputs: [], name: 'InvalidCaller' },
  { type: 'error', inputs: [], name: 'InvalidImmutables' },
  { type: 'error', inputs: [], name: 'InvalidSecret' },
  { type: 'error', inputs: [], name: 'InvalidTime' },
  { type: 'error', inputs: [], name: 'NativeTokenSendingFailure' },
  { type: 'error', inputs: [], name: 'SafeTransferFailed' },
] as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// EscrowDstV2
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const escrowDstV2Abi = [
  {
    type: 'constructor',
    inputs: [
      { name: 'rescueDelay', internalType: 'uint32', type: 'uint32' },
      { name: 'accessToken', internalType: 'contract IERC20', type: 'address' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'FACTORY',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'PROXY_BYTECODE_HASH',
    outputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'RESCUE_DELAY',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'orderHash', internalType: 'bytes32', type: 'bytes32' },
      { name: 'caller', internalType: 'address', type: 'address' },
      { name: 'action', internalType: 'string', type: 'string' },
    ],
    name: '_hashPublicAction',
    outputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'digest', internalType: 'bytes32', type: 'bytes32' },
      { name: 'sig', internalType: 'bytes', type: 'bytes' },
    ],
    name: '_recover',
    outputs: [{ name: 'signer', internalType: 'address', type: 'address' }],
    stateMutability: 'pure',
  },
  {
    type: 'function',
    inputs: [
      {
        name: 'immutables',
        internalType: 'struct IBaseEscrow.Immutables',
        type: 'tuple',
        components: [
          { name: 'orderHash', internalType: 'bytes32', type: 'bytes32' },
          { name: 'hashlock', internalType: 'bytes32', type: 'bytes32' },
          { name: 'maker', internalType: 'Address', type: 'uint256' },
          { name: 'taker', internalType: 'Address', type: 'uint256' },
          { name: 'token', internalType: 'Address', type: 'uint256' },
          { name: 'amount', internalType: 'uint256', type: 'uint256' },
          { name: 'safetyDeposit', internalType: 'uint256', type: 'uint256' },
          { name: 'timelocks', internalType: 'Timelocks', type: 'uint256' },
        ],
      },
    ],
    name: 'cancel',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      {
        name: 'immutables',
        internalType: 'struct IBaseEscrow.Immutables',
        type: 'tuple',
        components: [
          { name: 'orderHash', internalType: 'bytes32', type: 'bytes32' },
          { name: 'hashlock', internalType: 'bytes32', type: 'bytes32' },
          { name: 'maker', internalType: 'Address', type: 'uint256' },
          { name: 'taker', internalType: 'Address', type: 'uint256' },
          { name: 'token', internalType: 'Address', type: 'uint256' },
          { name: 'amount', internalType: 'uint256', type: 'uint256' },
          { name: 'safetyDeposit', internalType: 'uint256', type: 'uint256' },
          { name: 'timelocks', internalType: 'Timelocks', type: 'uint256' },
        ],
      },
      { name: 'resolverSignature', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'publicCancelSigned',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'secret', internalType: 'bytes32', type: 'bytes32' },
      {
        name: 'immutables',
        internalType: 'struct IBaseEscrow.Immutables',
        type: 'tuple',
        components: [
          { name: 'orderHash', internalType: 'bytes32', type: 'bytes32' },
          { name: 'hashlock', internalType: 'bytes32', type: 'bytes32' },
          { name: 'maker', internalType: 'Address', type: 'uint256' },
          { name: 'taker', internalType: 'Address', type: 'uint256' },
          { name: 'token', internalType: 'Address', type: 'uint256' },
          { name: 'amount', internalType: 'uint256', type: 'uint256' },
          { name: 'safetyDeposit', internalType: 'uint256', type: 'uint256' },
          { name: 'timelocks', internalType: 'Timelocks', type: 'uint256' },
        ],
      },
    ],
    name: 'publicWithdraw',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'secret', internalType: 'bytes32', type: 'bytes32' },
      {
        name: 'immutables',
        internalType: 'struct IBaseEscrow.Immutables',
        type: 'tuple',
        components: [
          { name: 'orderHash', internalType: 'bytes32', type: 'bytes32' },
          { name: 'hashlock', internalType: 'bytes32', type: 'bytes32' },
          { name: 'maker', internalType: 'Address', type: 'uint256' },
          { name: 'taker', internalType: 'Address', type: 'uint256' },
          { name: 'token', internalType: 'Address', type: 'uint256' },
          { name: 'amount', internalType: 'uint256', type: 'uint256' },
          { name: 'safetyDeposit', internalType: 'uint256', type: 'uint256' },
          { name: 'timelocks', internalType: 'Timelocks', type: 'uint256' },
        ],
      },
      { name: 'resolverSignature', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'publicWithdrawSigned',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'token', internalType: 'address', type: 'address' },
      { name: 'amount', internalType: 'uint256', type: 'uint256' },
      {
        name: 'immutables',
        internalType: 'struct IBaseEscrow.Immutables',
        type: 'tuple',
        components: [
          { name: 'orderHash', internalType: 'bytes32', type: 'bytes32' },
          { name: 'hashlock', internalType: 'bytes32', type: 'bytes32' },
          { name: 'maker', internalType: 'Address', type: 'uint256' },
          { name: 'taker', internalType: 'Address', type: 'uint256' },
          { name: 'token', internalType: 'Address', type: 'uint256' },
          { name: 'amount', internalType: 'uint256', type: 'uint256' },
          { name: 'safetyDeposit', internalType: 'uint256', type: 'uint256' },
          { name: 'timelocks', internalType: 'Timelocks', type: 'uint256' },
        ],
      },
    ],
    name: 'rescueFunds',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'secret', internalType: 'bytes32', type: 'bytes32' },
      {
        name: 'immutables',
        internalType: 'struct IBaseEscrow.Immutables',
        type: 'tuple',
        components: [
          { name: 'orderHash', internalType: 'bytes32', type: 'bytes32' },
          { name: 'hashlock', internalType: 'bytes32', type: 'bytes32' },
          { name: 'maker', internalType: 'Address', type: 'uint256' },
          { name: 'taker', internalType: 'Address', type: 'uint256' },
          { name: 'token', internalType: 'Address', type: 'uint256' },
          { name: 'amount', internalType: 'uint256', type: 'uint256' },
          { name: 'safetyDeposit', internalType: 'uint256', type: 'uint256' },
          { name: 'timelocks', internalType: 'Timelocks', type: 'uint256' },
        ],
      },
    ],
    name: 'withdraw',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  { type: 'event', anonymous: false, inputs: [], name: 'EscrowCancelled' },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'secret',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: false,
      },
    ],
    name: 'EscrowWithdrawal',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'token',
        internalType: 'address',
        type: 'address',
        indexed: false,
      },
      {
        name: 'amount',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'FundsRescued',
  },
  { type: 'error', inputs: [], name: 'InvalidCaller' },
  { type: 'error', inputs: [], name: 'InvalidImmutables' },
  { type: 'error', inputs: [], name: 'InvalidSecret' },
  { type: 'error', inputs: [], name: 'InvalidTime' },
  { type: 'error', inputs: [], name: 'NativeTokenSendingFailure' },
  { type: 'error', inputs: [], name: 'SafeTransferFailed' },
] as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// EscrowSrcV2
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const escrowSrcV2Abi = [
  {
    type: 'constructor',
    inputs: [
      { name: 'rescueDelay', internalType: 'uint32', type: 'uint32' },
      { name: 'accessToken', internalType: 'contract IERC20', type: 'address' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'FACTORY',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'PROXY_BYTECODE_HASH',
    outputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'RESCUE_DELAY',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'orderHash', internalType: 'bytes32', type: 'bytes32' },
      { name: 'caller', internalType: 'address', type: 'address' },
      { name: 'action', internalType: 'string', type: 'string' },
    ],
    name: '_hashPublicAction',
    outputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'digest', internalType: 'bytes32', type: 'bytes32' },
      { name: 'sig', internalType: 'bytes', type: 'bytes' },
    ],
    name: '_recover',
    outputs: [{ name: 'signer', internalType: 'address', type: 'address' }],
    stateMutability: 'pure',
  },
  {
    type: 'function',
    inputs: [
      {
        name: 'immutables',
        internalType: 'struct IBaseEscrow.Immutables',
        type: 'tuple',
        components: [
          { name: 'orderHash', internalType: 'bytes32', type: 'bytes32' },
          { name: 'hashlock', internalType: 'bytes32', type: 'bytes32' },
          { name: 'maker', internalType: 'Address', type: 'uint256' },
          { name: 'taker', internalType: 'Address', type: 'uint256' },
          { name: 'token', internalType: 'Address', type: 'uint256' },
          { name: 'amount', internalType: 'uint256', type: 'uint256' },
          { name: 'safetyDeposit', internalType: 'uint256', type: 'uint256' },
          { name: 'timelocks', internalType: 'Timelocks', type: 'uint256' },
        ],
      },
    ],
    name: 'cancel',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      {
        name: 'immutables',
        internalType: 'struct IBaseEscrow.Immutables',
        type: 'tuple',
        components: [
          { name: 'orderHash', internalType: 'bytes32', type: 'bytes32' },
          { name: 'hashlock', internalType: 'bytes32', type: 'bytes32' },
          { name: 'maker', internalType: 'Address', type: 'uint256' },
          { name: 'taker', internalType: 'Address', type: 'uint256' },
          { name: 'token', internalType: 'Address', type: 'uint256' },
          { name: 'amount', internalType: 'uint256', type: 'uint256' },
          { name: 'safetyDeposit', internalType: 'uint256', type: 'uint256' },
          { name: 'timelocks', internalType: 'Timelocks', type: 'uint256' },
        ],
      },
    ],
    name: 'publicCancel',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      {
        name: 'immutables',
        internalType: 'struct IBaseEscrow.Immutables',
        type: 'tuple',
        components: [
          { name: 'orderHash', internalType: 'bytes32', type: 'bytes32' },
          { name: 'hashlock', internalType: 'bytes32', type: 'bytes32' },
          { name: 'maker', internalType: 'Address', type: 'uint256' },
          { name: 'taker', internalType: 'Address', type: 'uint256' },
          { name: 'token', internalType: 'Address', type: 'uint256' },
          { name: 'amount', internalType: 'uint256', type: 'uint256' },
          { name: 'safetyDeposit', internalType: 'uint256', type: 'uint256' },
          { name: 'timelocks', internalType: 'Timelocks', type: 'uint256' },
        ],
      },
      { name: 'resolverSignature', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'publicCancelSigned',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'secret', internalType: 'bytes32', type: 'bytes32' },
      {
        name: 'immutables',
        internalType: 'struct IBaseEscrow.Immutables',
        type: 'tuple',
        components: [
          { name: 'orderHash', internalType: 'bytes32', type: 'bytes32' },
          { name: 'hashlock', internalType: 'bytes32', type: 'bytes32' },
          { name: 'maker', internalType: 'Address', type: 'uint256' },
          { name: 'taker', internalType: 'Address', type: 'uint256' },
          { name: 'token', internalType: 'Address', type: 'uint256' },
          { name: 'amount', internalType: 'uint256', type: 'uint256' },
          { name: 'safetyDeposit', internalType: 'uint256', type: 'uint256' },
          { name: 'timelocks', internalType: 'Timelocks', type: 'uint256' },
        ],
      },
    ],
    name: 'publicWithdraw',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'secret', internalType: 'bytes32', type: 'bytes32' },
      {
        name: 'immutables',
        internalType: 'struct IBaseEscrow.Immutables',
        type: 'tuple',
        components: [
          { name: 'orderHash', internalType: 'bytes32', type: 'bytes32' },
          { name: 'hashlock', internalType: 'bytes32', type: 'bytes32' },
          { name: 'maker', internalType: 'Address', type: 'uint256' },
          { name: 'taker', internalType: 'Address', type: 'uint256' },
          { name: 'token', internalType: 'Address', type: 'uint256' },
          { name: 'amount', internalType: 'uint256', type: 'uint256' },
          { name: 'safetyDeposit', internalType: 'uint256', type: 'uint256' },
          { name: 'timelocks', internalType: 'Timelocks', type: 'uint256' },
        ],
      },
      { name: 'resolverSignature', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'publicWithdrawSigned',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'token', internalType: 'address', type: 'address' },
      { name: 'amount', internalType: 'uint256', type: 'uint256' },
      {
        name: 'immutables',
        internalType: 'struct IBaseEscrow.Immutables',
        type: 'tuple',
        components: [
          { name: 'orderHash', internalType: 'bytes32', type: 'bytes32' },
          { name: 'hashlock', internalType: 'bytes32', type: 'bytes32' },
          { name: 'maker', internalType: 'Address', type: 'uint256' },
          { name: 'taker', internalType: 'Address', type: 'uint256' },
          { name: 'token', internalType: 'Address', type: 'uint256' },
          { name: 'amount', internalType: 'uint256', type: 'uint256' },
          { name: 'safetyDeposit', internalType: 'uint256', type: 'uint256' },
          { name: 'timelocks', internalType: 'Timelocks', type: 'uint256' },
        ],
      },
    ],
    name: 'rescueFunds',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'secret', internalType: 'bytes32', type: 'bytes32' },
      {
        name: 'immutables',
        internalType: 'struct IBaseEscrow.Immutables',
        type: 'tuple',
        components: [
          { name: 'orderHash', internalType: 'bytes32', type: 'bytes32' },
          { name: 'hashlock', internalType: 'bytes32', type: 'bytes32' },
          { name: 'maker', internalType: 'Address', type: 'uint256' },
          { name: 'taker', internalType: 'Address', type: 'uint256' },
          { name: 'token', internalType: 'Address', type: 'uint256' },
          { name: 'amount', internalType: 'uint256', type: 'uint256' },
          { name: 'safetyDeposit', internalType: 'uint256', type: 'uint256' },
          { name: 'timelocks', internalType: 'Timelocks', type: 'uint256' },
        ],
      },
    ],
    name: 'withdraw',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'secret', internalType: 'bytes32', type: 'bytes32' },
      { name: 'target', internalType: 'address', type: 'address' },
      {
        name: 'immutables',
        internalType: 'struct IBaseEscrow.Immutables',
        type: 'tuple',
        components: [
          { name: 'orderHash', internalType: 'bytes32', type: 'bytes32' },
          { name: 'hashlock', internalType: 'bytes32', type: 'bytes32' },
          { name: 'maker', internalType: 'Address', type: 'uint256' },
          { name: 'taker', internalType: 'Address', type: 'uint256' },
          { name: 'token', internalType: 'Address', type: 'uint256' },
          { name: 'amount', internalType: 'uint256', type: 'uint256' },
          { name: 'safetyDeposit', internalType: 'uint256', type: 'uint256' },
          { name: 'timelocks', internalType: 'Timelocks', type: 'uint256' },
        ],
      },
    ],
    name: 'withdrawTo',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  { type: 'event', anonymous: false, inputs: [], name: 'EscrowCancelled' },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'secret',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: false,
      },
    ],
    name: 'EscrowWithdrawal',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'token',
        internalType: 'address',
        type: 'address',
        indexed: false,
      },
      {
        name: 'amount',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'FundsRescued',
  },
  { type: 'error', inputs: [], name: 'InvalidCaller' },
  { type: 'error', inputs: [], name: 'InvalidImmutables' },
  { type: 'error', inputs: [], name: 'InvalidSecret' },
  { type: 'error', inputs: [], name: 'InvalidTime' },
  { type: 'error', inputs: [], name: 'NativeTokenSendingFailure' },
  { type: 'error', inputs: [], name: 'SafeTransferFailed' },
] as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// IERC20
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const ierc20Abi = [
  {
    type: 'function',
    inputs: [
      { name: 'owner', internalType: 'address', type: 'address' },
      { name: 'spender', internalType: 'address', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'spender', internalType: 'address', type: 'address' },
      { name: 'value', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'account', internalType: 'address', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'totalSupply',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'to', internalType: 'address', type: 'address' },
      { name: 'value', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'transfer',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'from', internalType: 'address', type: 'address' },
      { name: 'to', internalType: 'address', type: 'address' },
      { name: 'value', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'transferFrom',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'owner',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'spender',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'value',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'Approval',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      { name: 'from', internalType: 'address', type: 'address', indexed: true },
      { name: 'to', internalType: 'address', type: 'address', indexed: true },
      {
        name: 'value',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'Transfer',
  },
] as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// SimpleLimitOrderProtocol
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 */
export const simpleLimitOrderProtocolAbi = [
  {
    type: 'constructor',
    inputs: [
      { name: '_weth', internalType: 'contract IWETH', type: 'address' },
    ],
    stateMutability: 'nonpayable',
  },
  { type: 'receive', stateMutability: 'payable' },
  {
    type: 'function',
    inputs: [],
    name: 'DOMAIN_SEPARATOR',
    outputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'series', internalType: 'uint96', type: 'uint96' },
      { name: 'amount', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'advanceEpoch',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'offsets', internalType: 'uint256', type: 'uint256' },
      { name: 'data', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'and',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'target', internalType: 'address', type: 'address' },
      { name: 'data', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'arbitraryStaticCall',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'maker', internalType: 'address', type: 'address' },
      { name: 'slot', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'bitInvalidatorForOrder',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'makerTraits', internalType: 'MakerTraits', type: 'uint256' },
      { name: 'additionalMask', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'bitsInvalidateForOrder',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'makerTraits', internalType: 'MakerTraits', type: 'uint256' },
      { name: 'orderHash', internalType: 'bytes32', type: 'bytes32' },
    ],
    name: 'cancelOrder',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'makerTraits', internalType: 'MakerTraits[]', type: 'uint256[]' },
      { name: 'orderHashes', internalType: 'bytes32[]', type: 'bytes32[]' },
    ],
    name: 'cancelOrders',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'predicate', internalType: 'bytes', type: 'bytes' }],
    name: 'checkPredicate',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'eip712Domain',
    outputs: [
      { name: 'fields', internalType: 'bytes1', type: 'bytes1' },
      { name: 'name', internalType: 'string', type: 'string' },
      { name: 'version', internalType: 'string', type: 'string' },
      { name: 'chainId', internalType: 'uint256', type: 'uint256' },
      { name: 'verifyingContract', internalType: 'address', type: 'address' },
      { name: 'salt', internalType: 'bytes32', type: 'bytes32' },
      { name: 'extensions', internalType: 'uint256[]', type: 'uint256[]' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'maker', internalType: 'address', type: 'address' },
      { name: 'series', internalType: 'uint96', type: 'uint96' },
    ],
    name: 'epoch',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'maker', internalType: 'address', type: 'address' },
      { name: 'series', internalType: 'uint256', type: 'uint256' },
      { name: 'makerEpoch', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'epochEquals',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'value', internalType: 'uint256', type: 'uint256' },
      { name: 'data', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'eq',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      {
        name: 'order',
        internalType: 'struct IOrderMixin.Order',
        type: 'tuple',
        components: [
          { name: 'salt', internalType: 'uint256', type: 'uint256' },
          { name: 'maker', internalType: 'Address', type: 'uint256' },
          { name: 'receiver', internalType: 'Address', type: 'uint256' },
          { name: 'makerAsset', internalType: 'Address', type: 'uint256' },
          { name: 'takerAsset', internalType: 'Address', type: 'uint256' },
          { name: 'makingAmount', internalType: 'uint256', type: 'uint256' },
          { name: 'takingAmount', internalType: 'uint256', type: 'uint256' },
          { name: 'makerTraits', internalType: 'MakerTraits', type: 'uint256' },
        ],
      },
      { name: 'signature', internalType: 'bytes', type: 'bytes' },
      { name: 'amount', internalType: 'uint256', type: 'uint256' },
      { name: 'takerTraits', internalType: 'TakerTraits', type: 'uint256' },
    ],
    name: 'fillContractOrder',
    outputs: [
      { name: '', internalType: 'uint256', type: 'uint256' },
      { name: '', internalType: 'uint256', type: 'uint256' },
      { name: '', internalType: 'bytes32', type: 'bytes32' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      {
        name: 'order',
        internalType: 'struct IOrderMixin.Order',
        type: 'tuple',
        components: [
          { name: 'salt', internalType: 'uint256', type: 'uint256' },
          { name: 'maker', internalType: 'Address', type: 'uint256' },
          { name: 'receiver', internalType: 'Address', type: 'uint256' },
          { name: 'makerAsset', internalType: 'Address', type: 'uint256' },
          { name: 'takerAsset', internalType: 'Address', type: 'uint256' },
          { name: 'makingAmount', internalType: 'uint256', type: 'uint256' },
          { name: 'takingAmount', internalType: 'uint256', type: 'uint256' },
          { name: 'makerTraits', internalType: 'MakerTraits', type: 'uint256' },
        ],
      },
      { name: 'signature', internalType: 'bytes', type: 'bytes' },
      { name: 'amount', internalType: 'uint256', type: 'uint256' },
      { name: 'takerTraits', internalType: 'TakerTraits', type: 'uint256' },
      { name: 'args', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'fillContractOrderArgs',
    outputs: [
      { name: '', internalType: 'uint256', type: 'uint256' },
      { name: '', internalType: 'uint256', type: 'uint256' },
      { name: '', internalType: 'bytes32', type: 'bytes32' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      {
        name: 'order',
        internalType: 'struct IOrderMixin.Order',
        type: 'tuple',
        components: [
          { name: 'salt', internalType: 'uint256', type: 'uint256' },
          { name: 'maker', internalType: 'Address', type: 'uint256' },
          { name: 'receiver', internalType: 'Address', type: 'uint256' },
          { name: 'makerAsset', internalType: 'Address', type: 'uint256' },
          { name: 'takerAsset', internalType: 'Address', type: 'uint256' },
          { name: 'makingAmount', internalType: 'uint256', type: 'uint256' },
          { name: 'takingAmount', internalType: 'uint256', type: 'uint256' },
          { name: 'makerTraits', internalType: 'MakerTraits', type: 'uint256' },
        ],
      },
      { name: 'r', internalType: 'bytes32', type: 'bytes32' },
      { name: 'vs', internalType: 'bytes32', type: 'bytes32' },
      { name: 'amount', internalType: 'uint256', type: 'uint256' },
      { name: 'takerTraits', internalType: 'TakerTraits', type: 'uint256' },
    ],
    name: 'fillOrder',
    outputs: [
      { name: '', internalType: 'uint256', type: 'uint256' },
      { name: '', internalType: 'uint256', type: 'uint256' },
      { name: '', internalType: 'bytes32', type: 'bytes32' },
    ],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    inputs: [
      {
        name: 'order',
        internalType: 'struct IOrderMixin.Order',
        type: 'tuple',
        components: [
          { name: 'salt', internalType: 'uint256', type: 'uint256' },
          { name: 'maker', internalType: 'Address', type: 'uint256' },
          { name: 'receiver', internalType: 'Address', type: 'uint256' },
          { name: 'makerAsset', internalType: 'Address', type: 'uint256' },
          { name: 'takerAsset', internalType: 'Address', type: 'uint256' },
          { name: 'makingAmount', internalType: 'uint256', type: 'uint256' },
          { name: 'takingAmount', internalType: 'uint256', type: 'uint256' },
          { name: 'makerTraits', internalType: 'MakerTraits', type: 'uint256' },
        ],
      },
      { name: 'r', internalType: 'bytes32', type: 'bytes32' },
      { name: 'vs', internalType: 'bytes32', type: 'bytes32' },
      { name: 'amount', internalType: 'uint256', type: 'uint256' },
      { name: 'takerTraits', internalType: 'TakerTraits', type: 'uint256' },
      { name: 'args', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'fillOrderArgs',
    outputs: [
      { name: '', internalType: 'uint256', type: 'uint256' },
      { name: '', internalType: 'uint256', type: 'uint256' },
      { name: '', internalType: 'bytes32', type: 'bytes32' },
    ],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'value', internalType: 'uint256', type: 'uint256' },
      { name: 'data', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'gt',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      {
        name: 'order',
        internalType: 'struct IOrderMixin.Order',
        type: 'tuple',
        components: [
          { name: 'salt', internalType: 'uint256', type: 'uint256' },
          { name: 'maker', internalType: 'Address', type: 'uint256' },
          { name: 'receiver', internalType: 'Address', type: 'uint256' },
          { name: 'makerAsset', internalType: 'Address', type: 'uint256' },
          { name: 'takerAsset', internalType: 'Address', type: 'uint256' },
          { name: 'makingAmount', internalType: 'uint256', type: 'uint256' },
          { name: 'takingAmount', internalType: 'uint256', type: 'uint256' },
          { name: 'makerTraits', internalType: 'MakerTraits', type: 'uint256' },
        ],
      },
    ],
    name: 'hashOrder',
    outputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'series', internalType: 'uint96', type: 'uint96' }],
    name: 'increaseEpoch',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'value', internalType: 'uint256', type: 'uint256' },
      { name: 'data', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'lt',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'data', internalType: 'bytes', type: 'bytes' }],
    name: 'not',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'offsets', internalType: 'uint256', type: 'uint256' },
      { name: 'data', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'or',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'paused',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'permit', internalType: 'bytes', type: 'bytes' },
      { name: 'action', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'permitAndCall',
    outputs: [],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'maker', internalType: 'address', type: 'address' },
      { name: 'orderHash', internalType: 'bytes32', type: 'bytes32' },
    ],
    name: 'rawRemainingInvalidatorForOrder',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'maker', internalType: 'address', type: 'address' },
      { name: 'orderHash', internalType: 'bytes32', type: 'bytes32' },
    ],
    name: 'remainingInvalidatorForOrder',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'target', internalType: 'address', type: 'address' },
      { name: 'data', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'simulate',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'maker',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'slotIndex',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'slotValue',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'BitInvalidatorUpdated',
  },
  { type: 'event', anonymous: false, inputs: [], name: 'EIP712DomainChanged' },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'maker',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'series',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'newEpoch',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'EpochIncreased',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'orderHash',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: false,
      },
    ],
    name: 'OrderCancelled',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'orderHash',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: false,
      },
      {
        name: 'remainingAmount',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'OrderFilled',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'account',
        internalType: 'address',
        type: 'address',
        indexed: false,
      },
    ],
    name: 'Paused',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'account',
        internalType: 'address',
        type: 'address',
        indexed: false,
      },
    ],
    name: 'Unpaused',
  },
  { type: 'error', inputs: [], name: 'AdvanceEpochFailed' },
  { type: 'error', inputs: [], name: 'ArbitraryStaticCallFailed' },
  { type: 'error', inputs: [], name: 'BadSignature' },
  { type: 'error', inputs: [], name: 'BitInvalidatedOrder' },
  { type: 'error', inputs: [], name: 'ETHTransferFailed' },
  { type: 'error', inputs: [], name: 'EnforcedPause' },
  {
    type: 'error',
    inputs: [],
    name: 'EpochManagerAndBitInvalidatorsAreIncompatible',
  },
  { type: 'error', inputs: [], name: 'EthDepositRejected' },
  { type: 'error', inputs: [], name: 'ExpectedPause' },
  { type: 'error', inputs: [], name: 'InvalidMsgValue' },
  { type: 'error', inputs: [], name: 'InvalidPermit2Transfer' },
  { type: 'error', inputs: [], name: 'InvalidShortString' },
  { type: 'error', inputs: [], name: 'InvalidatedOrder' },
  { type: 'error', inputs: [], name: 'MakingAmountTooLow' },
  { type: 'error', inputs: [], name: 'MismatchArraysLengths' },
  { type: 'error', inputs: [], name: 'OrderExpired' },
  { type: 'error', inputs: [], name: 'OrderIsNotSuitableForMassInvalidation' },
  { type: 'error', inputs: [], name: 'PartialFillNotAllowed' },
  { type: 'error', inputs: [], name: 'Permit2TransferAmountTooHigh' },
  { type: 'error', inputs: [], name: 'PredicateIsNotTrue' },
  { type: 'error', inputs: [], name: 'PrivateOrder' },
  { type: 'error', inputs: [], name: 'ReentrancyDetected' },
  { type: 'error', inputs: [], name: 'RemainingInvalidatedOrder' },
  { type: 'error', inputs: [], name: 'SafeTransferFailed' },
  { type: 'error', inputs: [], name: 'SafeTransferFromFailed' },
  {
    type: 'error',
    inputs: [
      { name: 'success', internalType: 'bool', type: 'bool' },
      { name: 'res', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'SimulationResults',
  },
  {
    type: 'error',
    inputs: [{ name: 'str', internalType: 'string', type: 'string' }],
    name: 'StringTooLong',
  },
  { type: 'error', inputs: [], name: 'SwapWithZeroAmount' },
  { type: 'error', inputs: [], name: 'TakingAmountExceeded' },
  { type: 'error', inputs: [], name: 'TakingAmountTooHigh' },
  { type: 'error', inputs: [], name: 'TransferFromMakerToTakerFailed' },
  { type: 'error', inputs: [], name: 'TransferFromTakerToMakerFailed' },
  { type: 'error', inputs: [], name: 'WrongSeriesNonce' },
] as const

/**
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 */
export const simpleLimitOrderProtocolAddress = {
  10: '0xe767105dcfB3034a346578afd2aFD8e583171489',
  8453: '0xe767105dcfB3034a346578afd2aFD8e583171489',
} as const

/**
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 */
export const simpleLimitOrderProtocolConfig = {
  address: simpleLimitOrderProtocolAddress,
  abi: simpleLimitOrderProtocolAbi,
} as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// SimplifiedEscrowFactory
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const simplifiedEscrowFactoryAbi = [
  {
    type: 'constructor',
    inputs: [
      { name: 'srcImpl', internalType: 'address', type: 'address' },
      { name: 'dstImpl', internalType: 'address', type: 'address' },
      { name: '_owner', internalType: 'address', type: 'address' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'ESCROW_DST_IMPLEMENTATION',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'ESCROW_SRC_IMPLEMENTATION',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'maker', internalType: 'address', type: 'address' }],
    name: 'addMaker',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'resolver', internalType: 'address', type: 'address' }],
    name: 'addResolver',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      {
        name: 'immutables',
        internalType: 'struct IBaseEscrow.Immutables',
        type: 'tuple',
        components: [
          { name: 'orderHash', internalType: 'bytes32', type: 'bytes32' },
          { name: 'hashlock', internalType: 'bytes32', type: 'bytes32' },
          { name: 'maker', internalType: 'Address', type: 'uint256' },
          { name: 'taker', internalType: 'Address', type: 'uint256' },
          { name: 'token', internalType: 'Address', type: 'uint256' },
          { name: 'amount', internalType: 'uint256', type: 'uint256' },
          { name: 'safetyDeposit', internalType: 'uint256', type: 'uint256' },
          { name: 'timelocks', internalType: 'Timelocks', type: 'uint256' },
        ],
      },
      { name: 'isSrc', internalType: 'bool', type: 'bool' },
    ],
    name: 'addressOfEscrow',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      {
        name: 'immutables',
        internalType: 'struct IBaseEscrow.Immutables',
        type: 'tuple',
        components: [
          { name: 'orderHash', internalType: 'bytes32', type: 'bytes32' },
          { name: 'hashlock', internalType: 'bytes32', type: 'bytes32' },
          { name: 'maker', internalType: 'Address', type: 'uint256' },
          { name: 'taker', internalType: 'Address', type: 'uint256' },
          { name: 'token', internalType: 'Address', type: 'uint256' },
          { name: 'amount', internalType: 'uint256', type: 'uint256' },
          { name: 'safetyDeposit', internalType: 'uint256', type: 'uint256' },
          { name: 'timelocks', internalType: 'Timelocks', type: 'uint256' },
        ],
      },
    ],
    name: 'createDstEscrow',
    outputs: [{ name: 'escrow', internalType: 'address', type: 'address' }],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    inputs: [
      {
        name: 'immutables',
        internalType: 'struct IBaseEscrow.Immutables',
        type: 'tuple',
        components: [
          { name: 'orderHash', internalType: 'bytes32', type: 'bytes32' },
          { name: 'hashlock', internalType: 'bytes32', type: 'bytes32' },
          { name: 'maker', internalType: 'Address', type: 'uint256' },
          { name: 'taker', internalType: 'Address', type: 'uint256' },
          { name: 'token', internalType: 'Address', type: 'uint256' },
          { name: 'amount', internalType: 'uint256', type: 'uint256' },
          { name: 'safetyDeposit', internalType: 'uint256', type: 'uint256' },
          { name: 'timelocks', internalType: 'Timelocks', type: 'uint256' },
        ],
      },
      { name: 'maker', internalType: 'address', type: 'address' },
      { name: 'token', internalType: 'address', type: 'address' },
      { name: 'amount', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'createSrcEscrow',
    outputs: [{ name: 'escrow', internalType: 'address', type: 'address' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'emergencyPaused',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    name: 'escrows',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'makerWhitelistEnabled',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'owner',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'pause',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      {
        name: 'order',
        internalType: 'struct IOrderMixin.Order',
        type: 'tuple',
        components: [
          { name: 'salt', internalType: 'uint256', type: 'uint256' },
          { name: 'maker', internalType: 'Address', type: 'uint256' },
          { name: 'receiver', internalType: 'Address', type: 'uint256' },
          { name: 'makerAsset', internalType: 'Address', type: 'uint256' },
          { name: 'takerAsset', internalType: 'Address', type: 'uint256' },
          { name: 'makingAmount', internalType: 'uint256', type: 'uint256' },
          { name: 'takingAmount', internalType: 'uint256', type: 'uint256' },
          { name: 'makerTraits', internalType: 'MakerTraits', type: 'uint256' },
        ],
      },
      { name: '', internalType: 'bytes', type: 'bytes' },
      { name: 'orderHash', internalType: 'bytes32', type: 'bytes32' },
      { name: 'taker', internalType: 'address', type: 'address' },
      { name: 'makingAmount', internalType: 'uint256', type: 'uint256' },
      { name: '', internalType: 'uint256', type: 'uint256' },
      { name: '', internalType: 'uint256', type: 'uint256' },
      { name: 'extraData', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'postInteraction',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'maker', internalType: 'address', type: 'address' }],
    name: 'removeMaker',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'resolver', internalType: 'address', type: 'address' }],
    name: 'removeResolver',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'resolverCount',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'enabled', internalType: 'bool', type: 'bool' }],
    name: 'setMakerWhitelistEnabled',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'newOwner', internalType: 'address', type: 'address' }],
    name: 'transferOwnership',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'unpause',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: '', internalType: 'address', type: 'address' }],
    name: 'whitelistedMakers',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: '', internalType: 'address', type: 'address' }],
    name: 'whitelistedResolvers',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'escrow',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'hashlock',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: true,
      },
      {
        name: 'taker',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'DstEscrowCreated',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      { name: 'paused', internalType: 'bool', type: 'bool', indexed: false },
    ],
    name: 'EmergencyPause',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'maker',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'MakerRemoved',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'maker',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'MakerWhitelisted',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'previousOwner',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'newOwner',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'OwnershipTransferred',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'escrow',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'hashlock',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: true,
      },
      {
        name: 'protocol',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'taker',
        internalType: 'address',
        type: 'address',
        indexed: false,
      },
      {
        name: 'amount',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'PostInteractionEscrowCreated',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'resolver',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'ResolverRemoved',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'resolver',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'ResolverWhitelisted',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'escrow',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'orderHash',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: true,
      },
      {
        name: 'maker',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'taker',
        internalType: 'address',
        type: 'address',
        indexed: false,
      },
      {
        name: 'amount',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'SrcEscrowCreated',
  },
  { type: 'error', inputs: [], name: 'FailedDeployment' },
  {
    type: 'error',
    inputs: [
      { name: 'balance', internalType: 'uint256', type: 'uint256' },
      { name: 'needed', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'InsufficientBalance',
  },
  { type: 'error', inputs: [], name: 'SafeTransferFromFailed' },
] as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// SimplifiedEscrowFactoryV2_3
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 */
export const simplifiedEscrowFactoryV2_3Abi = [
  {
    type: 'constructor',
    inputs: [
      { name: 'accessToken', internalType: 'contract IERC20', type: 'address' },
      { name: '_owner', internalType: 'address', type: 'address' },
      { name: 'rescueDelay', internalType: 'uint32', type: 'uint32' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'ESCROW_DST_IMPLEMENTATION',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'ESCROW_SRC_IMPLEMENTATION',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'maker', internalType: 'address', type: 'address' }],
    name: 'addMaker',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'resolver', internalType: 'address', type: 'address' }],
    name: 'addResolver',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      {
        name: 'immutables',
        internalType: 'struct IBaseEscrow.Immutables',
        type: 'tuple',
        components: [
          { name: 'orderHash', internalType: 'bytes32', type: 'bytes32' },
          { name: 'hashlock', internalType: 'bytes32', type: 'bytes32' },
          { name: 'maker', internalType: 'Address', type: 'uint256' },
          { name: 'taker', internalType: 'Address', type: 'uint256' },
          { name: 'token', internalType: 'Address', type: 'uint256' },
          { name: 'amount', internalType: 'uint256', type: 'uint256' },
          { name: 'safetyDeposit', internalType: 'uint256', type: 'uint256' },
          { name: 'timelocks', internalType: 'Timelocks', type: 'uint256' },
        ],
      },
      { name: 'isSrc', internalType: 'bool', type: 'bool' },
    ],
    name: 'addressOfEscrow',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      {
        name: 'immutables',
        internalType: 'struct IBaseEscrow.Immutables',
        type: 'tuple',
        components: [
          { name: 'orderHash', internalType: 'bytes32', type: 'bytes32' },
          { name: 'hashlock', internalType: 'bytes32', type: 'bytes32' },
          { name: 'maker', internalType: 'Address', type: 'uint256' },
          { name: 'taker', internalType: 'Address', type: 'uint256' },
          { name: 'token', internalType: 'Address', type: 'uint256' },
          { name: 'amount', internalType: 'uint256', type: 'uint256' },
          { name: 'safetyDeposit', internalType: 'uint256', type: 'uint256' },
          { name: 'timelocks', internalType: 'Timelocks', type: 'uint256' },
        ],
      },
    ],
    name: 'createDstEscrow',
    outputs: [{ name: 'escrow', internalType: 'address', type: 'address' }],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    inputs: [
      {
        name: 'immutables',
        internalType: 'struct IBaseEscrow.Immutables',
        type: 'tuple',
        components: [
          { name: 'orderHash', internalType: 'bytes32', type: 'bytes32' },
          { name: 'hashlock', internalType: 'bytes32', type: 'bytes32' },
          { name: 'maker', internalType: 'Address', type: 'uint256' },
          { name: 'taker', internalType: 'Address', type: 'uint256' },
          { name: 'token', internalType: 'Address', type: 'uint256' },
          { name: 'amount', internalType: 'uint256', type: 'uint256' },
          { name: 'safetyDeposit', internalType: 'uint256', type: 'uint256' },
          { name: 'timelocks', internalType: 'Timelocks', type: 'uint256' },
        ],
      },
      { name: 'maker', internalType: 'address', type: 'address' },
      { name: 'token', internalType: 'address', type: 'address' },
      { name: 'amount', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'createSrcEscrow',
    outputs: [{ name: 'escrow', internalType: 'address', type: 'address' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'emergencyPaused',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    name: 'escrows',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'resolver', internalType: 'address', type: 'address' }],
    name: 'isWhitelistedResolver',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'makerWhitelistEnabled',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'owner',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'pause',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      {
        name: 'order',
        internalType: 'struct IOrderMixin.Order',
        type: 'tuple',
        components: [
          { name: 'salt', internalType: 'uint256', type: 'uint256' },
          { name: 'maker', internalType: 'Address', type: 'uint256' },
          { name: 'receiver', internalType: 'Address', type: 'uint256' },
          { name: 'makerAsset', internalType: 'Address', type: 'uint256' },
          { name: 'takerAsset', internalType: 'Address', type: 'uint256' },
          { name: 'makingAmount', internalType: 'uint256', type: 'uint256' },
          { name: 'takingAmount', internalType: 'uint256', type: 'uint256' },
          { name: 'makerTraits', internalType: 'MakerTraits', type: 'uint256' },
        ],
      },
      { name: '', internalType: 'bytes', type: 'bytes' },
      { name: 'orderHash', internalType: 'bytes32', type: 'bytes32' },
      { name: 'taker', internalType: 'address', type: 'address' },
      { name: 'makingAmount', internalType: 'uint256', type: 'uint256' },
      { name: '', internalType: 'uint256', type: 'uint256' },
      { name: '', internalType: 'uint256', type: 'uint256' },
      { name: 'extraData', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'postInteraction',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'maker', internalType: 'address', type: 'address' }],
    name: 'removeMaker',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'resolver', internalType: 'address', type: 'address' }],
    name: 'removeResolver',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'resolverCount',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'enabled', internalType: 'bool', type: 'bool' }],
    name: 'setMakerWhitelistEnabled',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'newOwner', internalType: 'address', type: 'address' }],
    name: 'transferOwnership',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'unpause',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: '', internalType: 'address', type: 'address' }],
    name: 'whitelistedMakers',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: '', internalType: 'address', type: 'address' }],
    name: 'whitelistedResolvers',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'escrow',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'hashlock',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: true,
      },
      {
        name: 'taker',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'DstEscrowCreated',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      { name: 'paused', internalType: 'bool', type: 'bool', indexed: false },
    ],
    name: 'EmergencyPause',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'maker',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'MakerRemoved',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'maker',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'MakerWhitelisted',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'previousOwner',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'newOwner',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'OwnershipTransferred',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'escrow',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'hashlock',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: true,
      },
      {
        name: 'protocol',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'taker',
        internalType: 'address',
        type: 'address',
        indexed: false,
      },
      {
        name: 'amount',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'PostInteractionEscrowCreated',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'resolver',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'ResolverRemoved',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'resolver',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'ResolverWhitelisted',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'escrow',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'orderHash',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: true,
      },
      {
        name: 'maker',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'taker',
        internalType: 'address',
        type: 'address',
        indexed: false,
      },
      {
        name: 'amount',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'SrcEscrowCreated',
  },
  { type: 'error', inputs: [], name: 'FailedDeployment' },
  {
    type: 'error',
    inputs: [
      { name: 'balance', internalType: 'uint256', type: 'uint256' },
      { name: 'needed', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'InsufficientBalance',
  },
  { type: 'error', inputs: [], name: 'SafeTransferFromFailed' },
] as const

/**
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 */
export const simplifiedEscrowFactoryV2_3Address = {
  10: '0xFbdCB5ac0C1381A64Ef1243bCeA0A1D899b0cA31',
  8453: '0xFbdCB5ac0C1381A64Ef1243bCeA0A1D899b0cA31',
} as const

/**
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 */
export const simplifiedEscrowFactoryV2_3Config = {
  address: simplifiedEscrowFactoryV2_3Address,
  abi: simplifiedEscrowFactoryV2_3Abi,
} as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Action
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link escrowDstAbi}__
 */
export const readEscrowDst = /*#__PURE__*/ createReadContract({
  abi: escrowDstAbi,
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link escrowDstAbi}__ and `functionName` set to `"FACTORY"`
 */
export const readEscrowDstFactory = /*#__PURE__*/ createReadContract({
  abi: escrowDstAbi,
  functionName: 'FACTORY',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link escrowDstAbi}__ and `functionName` set to `"PROXY_BYTECODE_HASH"`
 */
export const readEscrowDstProxyBytecodeHash = /*#__PURE__*/ createReadContract({
  abi: escrowDstAbi,
  functionName: 'PROXY_BYTECODE_HASH',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link escrowDstAbi}__ and `functionName` set to `"RESCUE_DELAY"`
 */
export const readEscrowDstRescueDelay = /*#__PURE__*/ createReadContract({
  abi: escrowDstAbi,
  functionName: 'RESCUE_DELAY',
})

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link escrowDstAbi}__
 */
export const writeEscrowDst = /*#__PURE__*/ createWriteContract({
  abi: escrowDstAbi,
})

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link escrowDstAbi}__ and `functionName` set to `"cancel"`
 */
export const writeEscrowDstCancel = /*#__PURE__*/ createWriteContract({
  abi: escrowDstAbi,
  functionName: 'cancel',
})

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link escrowDstAbi}__ and `functionName` set to `"publicWithdraw"`
 */
export const writeEscrowDstPublicWithdraw = /*#__PURE__*/ createWriteContract({
  abi: escrowDstAbi,
  functionName: 'publicWithdraw',
})

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link escrowDstAbi}__ and `functionName` set to `"rescueFunds"`
 */
export const writeEscrowDstRescueFunds = /*#__PURE__*/ createWriteContract({
  abi: escrowDstAbi,
  functionName: 'rescueFunds',
})

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link escrowDstAbi}__ and `functionName` set to `"withdraw"`
 */
export const writeEscrowDstWithdraw = /*#__PURE__*/ createWriteContract({
  abi: escrowDstAbi,
  functionName: 'withdraw',
})

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link escrowDstAbi}__
 */
export const simulateEscrowDst = /*#__PURE__*/ createSimulateContract({
  abi: escrowDstAbi,
})

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link escrowDstAbi}__ and `functionName` set to `"cancel"`
 */
export const simulateEscrowDstCancel = /*#__PURE__*/ createSimulateContract({
  abi: escrowDstAbi,
  functionName: 'cancel',
})

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link escrowDstAbi}__ and `functionName` set to `"publicWithdraw"`
 */
export const simulateEscrowDstPublicWithdraw =
  /*#__PURE__*/ createSimulateContract({
    abi: escrowDstAbi,
    functionName: 'publicWithdraw',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link escrowDstAbi}__ and `functionName` set to `"rescueFunds"`
 */
export const simulateEscrowDstRescueFunds =
  /*#__PURE__*/ createSimulateContract({
    abi: escrowDstAbi,
    functionName: 'rescueFunds',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link escrowDstAbi}__ and `functionName` set to `"withdraw"`
 */
export const simulateEscrowDstWithdraw = /*#__PURE__*/ createSimulateContract({
  abi: escrowDstAbi,
  functionName: 'withdraw',
})

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link escrowDstAbi}__
 */
export const watchEscrowDstEvent = /*#__PURE__*/ createWatchContractEvent({
  abi: escrowDstAbi,
})

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link escrowDstAbi}__ and `eventName` set to `"EscrowCancelled"`
 */
export const watchEscrowDstEscrowCancelledEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: escrowDstAbi,
    eventName: 'EscrowCancelled',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link escrowDstAbi}__ and `eventName` set to `"EscrowWithdrawal"`
 */
export const watchEscrowDstEscrowWithdrawalEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: escrowDstAbi,
    eventName: 'EscrowWithdrawal',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link escrowDstAbi}__ and `eventName` set to `"FundsRescued"`
 */
export const watchEscrowDstFundsRescuedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: escrowDstAbi,
    eventName: 'FundsRescued',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link escrowDstV2Abi}__
 */
export const readEscrowDstV2 = /*#__PURE__*/ createReadContract({
  abi: escrowDstV2Abi,
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link escrowDstV2Abi}__ and `functionName` set to `"FACTORY"`
 */
export const readEscrowDstV2Factory = /*#__PURE__*/ createReadContract({
  abi: escrowDstV2Abi,
  functionName: 'FACTORY',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link escrowDstV2Abi}__ and `functionName` set to `"PROXY_BYTECODE_HASH"`
 */
export const readEscrowDstV2ProxyBytecodeHash =
  /*#__PURE__*/ createReadContract({
    abi: escrowDstV2Abi,
    functionName: 'PROXY_BYTECODE_HASH',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link escrowDstV2Abi}__ and `functionName` set to `"RESCUE_DELAY"`
 */
export const readEscrowDstV2RescueDelay = /*#__PURE__*/ createReadContract({
  abi: escrowDstV2Abi,
  functionName: 'RESCUE_DELAY',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link escrowDstV2Abi}__ and `functionName` set to `"_hashPublicAction"`
 */
export const readEscrowDstV2HashPublicAction = /*#__PURE__*/ createReadContract(
  { abi: escrowDstV2Abi, functionName: '_hashPublicAction' },
)

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link escrowDstV2Abi}__ and `functionName` set to `"_recover"`
 */
export const readEscrowDstV2Recover = /*#__PURE__*/ createReadContract({
  abi: escrowDstV2Abi,
  functionName: '_recover',
})

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link escrowDstV2Abi}__
 */
export const writeEscrowDstV2 = /*#__PURE__*/ createWriteContract({
  abi: escrowDstV2Abi,
})

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link escrowDstV2Abi}__ and `functionName` set to `"cancel"`
 */
export const writeEscrowDstV2Cancel = /*#__PURE__*/ createWriteContract({
  abi: escrowDstV2Abi,
  functionName: 'cancel',
})

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link escrowDstV2Abi}__ and `functionName` set to `"publicCancelSigned"`
 */
export const writeEscrowDstV2PublicCancelSigned =
  /*#__PURE__*/ createWriteContract({
    abi: escrowDstV2Abi,
    functionName: 'publicCancelSigned',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link escrowDstV2Abi}__ and `functionName` set to `"publicWithdraw"`
 */
export const writeEscrowDstV2PublicWithdraw = /*#__PURE__*/ createWriteContract(
  { abi: escrowDstV2Abi, functionName: 'publicWithdraw' },
)

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link escrowDstV2Abi}__ and `functionName` set to `"publicWithdrawSigned"`
 */
export const writeEscrowDstV2PublicWithdrawSigned =
  /*#__PURE__*/ createWriteContract({
    abi: escrowDstV2Abi,
    functionName: 'publicWithdrawSigned',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link escrowDstV2Abi}__ and `functionName` set to `"rescueFunds"`
 */
export const writeEscrowDstV2RescueFunds = /*#__PURE__*/ createWriteContract({
  abi: escrowDstV2Abi,
  functionName: 'rescueFunds',
})

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link escrowDstV2Abi}__ and `functionName` set to `"withdraw"`
 */
export const writeEscrowDstV2Withdraw = /*#__PURE__*/ createWriteContract({
  abi: escrowDstV2Abi,
  functionName: 'withdraw',
})

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link escrowDstV2Abi}__
 */
export const simulateEscrowDstV2 = /*#__PURE__*/ createSimulateContract({
  abi: escrowDstV2Abi,
})

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link escrowDstV2Abi}__ and `functionName` set to `"cancel"`
 */
export const simulateEscrowDstV2Cancel = /*#__PURE__*/ createSimulateContract({
  abi: escrowDstV2Abi,
  functionName: 'cancel',
})

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link escrowDstV2Abi}__ and `functionName` set to `"publicCancelSigned"`
 */
export const simulateEscrowDstV2PublicCancelSigned =
  /*#__PURE__*/ createSimulateContract({
    abi: escrowDstV2Abi,
    functionName: 'publicCancelSigned',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link escrowDstV2Abi}__ and `functionName` set to `"publicWithdraw"`
 */
export const simulateEscrowDstV2PublicWithdraw =
  /*#__PURE__*/ createSimulateContract({
    abi: escrowDstV2Abi,
    functionName: 'publicWithdraw',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link escrowDstV2Abi}__ and `functionName` set to `"publicWithdrawSigned"`
 */
export const simulateEscrowDstV2PublicWithdrawSigned =
  /*#__PURE__*/ createSimulateContract({
    abi: escrowDstV2Abi,
    functionName: 'publicWithdrawSigned',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link escrowDstV2Abi}__ and `functionName` set to `"rescueFunds"`
 */
export const simulateEscrowDstV2RescueFunds =
  /*#__PURE__*/ createSimulateContract({
    abi: escrowDstV2Abi,
    functionName: 'rescueFunds',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link escrowDstV2Abi}__ and `functionName` set to `"withdraw"`
 */
export const simulateEscrowDstV2Withdraw = /*#__PURE__*/ createSimulateContract(
  { abi: escrowDstV2Abi, functionName: 'withdraw' },
)

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link escrowDstV2Abi}__
 */
export const watchEscrowDstV2Event = /*#__PURE__*/ createWatchContractEvent({
  abi: escrowDstV2Abi,
})

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link escrowDstV2Abi}__ and `eventName` set to `"EscrowCancelled"`
 */
export const watchEscrowDstV2EscrowCancelledEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: escrowDstV2Abi,
    eventName: 'EscrowCancelled',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link escrowDstV2Abi}__ and `eventName` set to `"EscrowWithdrawal"`
 */
export const watchEscrowDstV2EscrowWithdrawalEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: escrowDstV2Abi,
    eventName: 'EscrowWithdrawal',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link escrowDstV2Abi}__ and `eventName` set to `"FundsRescued"`
 */
export const watchEscrowDstV2FundsRescuedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: escrowDstV2Abi,
    eventName: 'FundsRescued',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link escrowSrcV2Abi}__
 */
export const readEscrowSrcV2 = /*#__PURE__*/ createReadContract({
  abi: escrowSrcV2Abi,
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link escrowSrcV2Abi}__ and `functionName` set to `"FACTORY"`
 */
export const readEscrowSrcV2Factory = /*#__PURE__*/ createReadContract({
  abi: escrowSrcV2Abi,
  functionName: 'FACTORY',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link escrowSrcV2Abi}__ and `functionName` set to `"PROXY_BYTECODE_HASH"`
 */
export const readEscrowSrcV2ProxyBytecodeHash =
  /*#__PURE__*/ createReadContract({
    abi: escrowSrcV2Abi,
    functionName: 'PROXY_BYTECODE_HASH',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link escrowSrcV2Abi}__ and `functionName` set to `"RESCUE_DELAY"`
 */
export const readEscrowSrcV2RescueDelay = /*#__PURE__*/ createReadContract({
  abi: escrowSrcV2Abi,
  functionName: 'RESCUE_DELAY',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link escrowSrcV2Abi}__ and `functionName` set to `"_hashPublicAction"`
 */
export const readEscrowSrcV2HashPublicAction = /*#__PURE__*/ createReadContract(
  { abi: escrowSrcV2Abi, functionName: '_hashPublicAction' },
)

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link escrowSrcV2Abi}__ and `functionName` set to `"_recover"`
 */
export const readEscrowSrcV2Recover = /*#__PURE__*/ createReadContract({
  abi: escrowSrcV2Abi,
  functionName: '_recover',
})

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link escrowSrcV2Abi}__
 */
export const writeEscrowSrcV2 = /*#__PURE__*/ createWriteContract({
  abi: escrowSrcV2Abi,
})

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link escrowSrcV2Abi}__ and `functionName` set to `"cancel"`
 */
export const writeEscrowSrcV2Cancel = /*#__PURE__*/ createWriteContract({
  abi: escrowSrcV2Abi,
  functionName: 'cancel',
})

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link escrowSrcV2Abi}__ and `functionName` set to `"publicCancel"`
 */
export const writeEscrowSrcV2PublicCancel = /*#__PURE__*/ createWriteContract({
  abi: escrowSrcV2Abi,
  functionName: 'publicCancel',
})

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link escrowSrcV2Abi}__ and `functionName` set to `"publicCancelSigned"`
 */
export const writeEscrowSrcV2PublicCancelSigned =
  /*#__PURE__*/ createWriteContract({
    abi: escrowSrcV2Abi,
    functionName: 'publicCancelSigned',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link escrowSrcV2Abi}__ and `functionName` set to `"publicWithdraw"`
 */
export const writeEscrowSrcV2PublicWithdraw = /*#__PURE__*/ createWriteContract(
  { abi: escrowSrcV2Abi, functionName: 'publicWithdraw' },
)

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link escrowSrcV2Abi}__ and `functionName` set to `"publicWithdrawSigned"`
 */
export const writeEscrowSrcV2PublicWithdrawSigned =
  /*#__PURE__*/ createWriteContract({
    abi: escrowSrcV2Abi,
    functionName: 'publicWithdrawSigned',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link escrowSrcV2Abi}__ and `functionName` set to `"rescueFunds"`
 */
export const writeEscrowSrcV2RescueFunds = /*#__PURE__*/ createWriteContract({
  abi: escrowSrcV2Abi,
  functionName: 'rescueFunds',
})

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link escrowSrcV2Abi}__ and `functionName` set to `"withdraw"`
 */
export const writeEscrowSrcV2Withdraw = /*#__PURE__*/ createWriteContract({
  abi: escrowSrcV2Abi,
  functionName: 'withdraw',
})

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link escrowSrcV2Abi}__ and `functionName` set to `"withdrawTo"`
 */
export const writeEscrowSrcV2WithdrawTo = /*#__PURE__*/ createWriteContract({
  abi: escrowSrcV2Abi,
  functionName: 'withdrawTo',
})

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link escrowSrcV2Abi}__
 */
export const simulateEscrowSrcV2 = /*#__PURE__*/ createSimulateContract({
  abi: escrowSrcV2Abi,
})

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link escrowSrcV2Abi}__ and `functionName` set to `"cancel"`
 */
export const simulateEscrowSrcV2Cancel = /*#__PURE__*/ createSimulateContract({
  abi: escrowSrcV2Abi,
  functionName: 'cancel',
})

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link escrowSrcV2Abi}__ and `functionName` set to `"publicCancel"`
 */
export const simulateEscrowSrcV2PublicCancel =
  /*#__PURE__*/ createSimulateContract({
    abi: escrowSrcV2Abi,
    functionName: 'publicCancel',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link escrowSrcV2Abi}__ and `functionName` set to `"publicCancelSigned"`
 */
export const simulateEscrowSrcV2PublicCancelSigned =
  /*#__PURE__*/ createSimulateContract({
    abi: escrowSrcV2Abi,
    functionName: 'publicCancelSigned',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link escrowSrcV2Abi}__ and `functionName` set to `"publicWithdraw"`
 */
export const simulateEscrowSrcV2PublicWithdraw =
  /*#__PURE__*/ createSimulateContract({
    abi: escrowSrcV2Abi,
    functionName: 'publicWithdraw',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link escrowSrcV2Abi}__ and `functionName` set to `"publicWithdrawSigned"`
 */
export const simulateEscrowSrcV2PublicWithdrawSigned =
  /*#__PURE__*/ createSimulateContract({
    abi: escrowSrcV2Abi,
    functionName: 'publicWithdrawSigned',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link escrowSrcV2Abi}__ and `functionName` set to `"rescueFunds"`
 */
export const simulateEscrowSrcV2RescueFunds =
  /*#__PURE__*/ createSimulateContract({
    abi: escrowSrcV2Abi,
    functionName: 'rescueFunds',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link escrowSrcV2Abi}__ and `functionName` set to `"withdraw"`
 */
export const simulateEscrowSrcV2Withdraw = /*#__PURE__*/ createSimulateContract(
  { abi: escrowSrcV2Abi, functionName: 'withdraw' },
)

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link escrowSrcV2Abi}__ and `functionName` set to `"withdrawTo"`
 */
export const simulateEscrowSrcV2WithdrawTo =
  /*#__PURE__*/ createSimulateContract({
    abi: escrowSrcV2Abi,
    functionName: 'withdrawTo',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link escrowSrcV2Abi}__
 */
export const watchEscrowSrcV2Event = /*#__PURE__*/ createWatchContractEvent({
  abi: escrowSrcV2Abi,
})

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link escrowSrcV2Abi}__ and `eventName` set to `"EscrowCancelled"`
 */
export const watchEscrowSrcV2EscrowCancelledEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: escrowSrcV2Abi,
    eventName: 'EscrowCancelled',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link escrowSrcV2Abi}__ and `eventName` set to `"EscrowWithdrawal"`
 */
export const watchEscrowSrcV2EscrowWithdrawalEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: escrowSrcV2Abi,
    eventName: 'EscrowWithdrawal',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link escrowSrcV2Abi}__ and `eventName` set to `"FundsRescued"`
 */
export const watchEscrowSrcV2FundsRescuedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: escrowSrcV2Abi,
    eventName: 'FundsRescued',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link ierc20Abi}__
 */
export const readIerc20 = /*#__PURE__*/ createReadContract({ abi: ierc20Abi })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link ierc20Abi}__ and `functionName` set to `"allowance"`
 */
export const readIerc20Allowance = /*#__PURE__*/ createReadContract({
  abi: ierc20Abi,
  functionName: 'allowance',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link ierc20Abi}__ and `functionName` set to `"balanceOf"`
 */
export const readIerc20BalanceOf = /*#__PURE__*/ createReadContract({
  abi: ierc20Abi,
  functionName: 'balanceOf',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link ierc20Abi}__ and `functionName` set to `"totalSupply"`
 */
export const readIerc20TotalSupply = /*#__PURE__*/ createReadContract({
  abi: ierc20Abi,
  functionName: 'totalSupply',
})

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link ierc20Abi}__
 */
export const writeIerc20 = /*#__PURE__*/ createWriteContract({ abi: ierc20Abi })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link ierc20Abi}__ and `functionName` set to `"approve"`
 */
export const writeIerc20Approve = /*#__PURE__*/ createWriteContract({
  abi: ierc20Abi,
  functionName: 'approve',
})

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link ierc20Abi}__ and `functionName` set to `"transfer"`
 */
export const writeIerc20Transfer = /*#__PURE__*/ createWriteContract({
  abi: ierc20Abi,
  functionName: 'transfer',
})

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link ierc20Abi}__ and `functionName` set to `"transferFrom"`
 */
export const writeIerc20TransferFrom = /*#__PURE__*/ createWriteContract({
  abi: ierc20Abi,
  functionName: 'transferFrom',
})

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link ierc20Abi}__
 */
export const simulateIerc20 = /*#__PURE__*/ createSimulateContract({
  abi: ierc20Abi,
})

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link ierc20Abi}__ and `functionName` set to `"approve"`
 */
export const simulateIerc20Approve = /*#__PURE__*/ createSimulateContract({
  abi: ierc20Abi,
  functionName: 'approve',
})

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link ierc20Abi}__ and `functionName` set to `"transfer"`
 */
export const simulateIerc20Transfer = /*#__PURE__*/ createSimulateContract({
  abi: ierc20Abi,
  functionName: 'transfer',
})

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link ierc20Abi}__ and `functionName` set to `"transferFrom"`
 */
export const simulateIerc20TransferFrom = /*#__PURE__*/ createSimulateContract({
  abi: ierc20Abi,
  functionName: 'transferFrom',
})

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link ierc20Abi}__
 */
export const watchIerc20Event = /*#__PURE__*/ createWatchContractEvent({
  abi: ierc20Abi,
})

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link ierc20Abi}__ and `eventName` set to `"Approval"`
 */
export const watchIerc20ApprovalEvent = /*#__PURE__*/ createWatchContractEvent({
  abi: ierc20Abi,
  eventName: 'Approval',
})

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link ierc20Abi}__ and `eventName` set to `"Transfer"`
 */
export const watchIerc20TransferEvent = /*#__PURE__*/ createWatchContractEvent({
  abi: ierc20Abi,
  eventName: 'Transfer',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link simpleLimitOrderProtocolAbi}__
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 */
export const readSimpleLimitOrderProtocol = /*#__PURE__*/ createReadContract({
  abi: simpleLimitOrderProtocolAbi,
  address: simpleLimitOrderProtocolAddress,
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link simpleLimitOrderProtocolAbi}__ and `functionName` set to `"DOMAIN_SEPARATOR"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 */
export const readSimpleLimitOrderProtocolDomainSeparator =
  /*#__PURE__*/ createReadContract({
    abi: simpleLimitOrderProtocolAbi,
    address: simpleLimitOrderProtocolAddress,
    functionName: 'DOMAIN_SEPARATOR',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link simpleLimitOrderProtocolAbi}__ and `functionName` set to `"and"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 */
export const readSimpleLimitOrderProtocolAnd = /*#__PURE__*/ createReadContract(
  {
    abi: simpleLimitOrderProtocolAbi,
    address: simpleLimitOrderProtocolAddress,
    functionName: 'and',
  },
)

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link simpleLimitOrderProtocolAbi}__ and `functionName` set to `"arbitraryStaticCall"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 */
export const readSimpleLimitOrderProtocolArbitraryStaticCall =
  /*#__PURE__*/ createReadContract({
    abi: simpleLimitOrderProtocolAbi,
    address: simpleLimitOrderProtocolAddress,
    functionName: 'arbitraryStaticCall',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link simpleLimitOrderProtocolAbi}__ and `functionName` set to `"bitInvalidatorForOrder"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 */
export const readSimpleLimitOrderProtocolBitInvalidatorForOrder =
  /*#__PURE__*/ createReadContract({
    abi: simpleLimitOrderProtocolAbi,
    address: simpleLimitOrderProtocolAddress,
    functionName: 'bitInvalidatorForOrder',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link simpleLimitOrderProtocolAbi}__ and `functionName` set to `"checkPredicate"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 */
export const readSimpleLimitOrderProtocolCheckPredicate =
  /*#__PURE__*/ createReadContract({
    abi: simpleLimitOrderProtocolAbi,
    address: simpleLimitOrderProtocolAddress,
    functionName: 'checkPredicate',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link simpleLimitOrderProtocolAbi}__ and `functionName` set to `"eip712Domain"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 */
export const readSimpleLimitOrderProtocolEip712Domain =
  /*#__PURE__*/ createReadContract({
    abi: simpleLimitOrderProtocolAbi,
    address: simpleLimitOrderProtocolAddress,
    functionName: 'eip712Domain',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link simpleLimitOrderProtocolAbi}__ and `functionName` set to `"epoch"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 */
export const readSimpleLimitOrderProtocolEpoch =
  /*#__PURE__*/ createReadContract({
    abi: simpleLimitOrderProtocolAbi,
    address: simpleLimitOrderProtocolAddress,
    functionName: 'epoch',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link simpleLimitOrderProtocolAbi}__ and `functionName` set to `"epochEquals"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 */
export const readSimpleLimitOrderProtocolEpochEquals =
  /*#__PURE__*/ createReadContract({
    abi: simpleLimitOrderProtocolAbi,
    address: simpleLimitOrderProtocolAddress,
    functionName: 'epochEquals',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link simpleLimitOrderProtocolAbi}__ and `functionName` set to `"eq"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 */
export const readSimpleLimitOrderProtocolEq = /*#__PURE__*/ createReadContract({
  abi: simpleLimitOrderProtocolAbi,
  address: simpleLimitOrderProtocolAddress,
  functionName: 'eq',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link simpleLimitOrderProtocolAbi}__ and `functionName` set to `"gt"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 */
export const readSimpleLimitOrderProtocolGt = /*#__PURE__*/ createReadContract({
  abi: simpleLimitOrderProtocolAbi,
  address: simpleLimitOrderProtocolAddress,
  functionName: 'gt',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link simpleLimitOrderProtocolAbi}__ and `functionName` set to `"hashOrder"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 */
export const readSimpleLimitOrderProtocolHashOrder =
  /*#__PURE__*/ createReadContract({
    abi: simpleLimitOrderProtocolAbi,
    address: simpleLimitOrderProtocolAddress,
    functionName: 'hashOrder',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link simpleLimitOrderProtocolAbi}__ and `functionName` set to `"lt"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 */
export const readSimpleLimitOrderProtocolLt = /*#__PURE__*/ createReadContract({
  abi: simpleLimitOrderProtocolAbi,
  address: simpleLimitOrderProtocolAddress,
  functionName: 'lt',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link simpleLimitOrderProtocolAbi}__ and `functionName` set to `"not"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 */
export const readSimpleLimitOrderProtocolNot = /*#__PURE__*/ createReadContract(
  {
    abi: simpleLimitOrderProtocolAbi,
    address: simpleLimitOrderProtocolAddress,
    functionName: 'not',
  },
)

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link simpleLimitOrderProtocolAbi}__ and `functionName` set to `"or"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 */
export const readSimpleLimitOrderProtocolOr = /*#__PURE__*/ createReadContract({
  abi: simpleLimitOrderProtocolAbi,
  address: simpleLimitOrderProtocolAddress,
  functionName: 'or',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link simpleLimitOrderProtocolAbi}__ and `functionName` set to `"paused"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 */
export const readSimpleLimitOrderProtocolPaused =
  /*#__PURE__*/ createReadContract({
    abi: simpleLimitOrderProtocolAbi,
    address: simpleLimitOrderProtocolAddress,
    functionName: 'paused',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link simpleLimitOrderProtocolAbi}__ and `functionName` set to `"rawRemainingInvalidatorForOrder"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 */
export const readSimpleLimitOrderProtocolRawRemainingInvalidatorForOrder =
  /*#__PURE__*/ createReadContract({
    abi: simpleLimitOrderProtocolAbi,
    address: simpleLimitOrderProtocolAddress,
    functionName: 'rawRemainingInvalidatorForOrder',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link simpleLimitOrderProtocolAbi}__ and `functionName` set to `"remainingInvalidatorForOrder"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 */
export const readSimpleLimitOrderProtocolRemainingInvalidatorForOrder =
  /*#__PURE__*/ createReadContract({
    abi: simpleLimitOrderProtocolAbi,
    address: simpleLimitOrderProtocolAddress,
    functionName: 'remainingInvalidatorForOrder',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link simpleLimitOrderProtocolAbi}__
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 */
export const writeSimpleLimitOrderProtocol = /*#__PURE__*/ createWriteContract({
  abi: simpleLimitOrderProtocolAbi,
  address: simpleLimitOrderProtocolAddress,
})

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link simpleLimitOrderProtocolAbi}__ and `functionName` set to `"advanceEpoch"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 */
export const writeSimpleLimitOrderProtocolAdvanceEpoch =
  /*#__PURE__*/ createWriteContract({
    abi: simpleLimitOrderProtocolAbi,
    address: simpleLimitOrderProtocolAddress,
    functionName: 'advanceEpoch',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link simpleLimitOrderProtocolAbi}__ and `functionName` set to `"bitsInvalidateForOrder"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 */
export const writeSimpleLimitOrderProtocolBitsInvalidateForOrder =
  /*#__PURE__*/ createWriteContract({
    abi: simpleLimitOrderProtocolAbi,
    address: simpleLimitOrderProtocolAddress,
    functionName: 'bitsInvalidateForOrder',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link simpleLimitOrderProtocolAbi}__ and `functionName` set to `"cancelOrder"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 */
export const writeSimpleLimitOrderProtocolCancelOrder =
  /*#__PURE__*/ createWriteContract({
    abi: simpleLimitOrderProtocolAbi,
    address: simpleLimitOrderProtocolAddress,
    functionName: 'cancelOrder',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link simpleLimitOrderProtocolAbi}__ and `functionName` set to `"cancelOrders"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 */
export const writeSimpleLimitOrderProtocolCancelOrders =
  /*#__PURE__*/ createWriteContract({
    abi: simpleLimitOrderProtocolAbi,
    address: simpleLimitOrderProtocolAddress,
    functionName: 'cancelOrders',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link simpleLimitOrderProtocolAbi}__ and `functionName` set to `"fillContractOrder"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 */
export const writeSimpleLimitOrderProtocolFillContractOrder =
  /*#__PURE__*/ createWriteContract({
    abi: simpleLimitOrderProtocolAbi,
    address: simpleLimitOrderProtocolAddress,
    functionName: 'fillContractOrder',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link simpleLimitOrderProtocolAbi}__ and `functionName` set to `"fillContractOrderArgs"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 */
export const writeSimpleLimitOrderProtocolFillContractOrderArgs =
  /*#__PURE__*/ createWriteContract({
    abi: simpleLimitOrderProtocolAbi,
    address: simpleLimitOrderProtocolAddress,
    functionName: 'fillContractOrderArgs',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link simpleLimitOrderProtocolAbi}__ and `functionName` set to `"fillOrder"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 */
export const writeSimpleLimitOrderProtocolFillOrder =
  /*#__PURE__*/ createWriteContract({
    abi: simpleLimitOrderProtocolAbi,
    address: simpleLimitOrderProtocolAddress,
    functionName: 'fillOrder',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link simpleLimitOrderProtocolAbi}__ and `functionName` set to `"fillOrderArgs"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 */
export const writeSimpleLimitOrderProtocolFillOrderArgs =
  /*#__PURE__*/ createWriteContract({
    abi: simpleLimitOrderProtocolAbi,
    address: simpleLimitOrderProtocolAddress,
    functionName: 'fillOrderArgs',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link simpleLimitOrderProtocolAbi}__ and `functionName` set to `"increaseEpoch"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 */
export const writeSimpleLimitOrderProtocolIncreaseEpoch =
  /*#__PURE__*/ createWriteContract({
    abi: simpleLimitOrderProtocolAbi,
    address: simpleLimitOrderProtocolAddress,
    functionName: 'increaseEpoch',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link simpleLimitOrderProtocolAbi}__ and `functionName` set to `"permitAndCall"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 */
export const writeSimpleLimitOrderProtocolPermitAndCall =
  /*#__PURE__*/ createWriteContract({
    abi: simpleLimitOrderProtocolAbi,
    address: simpleLimitOrderProtocolAddress,
    functionName: 'permitAndCall',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link simpleLimitOrderProtocolAbi}__ and `functionName` set to `"simulate"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 */
export const writeSimpleLimitOrderProtocolSimulate =
  /*#__PURE__*/ createWriteContract({
    abi: simpleLimitOrderProtocolAbi,
    address: simpleLimitOrderProtocolAddress,
    functionName: 'simulate',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link simpleLimitOrderProtocolAbi}__
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 */
export const simulateSimpleLimitOrderProtocol =
  /*#__PURE__*/ createSimulateContract({
    abi: simpleLimitOrderProtocolAbi,
    address: simpleLimitOrderProtocolAddress,
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link simpleLimitOrderProtocolAbi}__ and `functionName` set to `"advanceEpoch"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 */
export const simulateSimpleLimitOrderProtocolAdvanceEpoch =
  /*#__PURE__*/ createSimulateContract({
    abi: simpleLimitOrderProtocolAbi,
    address: simpleLimitOrderProtocolAddress,
    functionName: 'advanceEpoch',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link simpleLimitOrderProtocolAbi}__ and `functionName` set to `"bitsInvalidateForOrder"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 */
export const simulateSimpleLimitOrderProtocolBitsInvalidateForOrder =
  /*#__PURE__*/ createSimulateContract({
    abi: simpleLimitOrderProtocolAbi,
    address: simpleLimitOrderProtocolAddress,
    functionName: 'bitsInvalidateForOrder',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link simpleLimitOrderProtocolAbi}__ and `functionName` set to `"cancelOrder"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 */
export const simulateSimpleLimitOrderProtocolCancelOrder =
  /*#__PURE__*/ createSimulateContract({
    abi: simpleLimitOrderProtocolAbi,
    address: simpleLimitOrderProtocolAddress,
    functionName: 'cancelOrder',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link simpleLimitOrderProtocolAbi}__ and `functionName` set to `"cancelOrders"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 */
export const simulateSimpleLimitOrderProtocolCancelOrders =
  /*#__PURE__*/ createSimulateContract({
    abi: simpleLimitOrderProtocolAbi,
    address: simpleLimitOrderProtocolAddress,
    functionName: 'cancelOrders',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link simpleLimitOrderProtocolAbi}__ and `functionName` set to `"fillContractOrder"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 */
export const simulateSimpleLimitOrderProtocolFillContractOrder =
  /*#__PURE__*/ createSimulateContract({
    abi: simpleLimitOrderProtocolAbi,
    address: simpleLimitOrderProtocolAddress,
    functionName: 'fillContractOrder',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link simpleLimitOrderProtocolAbi}__ and `functionName` set to `"fillContractOrderArgs"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 */
export const simulateSimpleLimitOrderProtocolFillContractOrderArgs =
  /*#__PURE__*/ createSimulateContract({
    abi: simpleLimitOrderProtocolAbi,
    address: simpleLimitOrderProtocolAddress,
    functionName: 'fillContractOrderArgs',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link simpleLimitOrderProtocolAbi}__ and `functionName` set to `"fillOrder"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 */
export const simulateSimpleLimitOrderProtocolFillOrder =
  /*#__PURE__*/ createSimulateContract({
    abi: simpleLimitOrderProtocolAbi,
    address: simpleLimitOrderProtocolAddress,
    functionName: 'fillOrder',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link simpleLimitOrderProtocolAbi}__ and `functionName` set to `"fillOrderArgs"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 */
export const simulateSimpleLimitOrderProtocolFillOrderArgs =
  /*#__PURE__*/ createSimulateContract({
    abi: simpleLimitOrderProtocolAbi,
    address: simpleLimitOrderProtocolAddress,
    functionName: 'fillOrderArgs',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link simpleLimitOrderProtocolAbi}__ and `functionName` set to `"increaseEpoch"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 */
export const simulateSimpleLimitOrderProtocolIncreaseEpoch =
  /*#__PURE__*/ createSimulateContract({
    abi: simpleLimitOrderProtocolAbi,
    address: simpleLimitOrderProtocolAddress,
    functionName: 'increaseEpoch',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link simpleLimitOrderProtocolAbi}__ and `functionName` set to `"permitAndCall"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 */
export const simulateSimpleLimitOrderProtocolPermitAndCall =
  /*#__PURE__*/ createSimulateContract({
    abi: simpleLimitOrderProtocolAbi,
    address: simpleLimitOrderProtocolAddress,
    functionName: 'permitAndCall',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link simpleLimitOrderProtocolAbi}__ and `functionName` set to `"simulate"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 */
export const simulateSimpleLimitOrderProtocolSimulate =
  /*#__PURE__*/ createSimulateContract({
    abi: simpleLimitOrderProtocolAbi,
    address: simpleLimitOrderProtocolAddress,
    functionName: 'simulate',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link simpleLimitOrderProtocolAbi}__
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 */
export const watchSimpleLimitOrderProtocolEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: simpleLimitOrderProtocolAbi,
    address: simpleLimitOrderProtocolAddress,
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link simpleLimitOrderProtocolAbi}__ and `eventName` set to `"BitInvalidatorUpdated"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 */
export const watchSimpleLimitOrderProtocolBitInvalidatorUpdatedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: simpleLimitOrderProtocolAbi,
    address: simpleLimitOrderProtocolAddress,
    eventName: 'BitInvalidatorUpdated',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link simpleLimitOrderProtocolAbi}__ and `eventName` set to `"EIP712DomainChanged"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 */
export const watchSimpleLimitOrderProtocolEip712DomainChangedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: simpleLimitOrderProtocolAbi,
    address: simpleLimitOrderProtocolAddress,
    eventName: 'EIP712DomainChanged',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link simpleLimitOrderProtocolAbi}__ and `eventName` set to `"EpochIncreased"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 */
export const watchSimpleLimitOrderProtocolEpochIncreasedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: simpleLimitOrderProtocolAbi,
    address: simpleLimitOrderProtocolAddress,
    eventName: 'EpochIncreased',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link simpleLimitOrderProtocolAbi}__ and `eventName` set to `"OrderCancelled"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 */
export const watchSimpleLimitOrderProtocolOrderCancelledEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: simpleLimitOrderProtocolAbi,
    address: simpleLimitOrderProtocolAddress,
    eventName: 'OrderCancelled',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link simpleLimitOrderProtocolAbi}__ and `eventName` set to `"OrderFilled"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 */
export const watchSimpleLimitOrderProtocolOrderFilledEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: simpleLimitOrderProtocolAbi,
    address: simpleLimitOrderProtocolAddress,
    eventName: 'OrderFilled',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link simpleLimitOrderProtocolAbi}__ and `eventName` set to `"Paused"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 */
export const watchSimpleLimitOrderProtocolPausedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: simpleLimitOrderProtocolAbi,
    address: simpleLimitOrderProtocolAddress,
    eventName: 'Paused',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link simpleLimitOrderProtocolAbi}__ and `eventName` set to `"Unpaused"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 */
export const watchSimpleLimitOrderProtocolUnpausedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: simpleLimitOrderProtocolAbi,
    address: simpleLimitOrderProtocolAddress,
    eventName: 'Unpaused',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link simplifiedEscrowFactoryAbi}__
 */
export const readSimplifiedEscrowFactory = /*#__PURE__*/ createReadContract({
  abi: simplifiedEscrowFactoryAbi,
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link simplifiedEscrowFactoryAbi}__ and `functionName` set to `"ESCROW_DST_IMPLEMENTATION"`
 */
export const readSimplifiedEscrowFactoryEscrowDstImplementation =
  /*#__PURE__*/ createReadContract({
    abi: simplifiedEscrowFactoryAbi,
    functionName: 'ESCROW_DST_IMPLEMENTATION',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link simplifiedEscrowFactoryAbi}__ and `functionName` set to `"ESCROW_SRC_IMPLEMENTATION"`
 */
export const readSimplifiedEscrowFactoryEscrowSrcImplementation =
  /*#__PURE__*/ createReadContract({
    abi: simplifiedEscrowFactoryAbi,
    functionName: 'ESCROW_SRC_IMPLEMENTATION',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link simplifiedEscrowFactoryAbi}__ and `functionName` set to `"addressOfEscrow"`
 */
export const readSimplifiedEscrowFactoryAddressOfEscrow =
  /*#__PURE__*/ createReadContract({
    abi: simplifiedEscrowFactoryAbi,
    functionName: 'addressOfEscrow',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link simplifiedEscrowFactoryAbi}__ and `functionName` set to `"emergencyPaused"`
 */
export const readSimplifiedEscrowFactoryEmergencyPaused =
  /*#__PURE__*/ createReadContract({
    abi: simplifiedEscrowFactoryAbi,
    functionName: 'emergencyPaused',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link simplifiedEscrowFactoryAbi}__ and `functionName` set to `"escrows"`
 */
export const readSimplifiedEscrowFactoryEscrows =
  /*#__PURE__*/ createReadContract({
    abi: simplifiedEscrowFactoryAbi,
    functionName: 'escrows',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link simplifiedEscrowFactoryAbi}__ and `functionName` set to `"makerWhitelistEnabled"`
 */
export const readSimplifiedEscrowFactoryMakerWhitelistEnabled =
  /*#__PURE__*/ createReadContract({
    abi: simplifiedEscrowFactoryAbi,
    functionName: 'makerWhitelistEnabled',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link simplifiedEscrowFactoryAbi}__ and `functionName` set to `"owner"`
 */
export const readSimplifiedEscrowFactoryOwner =
  /*#__PURE__*/ createReadContract({
    abi: simplifiedEscrowFactoryAbi,
    functionName: 'owner',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link simplifiedEscrowFactoryAbi}__ and `functionName` set to `"resolverCount"`
 */
export const readSimplifiedEscrowFactoryResolverCount =
  /*#__PURE__*/ createReadContract({
    abi: simplifiedEscrowFactoryAbi,
    functionName: 'resolverCount',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link simplifiedEscrowFactoryAbi}__ and `functionName` set to `"whitelistedMakers"`
 */
export const readSimplifiedEscrowFactoryWhitelistedMakers =
  /*#__PURE__*/ createReadContract({
    abi: simplifiedEscrowFactoryAbi,
    functionName: 'whitelistedMakers',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link simplifiedEscrowFactoryAbi}__ and `functionName` set to `"whitelistedResolvers"`
 */
export const readSimplifiedEscrowFactoryWhitelistedResolvers =
  /*#__PURE__*/ createReadContract({
    abi: simplifiedEscrowFactoryAbi,
    functionName: 'whitelistedResolvers',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link simplifiedEscrowFactoryAbi}__
 */
export const writeSimplifiedEscrowFactory = /*#__PURE__*/ createWriteContract({
  abi: simplifiedEscrowFactoryAbi,
})

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link simplifiedEscrowFactoryAbi}__ and `functionName` set to `"addMaker"`
 */
export const writeSimplifiedEscrowFactoryAddMaker =
  /*#__PURE__*/ createWriteContract({
    abi: simplifiedEscrowFactoryAbi,
    functionName: 'addMaker',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link simplifiedEscrowFactoryAbi}__ and `functionName` set to `"addResolver"`
 */
export const writeSimplifiedEscrowFactoryAddResolver =
  /*#__PURE__*/ createWriteContract({
    abi: simplifiedEscrowFactoryAbi,
    functionName: 'addResolver',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link simplifiedEscrowFactoryAbi}__ and `functionName` set to `"createDstEscrow"`
 */
export const writeSimplifiedEscrowFactoryCreateDstEscrow =
  /*#__PURE__*/ createWriteContract({
    abi: simplifiedEscrowFactoryAbi,
    functionName: 'createDstEscrow',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link simplifiedEscrowFactoryAbi}__ and `functionName` set to `"createSrcEscrow"`
 */
export const writeSimplifiedEscrowFactoryCreateSrcEscrow =
  /*#__PURE__*/ createWriteContract({
    abi: simplifiedEscrowFactoryAbi,
    functionName: 'createSrcEscrow',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link simplifiedEscrowFactoryAbi}__ and `functionName` set to `"pause"`
 */
export const writeSimplifiedEscrowFactoryPause =
  /*#__PURE__*/ createWriteContract({
    abi: simplifiedEscrowFactoryAbi,
    functionName: 'pause',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link simplifiedEscrowFactoryAbi}__ and `functionName` set to `"postInteraction"`
 */
export const writeSimplifiedEscrowFactoryPostInteraction =
  /*#__PURE__*/ createWriteContract({
    abi: simplifiedEscrowFactoryAbi,
    functionName: 'postInteraction',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link simplifiedEscrowFactoryAbi}__ and `functionName` set to `"removeMaker"`
 */
export const writeSimplifiedEscrowFactoryRemoveMaker =
  /*#__PURE__*/ createWriteContract({
    abi: simplifiedEscrowFactoryAbi,
    functionName: 'removeMaker',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link simplifiedEscrowFactoryAbi}__ and `functionName` set to `"removeResolver"`
 */
export const writeSimplifiedEscrowFactoryRemoveResolver =
  /*#__PURE__*/ createWriteContract({
    abi: simplifiedEscrowFactoryAbi,
    functionName: 'removeResolver',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link simplifiedEscrowFactoryAbi}__ and `functionName` set to `"setMakerWhitelistEnabled"`
 */
export const writeSimplifiedEscrowFactorySetMakerWhitelistEnabled =
  /*#__PURE__*/ createWriteContract({
    abi: simplifiedEscrowFactoryAbi,
    functionName: 'setMakerWhitelistEnabled',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link simplifiedEscrowFactoryAbi}__ and `functionName` set to `"transferOwnership"`
 */
export const writeSimplifiedEscrowFactoryTransferOwnership =
  /*#__PURE__*/ createWriteContract({
    abi: simplifiedEscrowFactoryAbi,
    functionName: 'transferOwnership',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link simplifiedEscrowFactoryAbi}__ and `functionName` set to `"unpause"`
 */
export const writeSimplifiedEscrowFactoryUnpause =
  /*#__PURE__*/ createWriteContract({
    abi: simplifiedEscrowFactoryAbi,
    functionName: 'unpause',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link simplifiedEscrowFactoryAbi}__
 */
export const simulateSimplifiedEscrowFactory =
  /*#__PURE__*/ createSimulateContract({ abi: simplifiedEscrowFactoryAbi })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link simplifiedEscrowFactoryAbi}__ and `functionName` set to `"addMaker"`
 */
export const simulateSimplifiedEscrowFactoryAddMaker =
  /*#__PURE__*/ createSimulateContract({
    abi: simplifiedEscrowFactoryAbi,
    functionName: 'addMaker',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link simplifiedEscrowFactoryAbi}__ and `functionName` set to `"addResolver"`
 */
export const simulateSimplifiedEscrowFactoryAddResolver =
  /*#__PURE__*/ createSimulateContract({
    abi: simplifiedEscrowFactoryAbi,
    functionName: 'addResolver',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link simplifiedEscrowFactoryAbi}__ and `functionName` set to `"createDstEscrow"`
 */
export const simulateSimplifiedEscrowFactoryCreateDstEscrow =
  /*#__PURE__*/ createSimulateContract({
    abi: simplifiedEscrowFactoryAbi,
    functionName: 'createDstEscrow',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link simplifiedEscrowFactoryAbi}__ and `functionName` set to `"createSrcEscrow"`
 */
export const simulateSimplifiedEscrowFactoryCreateSrcEscrow =
  /*#__PURE__*/ createSimulateContract({
    abi: simplifiedEscrowFactoryAbi,
    functionName: 'createSrcEscrow',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link simplifiedEscrowFactoryAbi}__ and `functionName` set to `"pause"`
 */
export const simulateSimplifiedEscrowFactoryPause =
  /*#__PURE__*/ createSimulateContract({
    abi: simplifiedEscrowFactoryAbi,
    functionName: 'pause',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link simplifiedEscrowFactoryAbi}__ and `functionName` set to `"postInteraction"`
 */
export const simulateSimplifiedEscrowFactoryPostInteraction =
  /*#__PURE__*/ createSimulateContract({
    abi: simplifiedEscrowFactoryAbi,
    functionName: 'postInteraction',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link simplifiedEscrowFactoryAbi}__ and `functionName` set to `"removeMaker"`
 */
export const simulateSimplifiedEscrowFactoryRemoveMaker =
  /*#__PURE__*/ createSimulateContract({
    abi: simplifiedEscrowFactoryAbi,
    functionName: 'removeMaker',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link simplifiedEscrowFactoryAbi}__ and `functionName` set to `"removeResolver"`
 */
export const simulateSimplifiedEscrowFactoryRemoveResolver =
  /*#__PURE__*/ createSimulateContract({
    abi: simplifiedEscrowFactoryAbi,
    functionName: 'removeResolver',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link simplifiedEscrowFactoryAbi}__ and `functionName` set to `"setMakerWhitelistEnabled"`
 */
export const simulateSimplifiedEscrowFactorySetMakerWhitelistEnabled =
  /*#__PURE__*/ createSimulateContract({
    abi: simplifiedEscrowFactoryAbi,
    functionName: 'setMakerWhitelistEnabled',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link simplifiedEscrowFactoryAbi}__ and `functionName` set to `"transferOwnership"`
 */
export const simulateSimplifiedEscrowFactoryTransferOwnership =
  /*#__PURE__*/ createSimulateContract({
    abi: simplifiedEscrowFactoryAbi,
    functionName: 'transferOwnership',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link simplifiedEscrowFactoryAbi}__ and `functionName` set to `"unpause"`
 */
export const simulateSimplifiedEscrowFactoryUnpause =
  /*#__PURE__*/ createSimulateContract({
    abi: simplifiedEscrowFactoryAbi,
    functionName: 'unpause',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link simplifiedEscrowFactoryAbi}__
 */
export const watchSimplifiedEscrowFactoryEvent =
  /*#__PURE__*/ createWatchContractEvent({ abi: simplifiedEscrowFactoryAbi })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link simplifiedEscrowFactoryAbi}__ and `eventName` set to `"DstEscrowCreated"`
 */
export const watchSimplifiedEscrowFactoryDstEscrowCreatedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: simplifiedEscrowFactoryAbi,
    eventName: 'DstEscrowCreated',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link simplifiedEscrowFactoryAbi}__ and `eventName` set to `"EmergencyPause"`
 */
export const watchSimplifiedEscrowFactoryEmergencyPauseEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: simplifiedEscrowFactoryAbi,
    eventName: 'EmergencyPause',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link simplifiedEscrowFactoryAbi}__ and `eventName` set to `"MakerRemoved"`
 */
export const watchSimplifiedEscrowFactoryMakerRemovedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: simplifiedEscrowFactoryAbi,
    eventName: 'MakerRemoved',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link simplifiedEscrowFactoryAbi}__ and `eventName` set to `"MakerWhitelisted"`
 */
export const watchSimplifiedEscrowFactoryMakerWhitelistedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: simplifiedEscrowFactoryAbi,
    eventName: 'MakerWhitelisted',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link simplifiedEscrowFactoryAbi}__ and `eventName` set to `"OwnershipTransferred"`
 */
export const watchSimplifiedEscrowFactoryOwnershipTransferredEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: simplifiedEscrowFactoryAbi,
    eventName: 'OwnershipTransferred',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link simplifiedEscrowFactoryAbi}__ and `eventName` set to `"PostInteractionEscrowCreated"`
 */
export const watchSimplifiedEscrowFactoryPostInteractionEscrowCreatedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: simplifiedEscrowFactoryAbi,
    eventName: 'PostInteractionEscrowCreated',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link simplifiedEscrowFactoryAbi}__ and `eventName` set to `"ResolverRemoved"`
 */
export const watchSimplifiedEscrowFactoryResolverRemovedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: simplifiedEscrowFactoryAbi,
    eventName: 'ResolverRemoved',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link simplifiedEscrowFactoryAbi}__ and `eventName` set to `"ResolverWhitelisted"`
 */
export const watchSimplifiedEscrowFactoryResolverWhitelistedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: simplifiedEscrowFactoryAbi,
    eventName: 'ResolverWhitelisted',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link simplifiedEscrowFactoryAbi}__ and `eventName` set to `"SrcEscrowCreated"`
 */
export const watchSimplifiedEscrowFactorySrcEscrowCreatedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: simplifiedEscrowFactoryAbi,
    eventName: 'SrcEscrowCreated',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link simplifiedEscrowFactoryV2_3Abi}__
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 */
export const readSimplifiedEscrowFactoryV2_3 = /*#__PURE__*/ createReadContract(
  {
    abi: simplifiedEscrowFactoryV2_3Abi,
    address: simplifiedEscrowFactoryV2_3Address,
  },
)

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link simplifiedEscrowFactoryV2_3Abi}__ and `functionName` set to `"ESCROW_DST_IMPLEMENTATION"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 */
export const readSimplifiedEscrowFactoryV2_3EscrowDstImplementation =
  /*#__PURE__*/ createReadContract({
    abi: simplifiedEscrowFactoryV2_3Abi,
    address: simplifiedEscrowFactoryV2_3Address,
    functionName: 'ESCROW_DST_IMPLEMENTATION',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link simplifiedEscrowFactoryV2_3Abi}__ and `functionName` set to `"ESCROW_SRC_IMPLEMENTATION"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 */
export const readSimplifiedEscrowFactoryV2_3EscrowSrcImplementation =
  /*#__PURE__*/ createReadContract({
    abi: simplifiedEscrowFactoryV2_3Abi,
    address: simplifiedEscrowFactoryV2_3Address,
    functionName: 'ESCROW_SRC_IMPLEMENTATION',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link simplifiedEscrowFactoryV2_3Abi}__ and `functionName` set to `"addressOfEscrow"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 */
export const readSimplifiedEscrowFactoryV2_3AddressOfEscrow =
  /*#__PURE__*/ createReadContract({
    abi: simplifiedEscrowFactoryV2_3Abi,
    address: simplifiedEscrowFactoryV2_3Address,
    functionName: 'addressOfEscrow',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link simplifiedEscrowFactoryV2_3Abi}__ and `functionName` set to `"emergencyPaused"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 */
export const readSimplifiedEscrowFactoryV2_3EmergencyPaused =
  /*#__PURE__*/ createReadContract({
    abi: simplifiedEscrowFactoryV2_3Abi,
    address: simplifiedEscrowFactoryV2_3Address,
    functionName: 'emergencyPaused',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link simplifiedEscrowFactoryV2_3Abi}__ and `functionName` set to `"escrows"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 */
export const readSimplifiedEscrowFactoryV2_3Escrows =
  /*#__PURE__*/ createReadContract({
    abi: simplifiedEscrowFactoryV2_3Abi,
    address: simplifiedEscrowFactoryV2_3Address,
    functionName: 'escrows',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link simplifiedEscrowFactoryV2_3Abi}__ and `functionName` set to `"isWhitelistedResolver"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 */
export const readSimplifiedEscrowFactoryV2_3IsWhitelistedResolver =
  /*#__PURE__*/ createReadContract({
    abi: simplifiedEscrowFactoryV2_3Abi,
    address: simplifiedEscrowFactoryV2_3Address,
    functionName: 'isWhitelistedResolver',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link simplifiedEscrowFactoryV2_3Abi}__ and `functionName` set to `"makerWhitelistEnabled"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 */
export const readSimplifiedEscrowFactoryV2_3MakerWhitelistEnabled =
  /*#__PURE__*/ createReadContract({
    abi: simplifiedEscrowFactoryV2_3Abi,
    address: simplifiedEscrowFactoryV2_3Address,
    functionName: 'makerWhitelistEnabled',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link simplifiedEscrowFactoryV2_3Abi}__ and `functionName` set to `"owner"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 */
export const readSimplifiedEscrowFactoryV2_3Owner =
  /*#__PURE__*/ createReadContract({
    abi: simplifiedEscrowFactoryV2_3Abi,
    address: simplifiedEscrowFactoryV2_3Address,
    functionName: 'owner',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link simplifiedEscrowFactoryV2_3Abi}__ and `functionName` set to `"resolverCount"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 */
export const readSimplifiedEscrowFactoryV2_3ResolverCount =
  /*#__PURE__*/ createReadContract({
    abi: simplifiedEscrowFactoryV2_3Abi,
    address: simplifiedEscrowFactoryV2_3Address,
    functionName: 'resolverCount',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link simplifiedEscrowFactoryV2_3Abi}__ and `functionName` set to `"whitelistedMakers"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 */
export const readSimplifiedEscrowFactoryV2_3WhitelistedMakers =
  /*#__PURE__*/ createReadContract({
    abi: simplifiedEscrowFactoryV2_3Abi,
    address: simplifiedEscrowFactoryV2_3Address,
    functionName: 'whitelistedMakers',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link simplifiedEscrowFactoryV2_3Abi}__ and `functionName` set to `"whitelistedResolvers"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 */
export const readSimplifiedEscrowFactoryV2_3WhitelistedResolvers =
  /*#__PURE__*/ createReadContract({
    abi: simplifiedEscrowFactoryV2_3Abi,
    address: simplifiedEscrowFactoryV2_3Address,
    functionName: 'whitelistedResolvers',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link simplifiedEscrowFactoryV2_3Abi}__
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 */
export const writeSimplifiedEscrowFactoryV2_3 =
  /*#__PURE__*/ createWriteContract({
    abi: simplifiedEscrowFactoryV2_3Abi,
    address: simplifiedEscrowFactoryV2_3Address,
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link simplifiedEscrowFactoryV2_3Abi}__ and `functionName` set to `"addMaker"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 */
export const writeSimplifiedEscrowFactoryV2_3AddMaker =
  /*#__PURE__*/ createWriteContract({
    abi: simplifiedEscrowFactoryV2_3Abi,
    address: simplifiedEscrowFactoryV2_3Address,
    functionName: 'addMaker',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link simplifiedEscrowFactoryV2_3Abi}__ and `functionName` set to `"addResolver"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 */
export const writeSimplifiedEscrowFactoryV2_3AddResolver =
  /*#__PURE__*/ createWriteContract({
    abi: simplifiedEscrowFactoryV2_3Abi,
    address: simplifiedEscrowFactoryV2_3Address,
    functionName: 'addResolver',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link simplifiedEscrowFactoryV2_3Abi}__ and `functionName` set to `"createDstEscrow"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 */
export const writeSimplifiedEscrowFactoryV2_3CreateDstEscrow =
  /*#__PURE__*/ createWriteContract({
    abi: simplifiedEscrowFactoryV2_3Abi,
    address: simplifiedEscrowFactoryV2_3Address,
    functionName: 'createDstEscrow',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link simplifiedEscrowFactoryV2_3Abi}__ and `functionName` set to `"createSrcEscrow"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 */
export const writeSimplifiedEscrowFactoryV2_3CreateSrcEscrow =
  /*#__PURE__*/ createWriteContract({
    abi: simplifiedEscrowFactoryV2_3Abi,
    address: simplifiedEscrowFactoryV2_3Address,
    functionName: 'createSrcEscrow',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link simplifiedEscrowFactoryV2_3Abi}__ and `functionName` set to `"pause"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 */
export const writeSimplifiedEscrowFactoryV2_3Pause =
  /*#__PURE__*/ createWriteContract({
    abi: simplifiedEscrowFactoryV2_3Abi,
    address: simplifiedEscrowFactoryV2_3Address,
    functionName: 'pause',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link simplifiedEscrowFactoryV2_3Abi}__ and `functionName` set to `"postInteraction"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 */
export const writeSimplifiedEscrowFactoryV2_3PostInteraction =
  /*#__PURE__*/ createWriteContract({
    abi: simplifiedEscrowFactoryV2_3Abi,
    address: simplifiedEscrowFactoryV2_3Address,
    functionName: 'postInteraction',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link simplifiedEscrowFactoryV2_3Abi}__ and `functionName` set to `"removeMaker"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 */
export const writeSimplifiedEscrowFactoryV2_3RemoveMaker =
  /*#__PURE__*/ createWriteContract({
    abi: simplifiedEscrowFactoryV2_3Abi,
    address: simplifiedEscrowFactoryV2_3Address,
    functionName: 'removeMaker',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link simplifiedEscrowFactoryV2_3Abi}__ and `functionName` set to `"removeResolver"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 */
export const writeSimplifiedEscrowFactoryV2_3RemoveResolver =
  /*#__PURE__*/ createWriteContract({
    abi: simplifiedEscrowFactoryV2_3Abi,
    address: simplifiedEscrowFactoryV2_3Address,
    functionName: 'removeResolver',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link simplifiedEscrowFactoryV2_3Abi}__ and `functionName` set to `"setMakerWhitelistEnabled"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 */
export const writeSimplifiedEscrowFactoryV2_3SetMakerWhitelistEnabled =
  /*#__PURE__*/ createWriteContract({
    abi: simplifiedEscrowFactoryV2_3Abi,
    address: simplifiedEscrowFactoryV2_3Address,
    functionName: 'setMakerWhitelistEnabled',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link simplifiedEscrowFactoryV2_3Abi}__ and `functionName` set to `"transferOwnership"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 */
export const writeSimplifiedEscrowFactoryV2_3TransferOwnership =
  /*#__PURE__*/ createWriteContract({
    abi: simplifiedEscrowFactoryV2_3Abi,
    address: simplifiedEscrowFactoryV2_3Address,
    functionName: 'transferOwnership',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link simplifiedEscrowFactoryV2_3Abi}__ and `functionName` set to `"unpause"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 */
export const writeSimplifiedEscrowFactoryV2_3Unpause =
  /*#__PURE__*/ createWriteContract({
    abi: simplifiedEscrowFactoryV2_3Abi,
    address: simplifiedEscrowFactoryV2_3Address,
    functionName: 'unpause',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link simplifiedEscrowFactoryV2_3Abi}__
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 */
export const simulateSimplifiedEscrowFactoryV2_3 =
  /*#__PURE__*/ createSimulateContract({
    abi: simplifiedEscrowFactoryV2_3Abi,
    address: simplifiedEscrowFactoryV2_3Address,
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link simplifiedEscrowFactoryV2_3Abi}__ and `functionName` set to `"addMaker"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 */
export const simulateSimplifiedEscrowFactoryV2_3AddMaker =
  /*#__PURE__*/ createSimulateContract({
    abi: simplifiedEscrowFactoryV2_3Abi,
    address: simplifiedEscrowFactoryV2_3Address,
    functionName: 'addMaker',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link simplifiedEscrowFactoryV2_3Abi}__ and `functionName` set to `"addResolver"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 */
export const simulateSimplifiedEscrowFactoryV2_3AddResolver =
  /*#__PURE__*/ createSimulateContract({
    abi: simplifiedEscrowFactoryV2_3Abi,
    address: simplifiedEscrowFactoryV2_3Address,
    functionName: 'addResolver',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link simplifiedEscrowFactoryV2_3Abi}__ and `functionName` set to `"createDstEscrow"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 */
export const simulateSimplifiedEscrowFactoryV2_3CreateDstEscrow =
  /*#__PURE__*/ createSimulateContract({
    abi: simplifiedEscrowFactoryV2_3Abi,
    address: simplifiedEscrowFactoryV2_3Address,
    functionName: 'createDstEscrow',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link simplifiedEscrowFactoryV2_3Abi}__ and `functionName` set to `"createSrcEscrow"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 */
export const simulateSimplifiedEscrowFactoryV2_3CreateSrcEscrow =
  /*#__PURE__*/ createSimulateContract({
    abi: simplifiedEscrowFactoryV2_3Abi,
    address: simplifiedEscrowFactoryV2_3Address,
    functionName: 'createSrcEscrow',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link simplifiedEscrowFactoryV2_3Abi}__ and `functionName` set to `"pause"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 */
export const simulateSimplifiedEscrowFactoryV2_3Pause =
  /*#__PURE__*/ createSimulateContract({
    abi: simplifiedEscrowFactoryV2_3Abi,
    address: simplifiedEscrowFactoryV2_3Address,
    functionName: 'pause',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link simplifiedEscrowFactoryV2_3Abi}__ and `functionName` set to `"postInteraction"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 */
export const simulateSimplifiedEscrowFactoryV2_3PostInteraction =
  /*#__PURE__*/ createSimulateContract({
    abi: simplifiedEscrowFactoryV2_3Abi,
    address: simplifiedEscrowFactoryV2_3Address,
    functionName: 'postInteraction',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link simplifiedEscrowFactoryV2_3Abi}__ and `functionName` set to `"removeMaker"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 */
export const simulateSimplifiedEscrowFactoryV2_3RemoveMaker =
  /*#__PURE__*/ createSimulateContract({
    abi: simplifiedEscrowFactoryV2_3Abi,
    address: simplifiedEscrowFactoryV2_3Address,
    functionName: 'removeMaker',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link simplifiedEscrowFactoryV2_3Abi}__ and `functionName` set to `"removeResolver"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 */
export const simulateSimplifiedEscrowFactoryV2_3RemoveResolver =
  /*#__PURE__*/ createSimulateContract({
    abi: simplifiedEscrowFactoryV2_3Abi,
    address: simplifiedEscrowFactoryV2_3Address,
    functionName: 'removeResolver',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link simplifiedEscrowFactoryV2_3Abi}__ and `functionName` set to `"setMakerWhitelistEnabled"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 */
export const simulateSimplifiedEscrowFactoryV2_3SetMakerWhitelistEnabled =
  /*#__PURE__*/ createSimulateContract({
    abi: simplifiedEscrowFactoryV2_3Abi,
    address: simplifiedEscrowFactoryV2_3Address,
    functionName: 'setMakerWhitelistEnabled',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link simplifiedEscrowFactoryV2_3Abi}__ and `functionName` set to `"transferOwnership"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 */
export const simulateSimplifiedEscrowFactoryV2_3TransferOwnership =
  /*#__PURE__*/ createSimulateContract({
    abi: simplifiedEscrowFactoryV2_3Abi,
    address: simplifiedEscrowFactoryV2_3Address,
    functionName: 'transferOwnership',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link simplifiedEscrowFactoryV2_3Abi}__ and `functionName` set to `"unpause"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 */
export const simulateSimplifiedEscrowFactoryV2_3Unpause =
  /*#__PURE__*/ createSimulateContract({
    abi: simplifiedEscrowFactoryV2_3Abi,
    address: simplifiedEscrowFactoryV2_3Address,
    functionName: 'unpause',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link simplifiedEscrowFactoryV2_3Abi}__
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 */
export const watchSimplifiedEscrowFactoryV2_3Event =
  /*#__PURE__*/ createWatchContractEvent({
    abi: simplifiedEscrowFactoryV2_3Abi,
    address: simplifiedEscrowFactoryV2_3Address,
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link simplifiedEscrowFactoryV2_3Abi}__ and `eventName` set to `"DstEscrowCreated"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 */
export const watchSimplifiedEscrowFactoryV2_3DstEscrowCreatedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: simplifiedEscrowFactoryV2_3Abi,
    address: simplifiedEscrowFactoryV2_3Address,
    eventName: 'DstEscrowCreated',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link simplifiedEscrowFactoryV2_3Abi}__ and `eventName` set to `"EmergencyPause"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 */
export const watchSimplifiedEscrowFactoryV2_3EmergencyPauseEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: simplifiedEscrowFactoryV2_3Abi,
    address: simplifiedEscrowFactoryV2_3Address,
    eventName: 'EmergencyPause',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link simplifiedEscrowFactoryV2_3Abi}__ and `eventName` set to `"MakerRemoved"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 */
export const watchSimplifiedEscrowFactoryV2_3MakerRemovedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: simplifiedEscrowFactoryV2_3Abi,
    address: simplifiedEscrowFactoryV2_3Address,
    eventName: 'MakerRemoved',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link simplifiedEscrowFactoryV2_3Abi}__ and `eventName` set to `"MakerWhitelisted"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 */
export const watchSimplifiedEscrowFactoryV2_3MakerWhitelistedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: simplifiedEscrowFactoryV2_3Abi,
    address: simplifiedEscrowFactoryV2_3Address,
    eventName: 'MakerWhitelisted',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link simplifiedEscrowFactoryV2_3Abi}__ and `eventName` set to `"OwnershipTransferred"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 */
export const watchSimplifiedEscrowFactoryV2_3OwnershipTransferredEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: simplifiedEscrowFactoryV2_3Abi,
    address: simplifiedEscrowFactoryV2_3Address,
    eventName: 'OwnershipTransferred',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link simplifiedEscrowFactoryV2_3Abi}__ and `eventName` set to `"PostInteractionEscrowCreated"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 */
export const watchSimplifiedEscrowFactoryV2_3PostInteractionEscrowCreatedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: simplifiedEscrowFactoryV2_3Abi,
    address: simplifiedEscrowFactoryV2_3Address,
    eventName: 'PostInteractionEscrowCreated',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link simplifiedEscrowFactoryV2_3Abi}__ and `eventName` set to `"ResolverRemoved"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 */
export const watchSimplifiedEscrowFactoryV2_3ResolverRemovedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: simplifiedEscrowFactoryV2_3Abi,
    address: simplifiedEscrowFactoryV2_3Address,
    eventName: 'ResolverRemoved',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link simplifiedEscrowFactoryV2_3Abi}__ and `eventName` set to `"ResolverWhitelisted"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 */
export const watchSimplifiedEscrowFactoryV2_3ResolverWhitelistedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: simplifiedEscrowFactoryV2_3Abi,
    address: simplifiedEscrowFactoryV2_3Address,
    eventName: 'ResolverWhitelisted',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link simplifiedEscrowFactoryV2_3Abi}__ and `eventName` set to `"SrcEscrowCreated"`
 *
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 */
export const watchSimplifiedEscrowFactoryV2_3SrcEscrowCreatedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: simplifiedEscrowFactoryV2_3Abi,
    address: simplifiedEscrowFactoryV2_3Address,
    eventName: 'SrcEscrowCreated',
  })
